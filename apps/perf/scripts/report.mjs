// Builds a self-contained HTML report from a k6 summary JSON + the sidecar timeline CSV.
//   node scripts/report.mjs results/<run-dir>          (regenerates every report in that dir)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTimeline } from "./sysmon.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const f = (x, d = 1) => (typeof x !== "number" || Number.isNaN(x) ? "–" : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(d));
const col = (rows, k) => rows.map((r) => r[k]).filter((x) => x !== null && x !== undefined);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const max = (a) => (a.length ? Math.max(...a) : NaN);

/** Least-squares slope of y over x. */
function slope(xs, ys) {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = avg(xs);
  const my = avg(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : NaN;
}

function lineChart({ title, unit, series, refLine, height = 190 }) {
  const W = 760;
  const pad = { l: 52, r: 14, t: 26, b: 28 };
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return `<div class="chart"><h3>${esc(title)}</h3><p class="muted">no data</p></div>`;
  const xmax = Math.max(...pts.map((p) => p[0])) || 1;
  let ymax = Math.max(...pts.map((p) => p[1]), refLine ? refLine.y : 0) || 1;
  ymax *= 1.1;
  const X = (x) => pad.l + (x / xmax) * (W - pad.l - pad.r);
  const Y = (y) => height - pad.b - (y / ymax) * (height - pad.t - pad.b);
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const y = (ymax / 4) * i;
    g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(y)}" y2="${Y(y)}" class="grid"/><text x="${pad.l - 6}" y="${Y(y) + 4}" class="tick" text-anchor="end">${f(y, 0)}</text>`;
  }
  const mins = xmax / 60;
  const step = mins > 20 ? 5 : mins > 8 ? 2 : mins > 3 ? 1 : 0.5;
  for (let m = 0; m <= mins; m += step) g += `<text x="${X(m * 60)}" y="${height - 8}" class="tick" text-anchor="middle">${m}m</text>`;
  if (refLine) g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(refLine.y)}" y2="${Y(refLine.y)}" class="ref"/><text x="${W - pad.r}" y="${Y(refLine.y) - 4}" class="tick" text-anchor="end">${esc(refLine.label)}</text>`;
  const lines = series
    .map((s) => `<polyline fill="none" stroke="${s.color}" stroke-width="1.8" points="${s.points.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ")}"/>`)
    .join("");
  const legend = series.map((s, i) => `<text x="${pad.l + 8 + i * 170}" y="14" class="leg" fill="${s.color}">● ${esc(s.name)}</text>`).join("");
  return `<div class="chart"><h3>${esc(title)} <span class="muted">${esc(unit || "")}</span></h3><svg viewBox="0 0 ${W} ${height}" width="100%">${g}${lines}${legend}</svg></div>`;
}

