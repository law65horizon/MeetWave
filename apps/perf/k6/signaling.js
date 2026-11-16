// Protocol-level load test: many rooms x many participants, no browser.
//
// Every participant is a k6 VU that behaves like the real client at the signaling level:
//   connect -> room:join -> create send+recv transports -> produce audio+video ->
//   consume every other participant's audio+video -> chat / time:sync / heartbeat /
//   audio:level traffic -> leave (half the time cleanly, half by dropping the socket).
//
// What this exercises on the server: Socket.IO + Redis adapter fan-out, Redis, and mediasoup
// *control plane* (routers, WebRtcTransports, producers, consumers, their stats timers).
// What it cannot exercise: RTP forwarding, which needs a real WebRTC stack. Use g2g.js for that.
//
//   k6 run -e LEVEL=smoke k6/signaling.js      (or: node scripts/run.mjs smoke signaling)
import exec from "k6/execution";
import { Trend, Rate, Counter } from "k6/metrics";
import { resolveLevel, presenceIntervals, stageAt, stageLabel } from "../levels.js";
import { SioClient } from "./lib/sio.js";
import { createRooms, endRooms } from "./lib/rooms.js";
import { makeHealthPoller } from "./lib/health.js";
import { BASE_URL, SERVER_METRICS, CLEANUP, HEALTH_POLL_SEC, SUMMARY_FILE } from "./lib/env.js";
import { buildSummary, curveThresholds } from "./lib/summary.js";

const LEVEL = __ENV.LEVEL || "smoke";
const cfg = resolveLevel("signaling", LEVEL, __ENV);

// ───────────────────────────── metrics ─────────────────────────────
const sioConnect = new Trend("sio_connect_ms", true); // WS open + Socket.IO handshake (auth middleware, Redis lookups)
const roomJoin = new Trend("room_join_ms", true); // room:join ack
const joinSuccess = new Rate("join_success"); // connected AND joined
const transportCreate = new Trend("transport_create_ms", true);
const produceMs = new Trend("produce_ms", true);
const consumeMs = new Trend("consume_ms", true); // consume + consumer:resume
const mediaSetup = new Trend("media_setup_ms", true); // join ack -> own producers up + initial consumers resumed
const mediaSuccess = new Rate("media_success");
const chatAck = new Trend("chat_ack_ms", true); // chat:send round trip (Redis write + broadcast)
const chatDelivery = new Trend("chat_delivery_ms", true); // sender timestamp -> receiver handler: full fan-out latency
const timeSyncRtt = new Trend("time_sync_rtt_ms", true); // bare Socket.IO round trip: event-loop health probe
const sessionDropped = new Rate("session_dropped"); // server closed us mid-session
const errors = new Counter("errors");

// metric name -> kind; each gets a per-plateau sub-metric for the capacity curve
const CURVE = {
  join_success: "rate",
  session_dropped: "rate",
  sio_connect_ms: "trend",
  room_join_ms: "trend",
  media_setup_ms: "trend",
  chat_delivery_ms: "trend",
  time_sync_rtt_ms: "trend",
  health_latency_ms: "trend",
  server_node_cpu_pct: "trend",
  server_workers_cpu_pct_total: "trend",
  server_worker_cpu_pct_max: "trend",
  server_event_loop_p99_ms: "trend",
  server_node_rss_mb: "trend",
  server_sockets: "trend",
  errors: "counter",
};

