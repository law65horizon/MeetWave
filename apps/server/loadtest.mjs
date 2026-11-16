// loadtest.mjs
// Ramps up participants in one room using real headless Chromium tabs with fake
// camera/mic, and after each step measures how much CPU each mediasoup worker used.
//
// Setup (in your repo):
//   npm i -D playwright
//   npx playwright install chromium
//
// Run (PowerShell example):
//   $env:ROOM_URL="http://localhost:5173/room/loadtest"; node loadtest.mjs
//
// Config via env vars (all optional except ROOM_URL):
//   ROOM_URL       page that joins the room. "{i}" is replaced by the participant number
//                  (use it for a unique display name, NOT in the room id, or each
//                  participant lands in a different room).
//   HEALTH_URL     endpoint returning { workerStats: [{ pid, usage: {...} }] }
//   START, STEP, MAX            participant ramp (default 2, 2, 16)
//   STAGGER_MS     delay between joins (default 400)
//   SETTLE_MS      wait after a step before measuring (default 15000)
//   SAMPLE_MS      measurement window (default 20000)
//   JOIN_SELECTOR  CSS selector of a "Join" button to click, if your UI needs a click
//   TOKEN, TOKEN_KEY   if your app reads an auth token from localStorage
//   STOP_AT_WORKER_PCT / STOP_AT_MACHINE_PCT   safety stops (default 90 / 90)

import { chromium } from "playwright";
import os from "node:os";
import fs from "node:fs";

const env = (k, d) => process.env[k] ?? d;
const ROOM_URL = "http://localhost:5173/meeting/star-dawn-15";
const HEALTH_URL = env("HEALTH_URL", "http://localhost:3001/health");
const START = +env("START", 2);
const STEP = +env("STEP", 2);
const MAX = +env("MAX", 16);
const STAGGER_MS = +env("STAGGER_MS", 400);
const SETTLE_MS = +env("SETTLE_MS", 15000);
const SAMPLE_MS = +env("SAMPLE_MS", 20000);
const JOIN_SELECTOR = env("JOIN_SELECTOR", "");
const TOKEN = env("TOKEN", "");
const TOKEN_KEY = env("TOKEN_KEY", "token");
const STOP_AT_WORKER_PCT = +env("STOP_AT_WORKER_PCT", 90);
const STOP_AT_MACHINE_PCT = +env("STOP_AT_MACHINE_PCT", 90);

if (!ROOM_URL) {
  console.error(
    "Set ROOM_URL, e.g. ROOM_URL=http://localhost:5173/room/loadtest",
  );
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── whole-machine CPU (so we know when the test clients themselves are starving) ──
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.values(c.times)) total += t;
    idle += c.times.idle;
  }
  return { idle, total };
}

// ── per-worker CPU from your health endpoint (cumulative ms → delta → %) ──
async function readWorkers() {
  const res = await fetch(HEALTH_URL);
  if (!res.ok) throw new Error(`health endpoint returned ${res.status}`);
  const j = await res.json();
  return new Map(
    j.workerStats.map((w) => [
      w.pid,
      {
        cpuMs: w.usage.ru_utime + w.usage.ru_stime,
        rssMb: w.usage.ru_maxrss / 1024, // ru_maxrss is KB
      },
    ]),
  );
}

async function measure() {
  const a = await readWorkers();
  const c0 = cpuTimes();
  const t0 = Date.now();
  await sleep(SAMPLE_MS);
  const b = await readWorkers();
  const c1 = cpuTimes();
  const dt = Date.now() - t0;

  const per = [];
  for (const [pid, y] of b) {
    const x = a.get(pid);
    if (!x) continue;
    per.push({ pid, pct: ((y.cpuMs - x.cpuMs) / dt) * 100, rssMb: y.rssMb });
  }
  per.sort((p, q) => q.pct - p.pct);

  const machinePct = 100 * (1 - (c1.idle - c0.idle) / (c1.total - c0.total));
  return { per, machinePct };
}

// ── one participant = one isolated browser context with fake devices ──
async function addParticipant(browser, i) {
  const ctx = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  if (TOKEN) {
    await ctx.addInitScript(
      ([k, v]) => localStorage.setItem(k, v),
      [TOKEN_KEY, TOKEN],
    );
  }
  const page = await ctx.newPage();
  page.on("pageerror", (e) =>
    console.log(`  [p${i}] page error: ${e.message}`),
  );
  await page.goto(ROOM_URL.replaceAll("{i}", String(i)), {
    waitUntil: "domcontentloaded",
  });
  if (JOIN_SELECTOR) await page.click(JOIN_SELECTOR, { timeout: 15000 });
  return { ctx, page, i };
}

