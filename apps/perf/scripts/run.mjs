#!/usr/bin/env node
// Orchestrates a perf run: preflight -> sidecar sampler -> k6 -> HTML report.
//
//   node scripts/run.mjs <smoke|load|stress|soak> [signaling|g2g|all|combined] [options]
//
//   signaling  protocol-level rooms x participants (no browser)        [default with --suite]
//   g2g        real browsers, real media, glass-to-glass
//   all        signaling, then g2g, one after the other                [default]
//   combined   both AT THE SAME TIME: signaling is the background crowd,
//              the g2g browsers are the probes that feel it
//
//   --base-url URL     server under test (default http://127.0.0.1:3001, or $BASE_URL)
//   --out DIR          results directory (default results/<timestamp>-<level>)
//   --no-report        skip the HTML report
// Every other knob is an env var, see levels.js (ROOMS, PER_ROOM, HOLD_SEC, VIDEO_FPS, ...).
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveLevel, LEVELS } from "../levels.js";
import { startSysmon } from "./sysmon.mjs";
import { writeReport } from "./report.mjs";
import { serveHarness } from "../harness/serve.mjs";
// import { BASE_URL as SERVER_URL } from "../k6/lib/env.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf(name);
  if (i === -1) return def;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const has = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};
const BASE_URL = flag("--base-url", "http://16.171.197.100:3001").replace(
  /\/+$/,
  "",
);
const noReport = has("--no-report");
const outArg = flag("--out", null);
const [level, suiteArg = "all"] = argv;

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`);
  process.exit(2);
};
if (!level || !LEVELS.signaling[level])
  die(
    `usage: node scripts/run.mjs <${Object.keys(LEVELS.signaling).join("|")}> [signaling|g2g|all|combined]`,
  );
if (!["signaling", "g2g", "all", "combined"].includes(suiteArg))
  die(`unknown suite "${suiteArg}"`);

const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
const outDir = path.resolve(
  outArg || path.join(root, "results", `${stamp}-${level}`),
);
fs.mkdirSync(outDir, { recursive: true });

// ───────────────────────────── preflight ─────────────────────────────
const k6v = spawnSync("k6", ["version"], { encoding: "utf8" });
if (k6v.error || k6v.status !== 0)
  die(
    "k6 not found on PATH. Install it from https://grafana.com/docs/k6/latest/set-up/install-k6/",
  );
console.log(k6v.stdout.trim().split("\n")[0]);

async function probeHealth() {
  try {
    const r = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    return die(
      `Cannot reach ${BASE_URL}/health (${e.message}).\n  Start the server first. Note it listens on 127.0.0.1 only, so run the tests on the same machine\n  or put a reverse proxy in front and pass --base-url.`,
    );
  }
}
const health = await probeHealth();
if (health.redis !== "connected")
  die("Server is up but Redis is disconnected.");
const patched = !!(health.cpu && health.eventLoop);
console.log(
  `Server OK: ${health.workers} mediasoup workers, redis ${health.redis}`,
);
if (!patched)
  console.log(
    "⚠ /health has no cpu/eventLoop fields. Apply server-patch/health-metrics.patch for Node CPU and event-loop lag.",
  );

// ───────────────────────────── helpers ─────────────────────────────
const baseEnv = {
  ...process.env,
  BASE_URL,
  LEVEL: level,
  SERVER_METRICS: patched ? "1" : "0",
};

function runK6(script, name, extraEnv) {
  const summaryFile = path.join(outDir, `${name}-summary.json`);
  const logFile = fs.createWriteStream(path.join(outDir, `${name}-k6.log`));
  const env = { ...baseEnv, ...extraEnv, SUMMARY_FILE: summaryFile };
  console.log(`\n▶ k6 ${script}  (${name}, level ${level})`);
  const child = spawn(
    "k6",
    ["run", "--quiet", "--no-color", path.join(root, "k6", script)],
    { env, cwd: root },
  );
  let broke = null;
  const onData = (buf) => {
    const s = buf.toString();
    logFile.write(s);
    for (const line of s.split("\n")) {
      if (!line.trim() || /consumer stats|producer stats/.test(line)) continue;
      if (/BREAKING POINT/.test(line)) broke = line;
      // k6 prints its own end-of-test summary via handleSummary on stdout: show everything except noisy level=info lines
      if (/level=(warning|error)/.test(line) || !/^time=/.test(line))
        process.stdout.write(line + "\n");
      else if (/\[(setup|teardown)\]/.test(line))
        process.stdout.write(
          "  " + line.replace(/^.*msg="([^"]*)".*$/, "$1") + "\n",
        );
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", onData);
  return new Promise((resolve) =>
    child.on("close", (code) => {
      logFile.end();
      resolve({ name, code, summaryFile, broke });
    }),
  );
}

function sampler(name) {
  const file = path.join(outDir, `${name}-timeline.csv`);
  let n = 0;
  const s = startSysmon({
    healthUrl: `${BASE_URL}/health`,
    outFile: file,
    onSample: (r) => {
      if (++n % 15 !== 0) return; // one status line every ~30 s
      console.log(
        `  [t=${String(Math.round(r.t_sec)).padStart(4)}s] sockets=${r.sockets ?? "?"} rooms=${r.routers ?? "?"} nodeCPU=${r.node_cpu_pct ?? "?"}% workers=${r.workers_cpu_pct ?? "?"}% loopP99=${r.loop_p99_ms ?? "?"}ms rss=${r.node_rss_mb ?? "?"}MB machineCPU=${r.machine_cpu_pct}%`,
      );
    },
  });
  return { stop: s.stop, file };
}

async function prepareBrowser() {
  const dist = path.join(root, "harness", "dist", "harness.js");
  if (!fs.existsSync(dist)) {
    console.log("Building the browser harness...");
    const b = spawnSync(
      process.execPath,
      [path.join(root, "harness", "build.mjs")],
      { stdio: "inherit" },
    );
    if (b.status !== 0)
      die("Harness build failed. Run `npm install` in apps/perf first.");
  }
  const port = Number(process.env.HARNESS_PORT || 8099);
  let server = null;
  try {
    server = await serveHarness(port);
  } catch (e) {
    if (e.code !== "EADDRINUSE") throw e;
    console.log(
      `Port ${port} already serving: assuming the harness is running.`,
    );
  }
  const env = {
    HARNESS_URL: process.env.HARNESS_URL || `http://127.0.0.1:${port}/`,
    K6_BROWSER_HEADLESS: process.env.K6_BROWSER_HEADLESS || "true",
  };
  if (!process.env.K6_BROWSER_ARGS) {
    const args = [
      "use-fake-ui-for-media-stream",
      "autoplay-policy=no-user-gesture-required",
      "disable-background-timer-throttling",
      "disable-renderer-backgrounding",
      "disable-backgrounding-occluded-windows",
    ];
    // Chrome refuses to start as root without this (typical in containers/CI)
    if (
      (process.getuid && process.getuid() === 0) ||
      process.env.BROWSER_NO_SANDBOX === "1"
    )
      args.push("no-sandbox");
    env.K6_BROWSER_ARGS = args.join(",");
  }
  return { env, close: () => server && server.close() };
}

