// Browser harness for glass-to-glass measurement. Bundled by harness/build.mjs and driven by
// k6 (k6/g2g.js) through window.__perf.
//
// Each Peer is a real WebRTC participant: socket.io + mediasoup-client against the real server.
//   SEND: a canvas draws moving content plus a barcode that encodes
//         [server-clock ms (32 bit) | sender id | frame seq | CRC-8 | sync byte].
//         canvas.captureStream() -> VP8 producer. Opus tone -> audio producer.
//   RECV: every remote video goes to a <video>. requestVideoFrameCallback fires when a frame is
//         presented; we read the barcode out of that very frame and compute
//             glass-to-glass = (expected display time) - (time the sender drew the frame).
// Clocks: each peer estimates its offset to the SERVER clock with the server's own `time:sync`
// (NTP-style, min-RTT sample), so numbers stay valid when senders and receivers run on
// different machines (error is bounded by half the best RTT).
import { io } from "socket.io-client";
import { Device } from "mediasoup-client";

// ─────────────────────────── barcode codec ───────────────────────────
const COLS = 40;
const ROWS = 2;
const SYNC = 0xa5;
const M32 = 4294967296;

function crc8(bytes) {
  let c = 0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 0xff : (c << 1) & 0xff;
  }
  return c;
}
function payloadBytes(ts32, sender, seq) {
  const b = [(ts32 >>> 24) & 255, (ts32 >>> 16) & 255, (ts32 >>> 8) & 255, ts32 & 255, (sender >> 8) & 255, sender & 255, (seq >> 8) & 255, seq & 255];
  b.push(crc8(b));
  b.push(SYNC);
  return b; // 10 bytes = 80 bits = COLS*ROWS
}

// ─────────────────────────── aggregation ───────────────────────────
const blank = () => ({
  g2g: [], // downsampled glass-to-glass samples (ms)
  peaks: [], // worst frame per stream per drain window (ms)
  decodeErrors: 0,
  framesRendered: 0,
  stalls: 0, // gap between presented frames > 250 ms
  firstFrameMs: [],
  streamOk: [], // true = stream rendered, false = nothing after 15 s
  peerOk: [],
  joinMs: [],
  webrtcConnectMs: [],
  errors: [],
  rttMs: [],
  jitterMs: [],
  jbMs: [],
  decodeMs: [],
  fps: [],
  inKbps: [],
  outKbps: [],
  packetsLost: 0,
  freezes: 0,
  framesDropped: 0,
  limitedCpu: 0,
  limitedBw: 0,
});
let agg = blank();
const peers = [];
let cfg = null;
const log = (...a) => cfg && cfg.debug && console.log("[perf]", ...a);
const pushErr = (where, e) => {
  const msg = `${where}: ${(e && e.message) || e}`;
  if (agg.errors.length < 50) agg.errors.push(msg);
  log("ERROR", msg);
};

// ─────────────────────────── Peer ───────────────────────────
class Peer {
  constructor(index, roomId, name) {
    this.index = index;
    this.roomId = roomId;
    this.name = name;
    this.offset = 0; // serverTime - localTime (ms)
    this.senderId = 1 + Math.floor(Math.random() * 65534);
    this.consumers = new Map(); // consumerId -> { consumer, kind, video?, created, gotFrame, prev }
    this.stopped = false;
    this.seen = new Set();
    this.ready = null;
  }

  serverNow() {
    return Date.now() + this.offset;
  }

  req(event, data) {
    return new Promise((resolve, reject) => {
      this.socket.timeout(15000).emit(event, data, (err, res) => (err ? reject(new Error(`ack timeout: ${event}`)) : resolve(res)));
    });
  }

  async syncClock() {
    let best = null;
    for (let i = 0; i < 8; i++) {
      const t0 = Date.now();
      const r = await this.req("time:sync", { t0 });
      const t3 = Date.now();
      const rtt = t3 - t0 - (r.t2 - r.t1);
      if (!best || rtt < best.rtt) best = { rtt, offset: (r.t1 - t0 + (r.t2 - t3)) / 2 };
      await new Promise((r2) => setTimeout(r2, 20));
    }
    this.offset = best.offset;
    this.clockRtt = best.rtt;
  }