// average number of <video> elements actually playing per page (sanity check that
// media is really flowing: roughly N-1 remote videos, or N if self-preview is shown)
async function avgPlayingVideos(parts) {
  let total = 0;
  for (const p of parts) {
    const n = await p.page
      .evaluate(
        () =>
          [...document.querySelectorAll("video")].filter(
            (v) => v.readyState >= 2 && !v.paused && v.videoWidth > 0,
          ).length,
      )
      .catch(() => 0);
    total += n;
  }
  return total / parts.length;
}

// ── main ──
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const parts = [];
const rows = [];
let stopRequested = false;

async function shutdown() {
  stopRequested = true;
  await browser.close().catch(() => {});
}
process.on("SIGINT", async () => {
  console.log("\nStopping...");
  await shutdown();
  process.exit(0);
});

console.log(`Room: ${ROOM_URL}`);
console.log(
  `Ramp: ${START} → ${MAX} step ${STEP}, settle ${SETTLE_MS / 1000}s, sample ${SAMPLE_MS / 1000}s\n`,
);
console.log(
  "people | busiest pid | worker % | per person | marginal/person | other workers | machine % | videos/page | worker RSS",
);
console.log(
  "-------+-------------+----------+------------+-----------------+---------------+-----------+-------------+-----------",
);

let prev = null;
for (let target = START; target <= MAX && !stopRequested; target += STEP) {
  try {
    while (parts.length < target) {
      parts.push(await addParticipant(browser, parts.length + 1));
      await sleep(STAGGER_MS);
    }
  } catch (e) {
    console.log(`Join failed at participant ${parts.length + 1}: ${e.message}`);
    console.log("Check ROOM_URL / JOIN_SELECTOR / TOKEN, then rerun.");
    break;
  }

  await sleep(SETTLE_MS);

  let result;
  try {
    result = await measure();
  } catch (e) {
    console.log(`Could not read ${HEALTH_URL}: ${e.message}`);
    break;
  }

  const { per, machinePct } = result;
  const top = per[0];
  const others = per
    .slice(1)
    .map((w) => w.pct)
    .reduce((s, x) => s + x, 0);
  const vids = await avgPlayingVideos(parts);

  const perPerson = top.pct / parts.length;
  const marginal = prev ? (top.pct - prev.pct) / (parts.length - prev.n) : NaN;

  console.log(
    [
      String(parts.length).padStart(6),
      String(top.pid).padStart(11),
      top.pct.toFixed(1).padStart(8),
      perPerson.toFixed(2).padStart(10),
      (Number.isNaN(marginal) ? "-" : marginal.toFixed(2)).padStart(15),
      others.toFixed(1).padStart(13),
      machinePct.toFixed(0).padStart(9),
      vids.toFixed(1).padStart(11),
      `${top.rssMb.toFixed(0)} MB`.padStart(10),
    ].join(" | "),
  );

  rows.push({
    participants: parts.length,
    pid: top.pid,
    workerPct: top.pct.toFixed(2),
    perPersonPct: perPerson.toFixed(3),
    marginalPct: Number.isNaN(marginal) ? "" : marginal.toFixed(3),
    otherWorkersPct: others.toFixed(2),
    machinePct: machinePct.toFixed(1),
    videosPerPage: vids.toFixed(1),
    rssMb: top.rssMb.toFixed(0),
  });
  prev = { n: parts.length, pct: top.pct };

  if (top.pct >= STOP_AT_WORKER_PCT) {
    console.log(
      `\nWorker ${top.pid} reached ${top.pct.toFixed(0)}% of a core: this room is at the worker's limit.`,
    );
    break;
  }
  if (machinePct >= STOP_AT_MACHINE_PCT) {
    console.log(
      `\nWhole machine is at ${machinePct.toFixed(0)}% CPU. The browsers are starving the server, so numbers past this point are unreliable.` +
        "\nRun the browsers on a second machine and point ROOM_URL at the server's LAN address.",
    );
    break;
  }
}

if (rows.length) {
  const header = Object.keys(rows[0]).join(",");
  fs.writeFileSync(
    "loadtest-results.csv",
    [header, ...rows.map((r) => Object.values(r).join(","))].join("\n"),
  );
  console.log("\nSaved loadtest-results.csv");
}

await shutdown();