export const options = {
  scenarios: {
    participants: {
      executor: "per-vu-iterations", // exactly one iteration per VU; the script runs its own schedule
      vus: cfg.maxParticipants,
      iterations: 1,
      maxDuration: `${cfg.totalSec + 180}s`,
      gracefulStop: "30s",
      exec: "participant",
    },
    health: {
      executor: "constant-vus",
      vus: 1,
      duration: `${cfg.totalSec + 5}s`,
      gracefulStop: "5s",
      exec: "health",
    },
  },
  thresholds: {
    ...cfg.thresholds,
    ...(SERVER_METRICS ? cfg.serverThresholds : {}),
    ...curveThresholds(cfg, CURVE),
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  setupTimeout: "180s",
  teardownTimeout: "180s",
};

// ───────────────────────────── helpers ─────────────────────────────
const elapsedSec = () => (Date.now() - exec.scenario.startTime) / 1000;
const tagsNow = () => ({ stage: stageLabel(stageAt(cfg.stages, elapsedSec()).index) });
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const rtpFor = (kind, ssrc) =>
  kind === "audio"
    ? {
        codecs: [{ mimeType: "audio/opus", payloadType: 111, clockRate: 48000, channels: 2, parameters: { minptime: 10, useinbandfec: 1 } }],
        encodings: [{ ssrc }],
        rtcp: { cname: "perf", reducedSize: true },
      }
    : {
        codecs: [
          {
            mimeType: "video/VP8",
            payloadType: 96,
            clockRate: 90000,
            rtcpFeedback: [{ type: "nack" }, { type: "nack", parameter: "pli" }, { type: "ccm", parameter: "fir" }, { type: "goog-remb" }],
          },
        ],
        encodings: [{ ssrc }],
        rtcp: { cname: "perf", reducedSize: true },
      };
const randSsrc = () => 1 + Math.floor(Math.random() * 4294967293);

// ───────────────────────────── scenarios ─────────────────────────────
export function setup() {
  const rooms = createRooms(BASE_URL, cfg.maxRooms, Math.max(50, cfg.perRoom * 3));
  console.log(`[setup] ${rooms.length} rooms created, ${cfg.maxParticipants} participants planned (${cfg.perRoom}/room), media=${cfg.media}`);
  return { rooms };
}

export const health = makeHealthPoller({
  baseUrl: BASE_URL,
  intervalSec: HEALTH_POLL_SEC,
  tags: tagsNow,
  guard: cfg.guard,
});

export async function participant(data) {
  const rank = exec.scenario.iterationInInstance; // 0..maxParticipants-1, unique and stable
  const room = data.rooms[Math.floor(rank / cfg.perRoom)];
  for (const [from, to] of presenceIntervals(cfg.stages, cfg.perRoom, rank)) {
    const wait = from - elapsedSec();
    if (wait > 0) await sleepMs(wait * 1000);
    while (to - elapsedSec() > 3) {
      const len = Math.min(cfg.sessionSec * (0.75 + Math.random() * 0.5), to - elapsedSec());
      const ok = await runSession(room, rank, len);
      if (!ok) await sleepMs(1000 + Math.random() * 2000); // client-style reconnect backoff
    }
    const rest = to - elapsedSec();
    if (rest > 0) await sleepMs(rest * 1000);
  }
}

/** One participant session. Returns false when it failed or was dropped. */
async function runSession(room, rank, lenSec) {
  const sio = new SioClient(BASE_URL, { roomId: room.roomId, displayName: `perf-${rank}` });
  let ending = false;
  let dropped = false;
  let wake = () => {};
  const timers = [];
  const stopTimers = () => timers.forEach((t) => clearInterval(t));

  sio.onclose = () => {
    if (!ending) {
      dropped = true;
      wake();
    }
  };

  // ── connect ──
  const t0 = Date.now();
  try {
    await sio.connect();
  } catch (e) {
    joinSuccess.add(false, tagsNow());
    errors.add(1, { type: "connect", reason: String(e.message).slice(0, 40) });
    return false;
  }
  sioConnect.add(Date.now() - t0, tagsNow());

  // ── event handlers (registered before join so nothing is missed) ──
  const consumed = new Set();
  let mediaReady = false;
  const pendingProducers = [];
  let consumeChain = Promise.resolve();
  let rtpCaps = null;

  const consumeOne = async (p) => {
    if (!p || !p.producerId || consumed.has(p.producerId) || p.socketId === sio.sid) return;
    consumed.add(p.producerId);
    const t = Date.now();
    const c = await sio.request("consume", { producerId: p.producerId, rtpCapabilities: rtpCaps });
    if (!c || c.error) throw new Error("consume:" + (c && c.error));
    const r = await sio.request("consumer:resume", { consumerId: c.params.id });
    if (r && r.error) throw new Error("resume:" + r.error);
    consumeMs.add(Date.now() - t, tagsNow());
  };

  sio.on("new:producer", (p) => {
    if (!cfg.media) return;
    if (!mediaReady) return void pendingProducers.push(p);
    consumeChain = consumeChain.then(() => consumeOne(p)).catch((e) => errors.add(1, { type: "consume", reason: String(e.message).slice(0, 40) }));
  });
  sio.on("chat:message", (m) => {
    const text = m && typeof m.text === "string" ? m.text : "";
    if (text.charCodeAt(0) !== 112 || !text.startsWith("perf|")) return; // 'p'
    const d = Date.now() - Number(text.split("|")[1]);
    if (d >= 0 && d < 60000) chatDelivery.add(d, tagsNow());
  });

  // ── join ──
  const tj = Date.now();
  let join;
  try {
    join = await sio.request("room:join", {});
  } catch (e) {
    join = { error: e.message };
  }
  if (!join || join.error) {
    joinSuccess.add(false, tagsNow());
    errors.add(1, { type: "join", reason: String((join && join.error) || "?").slice(0, 40) });
    ending = true;
    sio.close();
    return false;
  }
  roomJoin.add(Date.now() - tj, tagsNow());
  joinSuccess.add(true, tagsNow());
  rtpCaps = join.rtpCapabilities;

  // ── media control plane ──
  if (cfg.media) {
    const tm = Date.now();
    try {
      const [send, recv] = await Promise.all([
        sio.request("transport:create", { direction: "send" }),
        sio.request("transport:create", { direction: "recv" }),
      ]);
      if (!send || send.error || !recv || recv.error) throw new Error("transport:" + ((send && send.error) || (recv && recv.error)));
      transportCreate.add(Date.now() - tm, tagsNow());

      for (const kind of ["audio", "video"]) {
        const tp = Date.now();
        const pr = await sio.request("produce", { transportId: send.params.id, kind, rtpParameters: rtpFor(kind, randSsrc()), appData: {} });
        if (!pr || pr.error) throw new Error("produce:" + (pr && pr.error));
        produceMs.add(Date.now() - tp, tagsNow());
      }
      for (const p of (join.producers || []).concat(pendingProducers)) await consumeOne(p);
      pendingProducers.length = 0;
      mediaReady = true;
      mediaSetup.add(Date.now() - tm, tagsNow());
      mediaSuccess.add(true, tagsNow());
    } catch (e) {
      mediaSuccess.add(false, tagsNow());
      errors.add(1, { type: "media", reason: String(e.message).slice(0, 40) });
      mediaReady = true; // keep the session going; later producers are best effort
    }
  }

  // ── steady-state traffic ──
  const every = (sec, fn) => {
    // random phase so 1000 participants do not all fire on the same tick
    const start = setTimeout(() => timers.push(setInterval(fn, sec * 1000)), Math.random() * sec * 1000);
    timers.push(start);
  };
  if (cfg.chatEverySec > 0) {
    every(cfg.chatEverySec, async () => {
      const t = Date.now();
      try {
        const r = await sio.request("chat:send", { text: `perf|${t}|${rank}` });
        if (r && r.error) throw new Error(r.error);
        chatAck.add(Date.now() - t, tagsNow());
      } catch (e) {
        errors.add(1, { type: "chat", reason: String(e.message).slice(0, 40) });
      }
    });
  }
  if (cfg.syncEverySec > 0) {
    every(cfg.syncEverySec, async () => {
      const t = Date.now();
      try {
        await sio.request("time:sync", { t0: t });
        timeSyncRtt.add(Date.now() - t, tagsNow());
      } catch (_) {
        /* counted by session_dropped / acks timing out */
      }
    });
  }
  every(10, () => sio.emit("heartbeat"));
  if (cfg.audioLevelHz > 0) every(1 / cfg.audioLevelHz, () => sio.emit("audio:level", { level: Math.floor(Math.random() * 100) }));

  await new Promise((resolve) => {
    wake = resolve;
    timers.push(setTimeout(resolve, lenSec * 1000));
  });

  // ── leave: half clean, half abrupt (tab closed) ──
  ending = true;
  stopTimers();
  sessionDropped.add(dropped, tagsNow());
  if (!dropped) {
    if (Math.random() < 0.5) sio.emit("room:leave");
    await new Promise((resolve) => {
      const prev = sio.onclose;
      sio.onclose = () => {
        prev && prev();
        resolve();
      };
      sio.close();
      setTimeout(resolve, 2000);
    });
  }
  return !dropped;
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