  async start() {
    const c = cfg;
    this.socket = io(c.serverUrl, { transports: ["websocket"], auth: { roomId: this.roomId, displayName: this.name }, reconnection: false, forceNew: true });
    await new Promise((resolve, reject) => {
      this.socket.once("connect", resolve);
      this.socket.once("connect_error", (e) => reject(new Error("connect_error: " + e.message)));
    });
    await this.syncClock();

    this.socket.on("new:producer", (p) => this.ready.then(() => this.consume(p)).catch((e) => pushErr("consume", e)));
    this.socket.on("producer:closed", ({ producerId }) => this.dropProducer(producerId));
    this.socket.on("consumer:closed", ({ consumerId }) => this.dropConsumer(consumerId));
    this.socket.on("disconnect", (reason) => {
      if (!this.stopped) pushErr("disconnect", reason);
    });
    let readyResolve;
    this.ready = new Promise((r) => (readyResolve = r));

    const t0 = Date.now();
    const join = await this.req("room:join", {});
    if (!join || join.error) throw new Error("room:join " + (join && join.error));
    agg.joinMs.push(Date.now() - t0);

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: join.rtpCapabilities });
    // iceServers: [] on purpose. The server is ICE-lite with host candidates, and the
    // public STUN/TURN servers it advertises would only add external network noise.
    this.sendT = await this.makeTransport("send");
    this.recvT = await this.makeTransport("recv");

    this.makeSources();
    const video = this.videoTrack;
    this.videoProducer = await this.sendT.produce({
      track: video,
      encodings: [{ maxBitrate: c.video.maxKbps * 1000 }],
      codecOptions: { videoGoogleStartBitrate: Math.min(1000, c.video.maxKbps) },
    });
    if (this.audioTrack) this.audioProducer = await this.sendT.produce({ track: this.audioTrack });

    readyResolve();
    for (const p of join.producers || []) await this.consume(p).catch((e) => pushErr("consume", e));
    this.statsTimer = setInterval(() => this.pollStats().catch(() => {}), 2000);
    agg.peerOk.push(true);
  }

  async makeTransport(direction) {
    const res = await this.req("transport:create", { direction });
    if (!res || res.error) throw new Error("transport:create " + (res && res.error));
    const p = res.params;
    const opts = { id: p.id, iceParameters: p.iceParameters, iceCandidates: p.iceCandidates, dtlsParameters: p.dtlsParameters, iceServers: [] };
    const t = direction === "send" ? this.device.createSendTransport(opts) : this.device.createRecvTransport(opts);
    const created = Date.now();
    let reported = false;
    t.on("connect", ({ dtlsParameters }, cb, eb) => {
      this.req("transport:connect", { transportId: t.id, dtlsParameters }).then((r) => (r && r.error ? eb(new Error(r.error)) : cb()), eb);
    });
    t.on("connectionstatechange", (s) => {
      if (s === "connected" && !reported) {
        reported = true;
        agg.webrtcConnectMs.push(Date.now() - created);
      }
      if (s === "failed") pushErr("transport", `${direction} transport failed`);
    });
    if (direction === "send") {
      t.on("produce", ({ kind, rtpParameters, appData }, cb, eb) => {
        this.req("produce", { transportId: t.id, kind, rtpParameters, appData }).then((r) => (r && r.error ? eb(new Error(r.error)) : cb({ id: r.producerId })), eb);
      });
    }
    return t;
  }

  // ── synthetic camera + mic ──
  makeSources() {
    const { w, h, fps } = cfg.video;
    const block = Math.floor(w / COLS);
    const strip = ROWS * block;
    this.stripFrac = strip / h;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { alpha: false });
    const stream = canvas.captureStream(0);
    this.videoTrack = stream.getVideoTracks()[0];
    let seq = 0;
    const frameMs = 1000 / fps;
    let next = performance.now();

    const draw = () => {
      seq = (seq + 1) & 0xffff;
      ctx.fillStyle = `hsl(${(seq * 2) % 360} 50% 30%)`;
      ctx.fillRect(0, strip, w, h - strip);
      const bodyH = h - strip;
      for (let k = 0; k < 8; k++) {
        ctx.fillStyle = `hsl(${(k * 45 + seq) % 360} 80% 60%)`;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.sin(seq / 20 + k) * w * 0.35, strip + bodyH / 2 + Math.cos(seq / 17 + k * 1.3) * bodyH * 0.35, 18 + (k % 3) * 8, 0, 6.2832);
        ctx.fill();
      }
      for (let k = 0; k < 60; k++) {
        ctx.fillStyle = `rgb(${(Math.random() * 255) | 0},${(Math.random() * 255) | 0},${(Math.random() * 255) | 0})`;
        ctx.fillRect(Math.random() * w, strip + Math.random() * bodyH, 6, 6);
      }
      // barcode last, so the timestamp is as close to "captured" as we can get
      const ts32 = Math.round(this.serverNow()) % M32;
      const bytes = payloadBytes(ts32, this.senderId, seq);
      for (let i = 0; i < COLS * ROWS; i++) {
        const bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
        ctx.fillStyle = bit ? "#fff" : "#000";
        ctx.fillRect((i % COLS) * block, Math.floor(i / COLS) * block, block, block);
      }
      if (this.videoTrack.requestFrame) this.videoTrack.requestFrame();
    };
    const tick = () => {
      if (this.stopped) return;
      draw();
      next += frameMs;
      const now = performance.now();
      if (now - next > 1000) next = now; // fell far behind: do not burst
      this.drawTimer = setTimeout(tick, Math.max(0, next - now));
    };
    tick();

    try {
      const ac = new AudioContext();
      ac.resume().catch(() => {});
      const osc = ac.createOscillator();
      osc.frequency.value = 200 + (this.index % 10) * 40;
      const gain = ac.createGain();
      gain.gain.value = 0.05;
      const dest = ac.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dest);
      osc.start();
      this.ac = ac;
      this.audioTrack = dest.stream.getAudioTracks()[0];
    } catch (e) {
      pushErr("audio-source", e);
    }
  }

  // ── receive ──
  async consume(p) {
    if (!p || !p.producerId || this.seen.has(p.producerId) || p.socketId === this.socket.id) return;
    this.seen.add(p.producerId);
    const created = Date.now();
    const res = await this.req("consume", { producerId: p.producerId, rtpCapabilities: this.device.rtpCapabilities });
    if (!res || res.error) throw new Error("consume " + (res && res.error));
    const q = res.params;
    const consumer = await this.recvT.consume({ id: q.id, producerId: q.producerId, kind: q.kind, rtpParameters: q.rtpParameters });
    const entry = { consumer, kind: q.kind, producerId: q.producerId, created, gotFrame: false, prev: null, lastFrameAt: 0, lastSampleAt: 0, windowPeak: 0 };
    this.consumers.set(consumer.id, entry);
    const r = await this.req("consumer:resume", { consumerId: consumer.id });
    if (r && r.error) throw new Error("resume " + r.error);

    const ms = new MediaStream([consumer.track]);
    if (q.kind === "video") {
      const v = document.createElement("video");
      v.muted = true;
      v.autoplay = true;
      v.playsInline = true;
      v.width = 160;
      v.height = 90;
      v.srcObject = ms;
      document.getElementById("tiles").appendChild(v);
      v.play().catch(() => {});
      entry.video = v;
      this.watchFrames(entry);
      setTimeout(() => {
        if (!entry.gotFrame && !this.stopped && this.consumers.has(consumer.id)) agg.streamOk.push(false);
      }, 15000);
    } else {
      const a = new Audio();
      a.muted = true;
      a.srcObject = ms;
      a.play().catch(() => {});
      entry.audio = a;
    }
  }

  watchFrames(entry) {
    const v = entry.video;
    const dec = document.createElement("canvas");
    dec.width = COLS * 4;
    dec.height = ROWS * 4;
    const dctx = dec.getContext("2d", { willReadFrequently: true });
    const sampleEvery = 1000 / cfg.sampleHz;
    const onFrame = (now, md) => {
      if (this.stopped || entry.consumer.closed) return;
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      if (vw && vh) {
        agg.framesRendered++;
        if (entry.lastFrameAt && now - entry.lastFrameAt > 250) agg.stalls++;
        entry.lastFrameAt = now;
        try {
          dctx.drawImage(v, 0, 0, vw, vh * this.stripFrac, 0, 0, dec.width, dec.height);
          const px = dctx.getImageData(0, 0, dec.width, dec.height).data;
          const bytes = new Array(10).fill(0);
          for (let i = 0; i < COLS * ROWS; i++) {
            const x = (i % COLS) * 4 + 2;
            const y = Math.floor(i / COLS) * 4 + 2;
            if (px[(y * dec.width + x) * 4] > 127) bytes[i >> 3] |= 1 << (7 - (i & 7));
          }
          if (bytes[9] === SYNC && crc8(bytes.slice(0, 8)) === bytes[8]) {
            const ts32 = ((bytes[0] << 24) >>> 0) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3];
            // "glass" time = when the compositor expects to show this frame
            let t = now;
            if (md && md.expectedDisplayTime && md.expectedDisplayTime >= now && md.expectedDisplayTime - now < 100) t = md.expectedDisplayTime;
            const serverMs = performance.timeOrigin + t + this.offset;
            const lat = (((Math.floor(serverMs) - ts32) % M32) + M32) % M32;
            if (lat < 60000) {
              if (!entry.gotFrame) {
                entry.gotFrame = true;
                agg.firstFrameMs.push(Date.now() - entry.created);
                agg.streamOk.push(true);
              }
              if (lat > entry.windowPeak) entry.windowPeak = lat;
              if (now - entry.lastSampleAt >= sampleEvery) {
                entry.lastSampleAt = now;
                agg.g2g.push(lat);
              }
            } else agg.decodeErrors++;
          } else agg.decodeErrors++;
        } catch (e) {
          agg.decodeErrors++;
        }
      }
      v.requestVideoFrameCallback(onFrame);
    };
    v.requestVideoFrameCallback(onFrame);
  }

  dropProducer(producerId) {
    for (const [id, e] of this.consumers) if (e.producerId === producerId) this.dropConsumer(id);
  }
  dropConsumer(id) {
    const e = this.consumers.get(id);
    if (!e) return;
    this.consumers.delete(id);
    try {
      e.consumer.close();
    } catch (_) {}
    if (e.video) e.video.remove();
  }

  // ── WebRTC stats, every 2 s ──
  async pollStats() {
    const now = performance.now();
    for (const [, e] of this.consumers) {
      if (e.kind !== "video") continue;
      if (e.windowPeak) {
        agg.peaks.push(e.windowPeak);
        e.windowPeak = 0;
      }
      const rep = await e.consumer.getStats();
      rep.forEach((s) => {
        if (s.type !== "inbound-rtp" || s.kind !== "video") return;
        const p = e.prev;
        const cur = {
          t: now,
          bytes: s.bytesReceived || 0,
          frames: s.framesDecoded || 0,
          jbDelay: s.jitterBufferDelay || 0,
          jbCount: s.jitterBufferEmittedCount || 0,
          decodeTime: s.totalDecodeTime || 0,
          freezes: s.freezeCount || 0,
          lost: s.packetsLost || 0,
          dropped: s.framesDropped || 0,
        };
        if (p) {
          const dt = (cur.t - p.t) / 1000;
          if (dt > 0) agg.inKbps.push(((cur.bytes - p.bytes) * 8) / dt / 1000);
          agg.fps.push(s.framesPerSecond !== undefined ? s.framesPerSecond : (cur.frames - p.frames) / dt);
          if (cur.jbCount > p.jbCount) agg.jbMs.push(((cur.jbDelay - p.jbDelay) / (cur.jbCount - p.jbCount)) * 1000);
          if (cur.frames > p.frames) agg.decodeMs.push(((cur.decodeTime - p.decodeTime) / (cur.frames - p.frames)) * 1000);
          agg.freezes += Math.max(0, cur.freezes - p.freezes);
          agg.packetsLost += Math.max(0, cur.lost - p.lost);
          agg.framesDropped += Math.max(0, cur.dropped - p.dropped);
        }
        if (typeof s.jitter === "number") agg.jitterMs.push(s.jitter * 1000);
        e.prev = cur;
      });
    }
    if (this.recvT) {
      const rep = await this.recvT.getStats();
      rep.forEach((s) => {
        if (s.type === "candidate-pair" && s.nominated && typeof s.currentRoundTripTime === "number") agg.rttMs.push(s.currentRoundTripTime * 1000);
      });
    }
    if (this.videoProducer) {
      const rep = await this.videoProducer.getStats();
      rep.forEach((s) => {
        if (s.type !== "outbound-rtp") return;
        if (s.qualityLimitationReason === "cpu") agg.limitedCpu++;
        else if (s.qualityLimitationReason === "bandwidth") agg.limitedBw++;
        const p = this.prevOut;
        if (p && s.bytesSent !== undefined) {
          const dt = (now - p.t) / 1000;
          if (dt > 0) agg.outKbps.push(((s.bytesSent - p.bytes) * 8) / dt / 1000);
        }
        this.prevOut = { t: now, bytes: s.bytesSent || 0 };
      });
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.drawTimer);
    clearInterval(this.statsTimer);
    try {
      this.socket && this.socket.emit("room:leave");
    } catch (_) {}
    try {
      this.sendT && this.sendT.close();
      this.recvT && this.recvT.close();
      this.videoTrack && this.videoTrack.stop();
      this.audioTrack && this.audioTrack.stop();
      this.ac && this.ac.close();
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 50));
    try {
      this.socket && this.socket.disconnect();
    } catch (_) {}
  }
}

