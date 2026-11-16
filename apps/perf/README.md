# meetapp-perf

k6 performance tests for `apps/server`: latency, **glass-to-glass**, server CPU and RAM, and how many
**rooms and participants** it carries. Three levels (`smoke`, `load`, `stress`) plus `soak`.

## Two suites, because k6 cannot send RTP

| Suite | What runs | Measures | Cost |
|---|---|---|---|
| `signaling` | k6 VUs speaking Socket.IO. Each one joins, creates transports, produces and consumes (synthetic RTP params, no DTLS), chats, syncs, leaves | rooms x participants scale, join/connect/chat-fan-out/`time:sync` latency, mediasoup router/transport/producer/consumer load, Redis, Node event loop | hundreds to 1000+ participants per laptop |
| `g2g` | k6 **browser** module: real Chromium, real `mediasoup-client`, real VP8/Opus through the SFU | **glass-to-glass latency**, fps, jitter, loss, freezes, jitter-buffer delay, sender CPU/bandwidth limiting, RTP forwarding CPU in the workers | ~25 browsers per laptop |
| `combined` | both at once: signaling is the crowd, browsers are probes | G2G while the signaling plane is busy | |

`signaling` never exercises RTP forwarding. For worker CPU under real media use `g2g`.

### How glass-to-glass is measured
Each sender draws a canvas whose top strip is a **barcode** (server-clock ms, sender id, frame seq, CRC-8)
and publishes it as a real video track. Each receiver reads the barcode from the frame the browser
**presents** (`requestVideoFrameCallback`, using `expectedDisplayTime`) and subtracts. Clocks are aligned to
the **server's clock** with the server's own `time:sync` (NTP-style, best of 8), so it stays valid when
browsers run on another machine (error is at most half the best RTT, ~1 ms on a LAN).
It covers canvas -> encode -> network -> SFU -> network -> decode -> render. It does **not** include
physical camera and display latency (tens of ms), which no software can measure.

## Setup
```bash
cd apps/perf && npm install        # or `pnpm install` from the repo root: apps/* is a workspace
git apply apps/perf/server-patch/health-metrics.patch   # from the repo root; see below
```
k6 must have the browser module (any recent k6) and Chrome/Chromium must be installed for `g2g`.
If k6 cannot find it: `K6_BROWSER_EXECUTABLE_PATH=/path/to/chrome`.

### The server patch (recommended, 20 lines)
`/health` already reports Node memory and mediasoup worker CPU. The patch adds Node main-process CPU,
**event-loop delay p99**, socket count and router (= active room) count. Without it the tests still run but
you lose Node CPU, event-loop lag, the participants-vs-CPU charts, and the stress guard's main signal.
It only adds fields to `/health`.

## Run
Start the server (and Redis) as usual, then:
```bash
node scripts/run.mjs smoke              # signaling then g2g
node scripts/run.mjs load signaling
node scripts/run.mjs stress g2g
node scripts/run.mjs load combined
# or: npm run smoke | load | stress | soak
```
Output goes to `results/<timestamp>-<level>/`: `*-report.html` (open it), `*-summary.json`,
`*-timeline.csv` (CPU/RAM/sockets/rooms every 2 s), `*-k6.log`. Exit code is non-zero if thresholds fail
(a `stress` run that found its breaking point is not an error).

Plain k6 works too: `k6 run -e LEVEL=smoke k6/signaling.js`
(`g2g.js` additionally needs `HARNESS_URL`, see `harness/serve.mjs`).

## Levels (`levels.js`)
| | signaling | g2g |
|---|---|---|
| **smoke** | 2 rooms x 3, 30 s | 1 room x 2 browsers, 30 s |
| **load** | 20 rooms x 6 = 120, 5 min hold | 2 rooms x 4 = 8 browsers, 2 min hold |
| **stress** | steps 10 -> 200 rooms (1200), stops itself at the breaking point | steps 1 -> 6 rooms x 4 = 24 browsers |
| **soak** | 10 rooms x 6 for 30 min | 2 rooms x 4 for 30 min |

Override anything with env vars: `ROOMS`, `PER_ROOM`, `HOLD_SEC` (every plateau), `RAMP_SEC`,
`SESSION_SEC`, `CHAT_EVERY_SEC`, `AUDIO_LEVEL_HZ`, `MEDIA=0` (skip transports/producers), `RAMP_EVERY_SEC`,
`PEERS_PER_PAGE`, `VIDEO_W/H/FPS/KBPS`, `GUARD=0`, `GUARD_LOOP_MS`, `BASE_URL`, `CLEANUP=0`.
Example: `ROOMS=50 PER_ROOM=8 HOLD_SEC=600 node scripts/run.mjs load signaling`.
Edit the `thresholds` in `levels.js` to match your SLOs; the defaults are starting points for a LAN.

## Reading the results
* **Capacity curve**: one row per steady plateau (rooms, participants, Node CPU, event-loop p99, chat and
  join latency, success rate, RSS). The breaking point is where latency or lag climbs faster than load.
* **Why not just abort on a threshold?** k6 thresholds aggregate the whole run, so an average over a ramp
  hides the moment of failure. Per-plateau sub-metrics and the guard (event-loop p99 or `/health` latency
  over limit 3 polls in a row) give the actual breaking point.
* **Capacity numbers** in the report: Node CPU per participant, worker CPU per participant, RAM per
  participant, RSS growth in MB/min (leak hint, trust it on `soak`).
* Worker RSS is `ru_maxrss`: a peak, it never goes down.
* `chat_delivery_ms` compares timestamps taken by k6 itself, so it is valid on one machine; across machines
  it needs synced clocks. `g2g` does not have this limitation.
* k6 has no sub-millisecond clock: latencies have 1 ms resolution.

## Run it honestly
* **The load generator and the server fighting over CPU is the #1 way to get wrong numbers.** The report
  warns when the generator machine exceeds 85% CPU. For real `g2g` numbers run k6+Chrome on another
  machine. The server listens on `127.0.0.1` only (`server.ts`), so use a reverse proxy and pass
  `--base-url`, `BROWSER_SERVER_URL`, and set `ANNOUNCED_IP` to an address the browsers can reach.
* Raise file descriptors for stress: `ulimit -n 65535` on the server and the k6 host. Each participant
  holds sockets plus UDP/TCP ports per transport; hitting the limit shows up as `transport:create` errors.
* Containers/CI as root: Chrome needs `no-sandbox` (added automatically when root, or `BROWSER_NO_SANDBOX=1`).
* Headless Chrome with software rendering is slow; `quality_limited_cpu > 0` in the report means the
  browsers, not the server, were the limit. Lower `VIDEO_*` or add machines.
* Rooms are created through `/demo/create` and ended at the end of the run, so Redis is left clean
  (`CLEANUP=0` to keep them).

## Things I noticed in the server while building this
* `handlers/media.ts` `console.log`s a stats object **every 2 s per producer and per consumer**. With N
  participants in a room that is ~2N(N-1) consumer logs per 2 s, plus a worker round-trip each. It will
  show up as Node CPU and event-loop lag well before the media path does. Try gating it behind a debug flag
  and re-running `stress` to see the difference.
* `generateRoomId()` has only 12,960 combinations, so a few hundred concurrent rooms collide, and a
  collision silently overwrites the other room's metadata. The tests de-duplicate ids; real users will not.
* `/health` `rooms` is the size of the `rooms:active` sorted set, which only shrinks on `room:end`, so it
  counts rooms ever created, not live ones. The tests use `routers` (needs the patch) for live rooms.
