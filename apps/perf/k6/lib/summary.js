// Builds the end-of-test console report and a structured JSON (consumed by scripts/report.mjs).
import { plateaus } from "../../levels.js";

const SUITE_LAYOUT = {
  signaling: {
    latency: [
      ["Socket.IO connect", "sio_connect_ms"],
      ["room:join", "room_join_ms"],
      ["chat delivery (fan-out)", "chat_delivery_ms"],
      ["chat ack", "chat_ack_ms"],
      ["time:sync RTT", "time_sync_rtt_ms"],
      ["transport:create", "transport_create_ms"],
      ["produce", "produce_ms"],
      ["consume + resume", "consume_ms"],
      ["media setup (join -> ready)", "media_setup_ms"],
      ["GET /health", "health_latency_ms"],
    ],
    rates: [
      ["join success", "join_success"],
      ["media setup success", "media_success"],
      ["sessions dropped by server", "session_dropped"],
    ],
    curve: [
      ["node CPU p95 %", "server_node_cpu_pct", "p(95)", 0],
      ["workers CPU %", "server_workers_cpu_pct_total", "p(95)", 0],
      ["loop p99 ms", "server_event_loop_p99_ms", "p(95)", 0],
      ["chat p95 ms", "chat_delivery_ms", "p(95)", 0],
      ["sync p95 ms", "time_sync_rtt_ms", "p(95)", 0],
      ["join p95 ms", "room_join_ms", "p(95)", 0],
      ["join ok %", "join_success", "rate", 1, 100],
      ["RSS MB", "server_node_rss_mb", "max", 0],
    ],
  },
  g2g: {
    latency: [
      ["GLASS-TO-GLASS", "g2g_latency_ms"],
      ["g2g worst frame / 2s window", "g2g_peak_ms"],
      ["time to first frame", "time_to_first_frame_ms"],
      ["WebRTC connect", "webrtc_connect_ms"],
      ["room:join", "room_join_ms"],
      ["RTT (ICE pair)", "rtt_ms"],
      ["jitter", "jitter_ms"],
      ["jitter-buffer delay", "jitter_buffer_ms"],
      ["decode time / frame", "decode_ms"],
      ["video fps received", "video_fps_in"],
      ["video bitrate received kbps", "video_bitrate_in_kbps"],
      ["GET /health", "health_latency_ms"],
    ],
    rates: [
      ["streams that rendered a frame", "stream_ok"],
      ["peers that joined + sent media", "peer_ok"],
    ],
    counters: [
      ["video freezes", "video_freezes"],
      ["frame stalls > 250 ms", "frame_stalls"],
      ["packets lost", "packets_lost"],
      ["frames dropped (decoder)", "frames_dropped"],
      ["sender limited by CPU", "quality_limited_cpu"],
      ["sender limited by bandwidth", "quality_limited_bw"],
      ["barcode decode errors", "g2g_decode_errors"],
      ["errors", "errors"],
    ],
    curve: [
      ["g2g p50 ms", "g2g_latency_ms", "med", 0],
      ["g2g p95 ms", "g2g_latency_ms", "p(95)", 0],
      ["g2g p99 ms", "g2g_latency_ms", "p(99)", 0],
      ["fps p5", "video_fps_in", "p(5)", 0],
      ["node CPU p95 %", "server_node_cpu_pct", "p(95)", 0],
      ["workers CPU %", "server_workers_cpu_pct_total", "p(95)", 0],
      ["loop p99 ms", "server_event_loop_p99_ms", "p(95)", 0],
      ["streams ok %", "stream_ok", "rate", 1, 100],
    ],
  },
};

const SERVER_ROWS = [
  ["Node main-process CPU % (of 1 core)", "server_node_cpu_pct"],
  ["mediasoup workers CPU % (sum, of 1 core)", "server_workers_cpu_pct_total"],
  ["hottest single worker CPU %", "server_worker_cpu_pct_max"],
  ["Node RSS MB", "server_node_rss_mb"],
  ["Node heap used MB", "server_node_heap_mb"],
  ["mediasoup workers peak RSS MB (sum)", "server_workers_peak_rss_mb"],
  ["event-loop delay p99 ms", "server_event_loop_p99_ms"],
  ["sockets (server view)", "server_sockets"],
  ["mediasoup routers = active rooms", "server_routers"],
];

const v = (data, name) => (data.metrics[name] ? data.metrics[name].values : null);
const num = (x, d = 1) => (typeof x !== "number" || Number.isNaN(x) ? "-" : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(d));
const pad = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const hasSamples = (x) => x && (x.count > 0 || x.max > 0 || x.avg > 0 || x.min > 0 || x.rate !== undefined);