export function buildReport({ summary, timeline, title }) {
  const S = summary;
  const m = S.metrics || {};
  const rows = timeline || [];
  const pts = (k) => rows.filter((r) => r[k] !== null).map((r) => [r.t_sec, r[k]]);
  const warnings = [];

  // ── derived capacity numbers ──
  const peakSockets = max(col(rows, "sockets"));
  const peakRooms = max(col(rows, "routers"));
  const plateau = rows.filter((r) => r.sockets !== null && r.sockets >= peakSockets * 0.9 && peakSockets > 0);
  const idleRss = Math.min(...col(rows.slice(0, 3), "node_rss_mb"));
  const peakRss = max(col(rows, "node_rss_mb"));
  const cpuAtPeak = avg(col(plateau, "node_cpu_pct"));
  const wAtPeak = avg(col(plateau, "workers_cpu_pct"));
  const derived = [];
  if (peakSockets > 0) {
    derived.push(["Peak concurrent participants (server view)", f(peakSockets, 0)]);
    derived.push(["Peak concurrent rooms (active routers)", f(peakRooms, 0)]);
    if (Number.isFinite(cpuAtPeak)) derived.push([`Node CPU per participant (at plateau, ${plateau.length} samples)`, `${f(cpuAtPeak / peakSockets, 2)} % of a core`]);
    if (Number.isFinite(wAtPeak)) derived.push(["mediasoup workers CPU per participant (at plateau)", `${f(wAtPeak / peakSockets, 3)} % of a core`]);
    if (Number.isFinite(idleRss)) derived.push(["Node RAM per participant (peak RSS − idle RSS)", `${f((peakRss - idleRss) / peakSockets, 2)} MB`]);
  }
  if (plateau.length >= 8) {
    const t0 = plateau[0].t_sec;
    const sl = slope(plateau.map((r) => (r.t_sec - t0) / 60), plateau.map((r) => r.node_rss_mb));
    if (Number.isFinite(sl)) {
      derived.push(["Node RSS trend during the plateau", `${sl >= 0 ? "+" : ""}${f(sl, 2)} MB/min`]);
      if (sl > 1 && (plateau.at(-1).t_sec - t0) / 60 > 5) warnings.push(`Node RSS keeps growing at ${f(sl, 1)} MB/min while load is flat: possible leak. Confirm with the soak level.`);
    }
  }

  // ── warnings ──
  const hot = col(rows, "machine_cpu_pct").filter((x) => x > 85).length;
  if (rows.length && hot / rows.length > 0.1) {
    warnings.push(`The load-generator machine was above 85% CPU for ${f((100 * hot) / rows.length, 0)}% of the run. If k6/browsers share a machine with the server, they steal CPU from it and results are pessimistic. Run the generators on another machine.`);
  }
  if (S.brokeServer) warnings.push("The run stopped itself: the server hit its breaking point (event-loop lag or /health latency). The last plateau in the capacity curve is the first one to look at.");
  if (m.quality_limited_cpu && m.quality_limited_cpu.count > 0) warnings.push(`Browser senders were CPU-limited ${m.quality_limited_cpu.count} times: the test machine, not the server, was the bottleneck for video quality.`);
  if (m.g2g_decode_errors && m.g2g_latency_ms && m.g2g_decode_errors.count > 0.1 * (m.g2g_latency_ms.count || 1)) warnings.push("Many barcode decode errors: frames were heavily degraded (low bitrate/resolution) so latency samples are sparse.");
  if (!rows.some((r) => r.node_cpu_pct !== null)) warnings.push("Node CPU and event-loop lag are missing: apply server-patch/health-metrics.patch to the server.");

  // ── headline cards ──
  const card = (label, value, sub) => `<div class="card"><div class="v">${value}</div><div class="l">${esc(label)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ""}</div>`;
  const cards = [];
  cards.push(card("result", `<span class="${S.verdict === "PASS" ? "ok" : "bad"}">${S.verdict}</span>`, `${S.thresholds.filter((t) => t.ok).length}/${S.thresholds.length} thresholds`));
  if (Number.isFinite(peakSockets) && peakSockets > 0) cards.push(card("peak participants", f(peakSockets, 0), `${f(peakRooms, 0)} rooms`));
  if (m.g2g_latency_ms) cards.push(card("glass-to-glass p50 / p95", `${f(m.g2g_latency_ms.med)} / ${f(m.g2g_latency_ms["p(95)"])} ms`, `p99 ${f(m.g2g_latency_ms["p(99)"])} ms`));
  if (m.chat_delivery_ms) cards.push(card("chat fan-out p95", `${f(m.chat_delivery_ms["p(95)"])} ms`, `time:sync p95 ${f((m.time_sync_rtt_ms || {})["p(95)"])} ms`));
  if (m.room_join_ms) cards.push(card("room:join p95", `${f(m.room_join_ms["p(95)"])} ms`));
  if (rows.some((r) => r.node_cpu_pct !== null)) cards.push(card("Node CPU avg / max", `${f(avg(col(rows, "node_cpu_pct")))} / ${f(max(col(rows, "node_cpu_pct")))} %`, "of one core"));
  cards.push(card("workers CPU max", `${f(max(col(rows, "workers_cpu_pct")))} %`, `hottest worker ${f(max(col(rows, "worker_cpu_max_pct")))} %`));
  cards.push(card("RAM peak", `${f(peakRss, 0)} MB`, `workers ${f(max(col(rows, "workers_peak_rss_mb")), 0)} MB (peak)`));

  // ── charts ──
  const charts = [
    lineChart({ title: "Concurrency (server view)", unit: "count", series: [{ name: "sockets", color: "#2563eb", points: pts("sockets") }, { name: "rooms (routers)", color: "#16a34a", points: pts("routers") }] }),
    lineChart({ title: "Server CPU", unit: "% of one core", series: [{ name: "Node main thread", color: "#dc2626", points: pts("node_cpu_pct") }, { name: "mediasoup workers (sum)", color: "#9333ea", points: pts("workers_cpu_pct") }, { name: "hottest worker", color: "#f59e0b", points: pts("worker_cpu_max_pct") }], refLine: { y: 100, label: "1 core" } }),
    lineChart({ title: "Server memory", unit: "MB", series: [{ name: "Node RSS", color: "#2563eb", points: pts("node_rss_mb") }, { name: "Node heap used", color: "#0891b2", points: pts("node_heap_mb") }, { name: "workers peak RSS (sum)", color: "#9333ea", points: pts("workers_peak_rss_mb") }] }),
    lineChart({ title: "Event-loop delay p99 and /health latency", unit: "ms", series: [{ name: "loop p99", color: "#dc2626", points: pts("loop_p99_ms") }, { name: "/health", color: "#64748b", points: pts("health_ms") }] }),
    lineChart({ title: "Load-generator machine", unit: "%", series: [{ name: "CPU", color: "#0f766e", points: pts("machine_cpu_pct") }, { name: "memory", color: "#a16207", points: pts("machine_mem_pct") }], refLine: { y: 85, label: "85% = unreliable" } }),
  ].join("");

  // ── tables ──
  const latNames = [
    ["g2g_latency_ms", "Glass-to-glass"], ["g2g_peak_ms", "G2G worst frame / 2 s"], ["time_to_first_frame_ms", "Time to first frame"], ["webrtc_connect_ms", "WebRTC connect"],
    ["sio_connect_ms", "Socket.IO connect"], ["room_join_ms", "room:join"], ["chat_delivery_ms", "Chat delivery (fan-out)"], ["chat_ack_ms", "Chat ack"], ["time_sync_rtt_ms", "time:sync RTT"],
    ["transport_create_ms", "transport:create"], ["produce_ms", "produce"], ["consume_ms", "consume + resume"], ["media_setup_ms", "Media setup"],
    ["rtt_ms", "ICE RTT"], ["jitter_ms", "Jitter"], ["jitter_buffer_ms", "Jitter-buffer delay"], ["decode_ms", "Decode / frame"], ["video_fps_in", "Video fps in"], ["video_bitrate_in_kbps", "Video kbps in"], ["health_latency_ms", "GET /health"],
  ].filter(([k]) => m[k] && m[k].max !== undefined);
  const latTable = `<table><tr><th>metric</th><th>avg</th><th>p50</th><th>p95</th><th>p99</th><th>max</th></tr>${latNames
    .map(([k, n]) => `<tr><td>${n}</td>${[m[k].avg, m[k].med, m[k]["p(95)"], m[k]["p(99)"], m[k].max].map((x) => `<td>${f(x)}</td>`).join("")}</tr>`)
    .join("")}</table>`;
  const cur = S.curve && S.curve.rows && S.curve.rows.length > 1
    ? `<h2>Capacity curve</h2><p class="muted">One row per steady plateau. Read down the table to see where latency or CPU starts to climb faster than the load.</p><table><tr><th>rooms</th><th>participants</th>${S.curve.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${S.curve.rows
        .map((r) => `<tr><td>${r.rooms}</td><td>${r.participants}</td>${r.cells.map((c) => `<td>${f(c)}</td>`).join("")}</tr>`)
        .join("")}</table>`
    : "";
  const thr = `<table><tr><th></th><th>metric</th><th>threshold</th></tr>${S.thresholds.map((t) => `<tr><td class="${t.ok ? "ok" : "bad"}">${t.ok ? "✓" : "✗"}</td><td>${esc(t.metric)}</td><td>${esc(t.expr)}</td></tr>`).join("")}</table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
:root{--bg:#fff;--fg:#0f172a;--mut:#64748b;--line:#e2e8f0;--card:#f8fafc}
@media (prefers-color-scheme:dark){:root{--bg:#0b1220;--fg:#e5e7eb;--mut:#94a3b8;--line:#1e293b;--card:#111a2e}}
body{font:14px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);max-width:880px;margin:24px auto;padding:0 16px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px}h3{font-size:13px;margin:14px 0 2px}
.muted{color:var(--mut);font-weight:400}.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:14px 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:10px 12px}.card .v{font-size:20px;font-weight:600}.card .l{color:var(--mut);font-size:12px}.card .s{font-size:12px;color:var(--mut)}
table{border-collapse:collapse;width:100%;margin:6px 0}th,td{border-bottom:1px solid var(--line);padding:4px 8px;text-align:right}th:first-child,td:first-child{text-align:left}
.ok{color:#16a34a;font-weight:600}.bad{color:#dc2626;font-weight:600}.warn{background:#fef3c7;color:#78350f;border-radius:6px;padding:8px 12px;margin:6px 0}
svg .grid{stroke:var(--line)}svg .ref{stroke:#dc2626;stroke-dasharray:4 4;opacity:.6}svg .tick{fill:var(--mut);font-size:10px}svg .leg{font-size:11px}
</style></head><body>
<h1>${esc(title)}</h1><div class="muted">${esc(S.config.description)}</div>
<div class="muted">${S.config.maxRooms} rooms × ${S.config.perRoom}${S.config.peersPerPage > 1 ? " × " + S.config.peersPerPage : ""} planned · ran ${Math.round((S.durationMs || 0) / 1000)} s</div>
${warnings.map((w) => `<div class="warn">⚠ ${esc(w)}</div>`).join("")}
<div class="cards">${cards.join("")}</div>
${derived.length ? `<h2>Capacity numbers</h2><table>${derived.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>` : ""}
${cur}
<h2>Resources over time</h2>${charts}
<h2>Latency</h2>${latTable}
<h2>Thresholds</h2>${thr}
<p class="muted">Worker RSS comes from mediasoup's ru_maxrss, a peak, so it never decreases. Latencies have 1 ms resolution (k6 has no sub-ms clock).</p>
</body></html>`;
}

export function writeReport({ summaryFile, timelineFile, outFile, title }) {
  const summary = JSON.parse(fs.readFileSync(summaryFile, "utf8"));
  const timeline = timelineFile && fs.existsSync(timelineFile) ? readTimeline(timelineFile) : [];
  fs.writeFileSync(outFile, buildReport({ summary, timeline, title: title || `${summary.suite} · ${summary.level}` }));
  return outFile;
}

// CLI: regenerate every report in a results directory
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node scripts/report.mjs <results-dir>");
    process.exit(1);
  }
  for (const file of fs.readdirSync(dir).filter((x) => x.endsWith("-summary.json"))) {
    const name = file.replace("-summary.json", "");
    const out = writeReport({ summaryFile: path.join(dir, file), timelineFile: path.join(dir, `${name}-timeline.csv`), outFile: path.join(dir, `${name}-report.html`) });
    console.log("wrote", out);
  }
}
