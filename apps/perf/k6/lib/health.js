// Polls GET /health and turns it into k6 metrics, so server CPU/RAM sit next to the
// latency numbers and can carry thresholds.
//
// What /health gives us out of the box:
//   memory.rss / heapUsed        Node main process memory (current)
//   workerStats[].usage          mediasoup workers: ru_utime+ru_stime = cumulative CPU ms,
//                                ru_maxrss = PEAK resident set in KB (a high-water mark)
// What the optional patch adds (server-patch/health-metrics.patch):
//   cpu {user,system}            process.cpuUsage() in µs -> Node main-thread CPU %
//   eventLoop {p99Ms,...}        event-loop delay: the earliest sign Node is saturated
//   sockets, routers             server's own view of concurrency
import http from "k6/http";
import exec from "k6/execution";
import { sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

export const serverMetrics = {
  nodeCpu: new Trend("server_node_cpu_pct"),
  nodeRss: new Trend("server_node_rss_mb"),
  nodeHeap: new Trend("server_node_heap_mb"),
  workersCpu: new Trend("server_workers_cpu_pct_total"),
  workerCpuMax: new Trend("server_worker_cpu_pct_max"),
  workersPeakRss: new Trend("server_workers_peak_rss_mb"),
  loopP99: new Trend("server_event_loop_p99_ms"),
  sockets: new Trend("server_sockets"),
  routers: new Trend("server_routers"),
  healthLatency: new Trend("health_latency_ms", true),
  healthOk: new Rate("health_ok"),
  guardAbort: new Counter("guard_abort"),
};

const MB = 1024 * 1024;

/**
 * Build the function a k6 scenario runs as `exec`. One call = one poll + sleep, state is
 * kept in this closure, which persists per VU across iterations.
 *
 * @param {object} o
 * @param {string} o.baseUrl
 * @param {number} o.intervalSec
 * @param {() => object} o.tags     tags to attach to every sample (e.g. {stage})
 * @param {object} [o.guard]        { eventLoopP99Ms, healthLatencyMs, consecutive }
 */
export function makeHealthPoller({ baseUrl, intervalSec, tags, guard }) {
  let prev = null;
  let breaches = 0;
  let failures = 0;

  return function health() {
    const t = tags ? tags() : {};
    const res = http.get(`${baseUrl}/health`, { timeout: "10s", tags: { name: "health" } });
    const ok = res.status === 200;
    serverMetrics.healthOk.add(ok, t);
    if (ok) serverMetrics.healthLatency.add(res.timings.duration, t);

    if (!ok) {
      failures++;
      if (guard && failures >= guard.consecutive) abort(`/health unreachable ${failures}x (status ${res.status})`);
      sleep(intervalSec);
      return;
    }
    failures = 0;

    let h;
    try {
      h = res.json();
    } catch (_) {
      sleep(intervalSec);
      return;
    }

    // Use the server's own uptime as the clock so the CPU deltas share a time base.
    const up = typeof h.uptime === "number" ? h.uptime : null;
    const workers = new Map();
    for (const w of h.workerStats || []) {
      workers.set(w.pid, { cpuMs: w.usage.ru_utime + w.usage.ru_stime, rssKb: w.usage.ru_maxrss });
    }
    const cur = {
      up,
      nodeCpuUs: h.cpu ? h.cpu.user + h.cpu.system : null,
      workers,
    };

    if (h.memory) {
      serverMetrics.nodeRss.add(h.memory.rss / MB, t);
      serverMetrics.nodeHeap.add(h.memory.heapUsed / MB, t);
    }
    let peak = 0;
    for (const [, w] of workers) peak += w.rssKb / 1024;
    serverMetrics.workersPeakRss.add(peak, t);

    if (h.eventLoop) serverMetrics.loopP99.add(h.eventLoop.p99Ms, t);
    if (typeof h.sockets === "number") serverMetrics.sockets.add(h.sockets, t);
    if (typeof h.routers === "number") serverMetrics.routers.add(h.routers, t);

    if (prev && up !== null && prev.up !== null && up > prev.up) {
      const dtMs = (up - prev.up) * 1000;
      if (cur.nodeCpuUs !== null && prev.nodeCpuUs !== null && cur.nodeCpuUs >= prev.nodeCpuUs) {
        serverMetrics.nodeCpu.add(((cur.nodeCpuUs - prev.nodeCpuUs) / 1000 / dtMs) * 100, t);
      }
      let total = 0;
      let max = 0;
      let n = 0;
      for (const [pid, w] of workers) {
        const p = prev.workers.get(pid);
        if (!p) continue; // new or restarted worker: no baseline yet
        const pct = Math.max(0, ((w.cpuMs - p.cpuMs) / dtMs) * 100);
        total += pct;
        if (pct > max) max = pct;
        n++;
      }
      if (n > 0) {
        serverMetrics.workersCpu.add(total, t);
        serverMetrics.workerCpuMax.add(max, t);
      }
    }
    prev = cur;

    if (guard) {
      const lag = h.eventLoop ? h.eventLoop.p99Ms : 0;
      const slow = res.timings.duration > guard.healthLatencyMs;
      if (lag > guard.eventLoopP99Ms || slow) breaches++;
      else breaches = 0;
      if (breaches >= guard.consecutive) {
        abort(`event-loop p99 ${lag.toFixed(0)} ms, /health took ${res.timings.duration.toFixed(0)} ms (${breaches} polls in a row)`);
      }
    }
    sleep(intervalSec);
  };

  function abort(why) {
    serverMetrics.guardAbort.add(1);
    const at = ((Date.now() - exec.scenario.startTime) / 1000).toFixed(0);
    exec.test.abort(`BREAKING POINT at t=${at}s: ${why}`);
  }
}