export function buildSummary(data, ctx) {
  const { cfg } = ctx;
  const layout = SUITE_LAYOUT[cfg.suite];
  const L = [];
  const out = {
    suite: cfg.suite,
    level: cfg.level,
    config: cfg,
    durationMs: data.state && data.state.testRunDurationMs,
    metrics: {},
    thresholds: [],
    curve: [],
  };

  let failed = 0;
  let total = 0;
  for (const [name, m] of Object.entries(data.metrics)) {
    if (!m.thresholds || name.includes("{stage:")) continue;
    for (const [expr, r] of Object.entries(m.thresholds)) {
      total++;
      if (!r.ok) failed++;
      out.thresholds.push({ metric: name, expr, ok: r.ok });
    }
  }
  const guardHit = v(data, "guard_abort") && v(data, "guard_abort").count > 0;
  out.verdict = failed === 0 ? "PASS" : "FAIL";
  out.brokeServer = !!guardHit;

  const sockets = v(data, "server_sockets");
  L.push("");
  L.push(`══════════ ${cfg.suite} · ${cfg.level} ${"═".repeat(Math.max(2, 50 - cfg.suite.length - cfg.level.length))}`);
  L.push(cfg.description);
  L.push(
    `Plan: up to ${cfg.maxRooms} rooms x ${cfg.perRoom}${cfg.suite === "g2g" && cfg.peersPerPage > 1 ? " x " + cfg.peersPerPage : ""} = ${cfg.maxParticipants} participants, ` +
      `${Math.round(cfg.totalSec)}s scheduled, ran ${Math.round((out.durationMs || 0) / 1000)}s` +
      (cfg.suite === "signaling" ? `, media objects ${cfg.media ? "on" : "off"}` : ""),
  );
  if (hasSamples(sockets) && sockets.max > 0) L.push(`Server saw up to ${num(sockets.max, 0)} sockets, ${num((v(data, "server_routers") || {}).max, 0)} active rooms`);
  L.push(`RESULT: ${out.verdict}  (${total - failed}/${total} thresholds passed)${guardHit ? "   <- STOPPED EARLY: server hit its breaking point" : ""}`);
  L.push("");

  L.push(pad("Latency", 34) + ["avg", "p50", "p95", "p99", "max"].map((h) => lpad(h, 9)).join(""));
  for (const [label, name] of layout.latency) {
    const x = v(data, name);
    if (!hasSamples(x)) continue;
    L.push(pad("  " + label, 34) + [x.avg, x.med, x["p(95)"], x["p(99)"], x.max].map((n) => lpad(num(n), 9)).join(""));
    out.metrics[name] = x;
  }

  L.push("");
  L.push("Reliability");
  for (const [label, name] of layout.rates || []) {
    const x = v(data, name);
    if (!x) continue;
    L.push(pad("  " + label, 40) + `${num(x.rate * 100, 2)}%   (${x.passes} of ${x.passes + x.fails})`);
    out.metrics[name] = x;
  }
  for (const [label, name] of layout.counters || []) {
    const x = v(data, name);
    if (!x) continue;
    L.push(pad("  " + label, 40) + num(x.count, 0));
    out.metrics[name] = x;
  }
  if (cfg.suite === "signaling" && v(data, "errors")) {
    out.metrics.errors = v(data, "errors");
    L.push(pad("  errors", 40) + num(v(data, "errors").count, 0));
  }

  const serverLines = [];
  for (const [label, name] of SERVER_ROWS) {
    const x = v(data, name);
    out.metrics[name] = x;
    if (!hasSamples(x) || (x.max === 0 && x.avg === 0)) continue;
    serverLines.push(pad("  " + label, 44) + [x.avg, x["p(95)"], x.max].map((n) => lpad(num(n), 9)).join(""));
  }
  L.push("");
  if (serverLines.length) {
    L.push(pad("Server resources (from /health)", 44) + ["avg", "p95", "max"].map((h) => lpad(h, 9)).join(""));
    L.push(...serverLines);
  } else {
    L.push("Server resources: none collected (is /health reachable?)");
  }
  const cpu = v(data, "server_node_cpu_pct");
  if (!cpu || cpu.max === 0) L.push("  note: Node CPU / event-loop lag need server-patch/health-metrics.patch applied to the server.");
  L.push("  note: worker RSS is ru_maxrss, a PEAK (high-water mark), not current usage.");

  const cols = layout.curve;
  const rows = [];
  for (const p of plateaus(cfg)) {
    const row = { label: p.label, rooms: p.rooms, participants: p.participants, cells: [] };
    for (const [, metric, stat, , scale] of cols) {
      const sub = data.metrics[`${metric}{stage:${p.label}}`];
      let x = sub && sub.values ? sub.values[stat] : undefined;
      if (typeof x === "number" && scale) x *= scale;
      // an empty trend reports zeros; show "-" instead of a fake 0
      if (sub && sub.type === "trend" && sub.values.max === 0 && sub.values.min === 0 && sub.values.avg === 0) x = undefined;
      if (sub && sub.type === "rate" && sub.values.passes + sub.values.fails === 0) x = undefined;
      row.cells.push(x);
    }
    rows.push(row);
  }
  out.curve = { columns: cols.map((c) => c[0]), rows };
  if (rows.length > 1) {
    L.push("");
    L.push("Capacity curve (each row = one steady plateau)");
    L.push(pad("  rooms", 8) + lpad("people", 8) + cols.map((c) => lpad(c[0], 17)).join(""));
    for (const r of rows) L.push(pad("  " + r.rooms, 8) + lpad(r.participants, 8) + r.cells.map((c) => lpad(num(c), 17)).join(""));
  }

  L.push("");
  L.push("Thresholds");
  for (const t of out.thresholds) L.push(`  ${t.ok ? "✓" : "✗"} ${t.metric}  ${t.expr}`);
  L.push("");
  return { text: L.join("\n"), json: out };
}

/**
 * Always-true thresholds named `metric{stage:sNN}`. Their only job is to make k6 compute
 * those sub-metrics so the capacity curve can be built from the end-of-test summary.
 */
export function curveThresholds(cfg, curve) {
  const t = {};
  for (const p of plateaus(cfg)) {
    for (const [name, kind] of Object.entries(curve)) {
      t[`${name}{stage:${p.label}}`] = [kind === "rate" ? "rate>=0" : kind === "counter" ? "count>=0" : "max>=0"];
    }
  }
  return t;
}