// ─────────────────────────── API for k6 ───────────────────────────
window.__perf = {
  /** config: { serverUrl, roomId, namePrefix, peers, video:{w,h,fps,maxKbps}, sampleHz, debug } */
  async start(config) {
    cfg = Object.assign({ sampleHz: 5, peers: 1 }, config);
    let ok = 0;
    for (let i = 0; i < cfg.peers; i++) {
      const peer = new Peer(i, cfg.roomId, `${cfg.namePrefix || "g2g"}-${i}`);
      peers.push(peer);
      try {
        await peer.start();
        ok++;
      } catch (e) {
        agg.peerOk.push(false);
        pushErr(`peer ${i} start`, e);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    return { ok, failed: cfg.peers - ok, clockRttMs: peers.map((p) => p.clockRtt), offsets: peers.map((p) => p.offset) };
  },
  /** Returns everything collected since the last call, and resets. */
  drain() {
    for (const p of peers) for (const [, e] of p.consumers) if (e.windowPeak && e.kind === "video") {
      agg.peaks.push(e.windowPeak);
      e.windowPeak = 0;
    }
    const out = agg;
    agg = blank();
    out.peersAlive = peers.filter((p) => p.socket && p.socket.connected).length;
    out.streamsPlaying = peers.reduce((n, p) => n + [...p.consumers.values()].filter((e) => e.kind === "video" && e.gotFrame).length, 0);
    return out;
  },
  async stop() {
    await Promise.all(peers.map((p) => p.stop()));
    peers.length = 0;
  },
};
