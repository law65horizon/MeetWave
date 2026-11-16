// Glass-to-glass test: real Chromium browsers, real WebRTC media through the real SFU.
//
// One k6 VU = one browser tab = `peersPerPage` participants (default 1). Rooms start
// `rampEverySec` apart; every participant publishes a synthetic camera (canvas with a timestamp
// barcode) + a tone, and receives everyone else. Each received frame is decoded in the page at
// presentation time, giving true glass-to-glass latency plus WebRTC stats (fps, jitter, loss,
// freezes, jitter-buffer delay, sender CPU/bandwidth limiting).
//
// Needs: k6 with the browser module, Chromium/Chrome, and harness/dist (npm run build:harness)
// served over HTTP (scripts/run.mjs does all of this for you).
//
//   k6 run -e LEVEL=smoke -e HARNESS_URL=http://127.0.0.1:8099/ k6/g2g.js
import exec from "k6/execution";
import { browser } from "k6/browser";
import { Trend, Rate, Counter } from "k6/metrics";
import { resolveLevel, stageLabel } from "../levels.js";
import { createRooms, endRooms } from "./lib/rooms.js";
import { makeHealthPoller } from "./lib/health.js";
import { BASE_URL, SERVER_METRICS, CLEANUP, HEALTH_POLL_SEC, SUMMARY_FILE } from "./lib/env.js";
import { buildSummary, curveThresholds } from "./lib/summary.js";

const LEVEL = __ENV.LEVEL || "smoke";
const cfg = resolveLevel("g2g", LEVEL, __ENV);
const HARNESS_URL = __ENV.HARNESS_URL || "http://127.0.0.1:8099/";
// URL the *browser* uses to reach the server (differs from BASE_URL if k6 runs elsewhere).
const BROWSER_SERVER_URL = (__ENV.BROWSER_SERVER_URL || BASE_URL).replace(/\/+$/, "");

// ───────────────────────────── metrics ─────────────────────────────
const g2g = new Trend("g2g_latency_ms", true); // sender draws frame -> receiver presents it
const g2gPeak = new Trend("g2g_peak_ms", true); // worst frame per stream per 2 s window
const firstFrame = new Trend("time_to_first_frame_ms", true);
const connectMs = new Trend("webrtc_connect_ms", true); // transport created -> ICE+DTLS connected
const joinMs = new Trend("room_join_ms", true);
const rttMs = new Trend("rtt_ms", true);
const jitterMs = new Trend("jitter_ms", true);
const jbMs = new Trend("jitter_buffer_ms", true);
const decodeMs = new Trend("decode_ms", true);
const fpsIn = new Trend("video_fps_in");
const kbpsIn = new Trend("video_bitrate_in_kbps");
const kbpsOut = new Trend("video_bitrate_out_kbps");
const freezes = new Counter("video_freezes");
const stalls = new Counter("frame_stalls");
const lost = new Counter("packets_lost");
const dropped = new Counter("frames_dropped");
const limCpu = new Counter("quality_limited_cpu");
const limBw = new Counter("quality_limited_bw");
const decodeErrors = new Counter("g2g_decode_errors");
const errors = new Counter("errors");
const streamOk = new Rate("stream_ok");
const peerOk = new Rate("peer_ok");

const CURVE = {
  g2g_latency_ms: "trend",
  video_fps_in: "trend",
  stream_ok: "rate",
  peer_ok: "rate",
  video_freezes: "counter",
  quality_limited_cpu: "counter",
  server_node_cpu_pct: "trend",
  server_workers_cpu_pct_total: "trend",
  server_worker_cpu_pct_max: "trend",
  server_event_loop_p99_ms: "trend",
  server_node_rss_mb: "trend",
  server_sockets: "trend",
  health_latency_ms: "trend",
};

// ───────────────────────────── scenarios ─────────────────────────────
const scenarios = {
  health: { executor: "constant-vus", vus: 1, duration: `${cfg.totalSec + 10}s`, exec: "health", gracefulStop: "5s" },
};
for (let r = 1; r <= cfg.rooms; r++) {
  scenarios[`room_${r}`] = {
    executor: "per-vu-iterations",
    vus: cfg.perRoom,
    iterations: 1,
    startTime: `${(r - 1) * cfg.rampEverySec}s`,
    maxDuration: `${cfg.totalSec - (r - 1) * cfg.rampEverySec + 120}s`,
    gracefulStop: "30s",
    exec: "peer",
    options: { browser: { type: "chromium" } },
  };
}

