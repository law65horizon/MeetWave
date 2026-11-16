// Sidecar sampler: every `intervalMs`, read /health and this machine's CPU/RAM and append a CSV row.
// The CSV is the timeline behind the report's charts (CPU/RAM vs participants over time).
import fs from "node:fs";
import os from "node:os";

export const COLUMNS = [
  "t_sec", "machine_cpu_pct", "machine_mem_pct",
  "sockets", "routers", "node_cpu_pct", "node_rss_mb", "node_heap_mb",
  "workers_cpu_pct", "worker_cpu_max_pct", "workers_peak_rss_mb", "loop_p99_ms", "health_ms",
];

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.values(c.times)) total += t;
    idle += c.times.idle;
  }
  return { idle, total };
}

export function startSysmon({ healthUrl, outFile, intervalMs = 2000, onSample }) {
  fs.writeFileSync(outFile, COLUMNS.join(",") + "\n");
  const t0 = Date.now();
  let prevCpu = cpuTimes();
  let prev = null;
  let stopped = false;
  let last = null;
  let timer = null;

  async function tick() {
    if (stopped) return;
    const row = Object.fromEntries(COLUMNS.map((c) => [c, ""]));
    row.t_sec = ((Date.now() - t0) / 1000).toFixed(1);

    const c = cpuTimes();
    row.machine_cpu_pct = (100 * (1 - (c.idle - prevCpu.idle) / Math.max(1, c.total - prevCpu.total))).toFixed(1);
    prevCpu = c;
    row.machine_mem_pct = (100 * (1 - os.freemem() / os.totalmem())).toFixed(1);

    try {
      const s = Date.now();
      const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
      row.health_ms = Date.now() - s;
      const h = await res.json();
      const workers = new Map((h.workerStats || []).map((w) => [w.pid, { ms: w.usage.ru_utime + w.usage.ru_stime, kb: w.usage.ru_maxrss }]));
      row.node_rss_mb = (h.memory.rss / 1048576).toFixed(1);
      row.node_heap_mb = (h.memory.heapUsed / 1048576).toFixed(1);
      row.workers_peak_rss_mb = ([...workers.values()].reduce((a, w) => a + w.kb, 0) / 1024).toFixed(1);
      if (typeof h.sockets === "number") row.sockets = h.sockets;
      if (typeof h.routers === "number") row.routers = h.routers;
      if (h.eventLoop) row.loop_p99_ms = h.eventLoop.p99Ms.toFixed(1);
      const cur = { up: h.uptime, cpuUs: h.cpu ? h.cpu.user + h.cpu.system : null, workers };
      if (prev && cur.up > prev.up) {
        const dtMs = (cur.up - prev.up) * 1000;
        if (cur.cpuUs !== null && prev.cpuUs !== null) row.node_cpu_pct = (((cur.cpuUs - prev.cpuUs) / 1000 / dtMs) * 100).toFixed(1);
        let sum = 0;
        let max = 0;
        let n = 0;
        for (const [pid, w] of workers) {
          const p = prev.workers.get(pid);
          if (!p) continue;
          const pct = Math.max(0, ((w.ms - p.ms) / dtMs) * 100);
          sum += pct;
          max = Math.max(max, pct);
          n++;
        }
        if (n) {
          row.workers_cpu_pct = sum.toFixed(1);
          row.worker_cpu_max_pct = max.toFixed(1);
        }
      }
      prev = cur;
    } catch (_) {
      /* server busy or down: leave health columns empty, the gap is itself a finding */
    }
    fs.appendFileSync(outFile, COLUMNS.map((k) => row[k]).join(",") + "\n");
    last = row;
    if (onSample) onSample(row);
    timer = setTimeout(tick, intervalMs);
  }
  tick();

  return {
    last: () => last,
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export function readTimeline(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => {
    const v = l.split(",");
    const o = {};
    head.forEach((h, i) => (o[h] = v[i] === "" || v[i] === undefined ? null : Number(v[i])));
    return o;
  });
}