function finish(result, tl) {
  tl.stop();
  const out = { ...result };
  if (!fs.existsSync(result.summaryFile)) {
    console.log(
      `✗ ${result.name}: k6 produced no summary (exit code ${result.code}). See ${result.name}-k6.log`,
    );
    return out;
  }
  if (!noReport) {
    const report = writeReport({
      summaryFile: result.summaryFile,
      timelineFile: tl.file,
      outFile: path.join(outDir, `${result.name}-report.html`),
      title: `meetapp ${result.name} · ${level}`,
    });
    console.log(`📄 report: ${report}`);
  }
  return out;
}

// ───────────────────────────── run ─────────────────────────────
const results = [];
const want =
  suiteArg === "all"
    ? ["signaling", "g2g"]
    : suiteArg === "combined"
      ? ["combined"]
      : [suiteArg];
let browser = null;

try {
  for (const w of want) {
    if (w === "signaling") {
      const tl = sampler("signaling");
      results.push(finish(await runK6("signaling.js", "signaling", {}), tl));
    } else if (w === "g2g") {
      browser ||= await prepareBrowser();
      const tl = sampler("g2g");
      results.push(finish(await runK6("g2g.js", "g2g", browser.env), tl));
    } else {
      // combined: one shared timeline, two k6 processes
      browser ||= await prepareBrowser();
      const tl = sampler("combined");
      const [a, b] = await Promise.all([
        runK6("signaling.js", "combined-signaling", {}),
        runK6("g2g.js", "combined-g2g", browser.env),
      ]);
      tl.stop();
      for (const r of [a, b]) {
        const fin = finish(r, { stop() {}, file: tl.file });
        results.push(fin);
      }
    }
  }
} finally {
  if (browser) browser.close();
}

console.log("\n══════════ run complete ══════════");
for (const r of results) {
  let verdict = `exit ${r.code}`;
  try {
    verdict = JSON.parse(fs.readFileSync(r.summaryFile, "utf8")).verdict;
  } catch (_) {
    /* no summary */
  }
  console.log(
    `  ${r.name.padEnd(20)} ${verdict}${r.broke ? "  (stopped at breaking point)" : ""}`,
  );
}
console.log(`  results: ${outDir}`);
// k6 exits 99 when thresholds fail; surface that to CI. A stress run that found the breaking point is a result, not an error.
const bad = results.some(
  (r) => r.code !== 0 && !r.broke && !(level === "stress" && r.code === 99),
);
process.exit(bad ? 1 : 0);