export const options = {
  scenarios,
  thresholds: {
    ...cfg.thresholds,
    // 5% of fps samples must stay above this share of the configured frame rate
    ...(cfg.minFpsRatio > 0 ? { video_fps_in: [`p(5)>${Math.round(cfg.video.fps * cfg.minFpsRatio)}`] } : {}),
    ...(SERVER_METRICS ? cfg.serverThresholds : {}),
    ...curveThresholds(cfg, CURVE),
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"].concat(["p(5)"]),
  setupTimeout: "120s",
  teardownTimeout: "120s",
};

const testElapsedSec = () => exec.instance.currentTestRunDuration / 1000;
const activeRooms = () => (cfg.rampEverySec > 0 ? Math.min(cfg.rooms, Math.floor(testElapsedSec() / cfg.rampEverySec) + 1) : cfg.rooms);
const tagsNow = () => ({ stage: stageLabel(activeRooms()) });

export function setup() {
  const rooms = createRooms(BASE_URL, cfg.rooms, Math.max(50, cfg.perRoom * cfg.peersPerPage + 5));
  console.log(`[setup] ${rooms.length} rooms, ${cfg.perRoom} browsers/room x ${cfg.peersPerPage} peers, ${cfg.video.w}x${cfg.video.h}@${cfg.video.fps}fps`);
  return { rooms };
}

export const health = makeHealthPoller({ baseUrl: BASE_URL, intervalSec: HEALTH_POLL_SEC, tags: tagsNow, guard: cfg.guard });

function record(d) {
  const t = tagsNow();
  for (const x of d.g2g) g2g.add(x, t);
  for (const x of d.peaks) g2gPeak.add(x, t);
  for (const x of d.firstFrameMs) firstFrame.add(x, t);
  for (const x of d.webrtcConnectMs) connectMs.add(x, t);
  for (const x of d.joinMs) joinMs.add(x, t);
  for (const x of d.rttMs) rttMs.add(x, t);
  for (const x of d.jitterMs) jitterMs.add(x, t);
  for (const x of d.jbMs) jbMs.add(x, t);
  for (const x of d.decodeMs) decodeMs.add(x, t);
  for (const x of d.fps) fpsIn.add(x, t);
  for (const x of d.inKbps) kbpsIn.add(x, t);
  for (const x of d.outKbps) kbpsOut.add(x, t);
  for (const x of d.streamOk) streamOk.add(x, t);
  for (const x of d.peerOk) peerOk.add(x, t);
  freezes.add(d.freezes, t);
  stalls.add(d.stalls, t);
  lost.add(d.packetsLost, t);
  dropped.add(d.framesDropped, t);
  limCpu.add(d.limitedCpu, t);
  limBw.add(d.limitedBw, t);
  decodeErrors.add(d.decodeErrors, t);
  for (const e of d.errors) {
    errors.add(1, { stage: t.stage });
    console.warn(`[page error] ${e}`);
  }
}

export async function peer(data) {
  const roomIdx = Number(exec.scenario.name.split("_")[1]) - 1;
  const room = data.rooms[roomIdx];
  const endAtSec = cfg.totalSec; // all rooms stop together, measured on the test clock
  const page = await browser.newPage();
  page.setDefaultTimeout(180000);
  page.on("console", (m) => {
    if (m.type() === "error") console.warn(`[browser console] ${m.text().slice(0, 200)}`);
  });
  try {
    await page.goto(HARNESS_URL, { waitUntil: "load" });
    const started = await page.evaluate(
      (c) => window.__perf.start(c),
      {
        serverUrl: BROWSER_SERVER_URL,
        roomId: room.roomId,
        namePrefix: `g2g-r${roomIdx + 1}`,
        peers: cfg.peersPerPage,
        video: cfg.video,
        sampleHz: 5,
        debug: __ENV.HARNESS_DEBUG === "1",
      },
    );
    if (started.failed > 0) console.warn(`[room ${roomIdx + 1}] ${started.failed}/${cfg.peersPerPage} peers failed to start`);

    while (testElapsedSec() < endAtSec) {
      await page.waitForTimeout(2000);
      record(await page.evaluate(() => window.__perf.drain()));
    }
    record(await page.evaluate(() => window.__perf.drain()));
  } catch (e) {
    errors.add(1, { stage: tagsNow().stage });
    peerOk.add(false, tagsNow());
    console.error(`[room ${roomIdx + 1}] ${e && e.message ? e.message : e}`);
  } finally {
    try {
      await page.evaluate(() => window.__perf.stop());
    } catch (_) {
      /* page may be gone */
    }
    await page.close();
  }
}

export async function teardown(data) {
  if (!CLEANUP) return;
  const n = await endRooms(BASE_URL, data.rooms);
  console.log(`[teardown] ended ${n}/${data.rooms.length} rooms`);
}

export function handleSummary(data) {
  const { text, json } = buildSummary(data, { cfg, curve: CURVE });
  return { stdout: text, [SUMMARY_FILE]: JSON.stringify(json, null, 2) };
}
