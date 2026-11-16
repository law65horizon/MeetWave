// levels.js — single source of truth for test levels.
// Plain ESM with NO imports, so both k6 (goja) and Node can import it.
//
// A "stage" is { sec, rooms }: ramp linearly from the previous stage's room
// count to `rooms` over `sec` seconds. A stage whose `rooms` equals the previous
// one is a plateau ("hold"). Participants ramp one by one:
//   target participants(t) = round(rooms(t) * perRoom)

const SERVER_THRESHOLDS_LOAD = {
  server_node_cpu_pct: ["p(95)<85"],
  server_event_loop_p99_ms: ["p(95)<100"],
  server_worker_cpu_pct_max: ["p(95)<90"],
};

export const LEVELS = {
  // ───────────────────────── protocol-level (no browser) ─────────────────────────
  signaling: {
    smoke: {
      description: "Sanity check: 2 rooms x 3 participants for ~30s. Proves the test and server work.",
      perRoom: 3,
      stages: [
        { sec: 5, rooms: 2 },
        { sec: 20, rooms: 2 },
        { sec: 5, rooms: 0 },
      ],
      sessionSec: 15,
      chatEverySec: 3,
      syncEverySec: 3,
      audioLevelHz: 2,
      media: true,
      thresholds: {
        join_success: ["rate>0.99"],
        media_success: ["rate>0.99"],
        session_dropped: ["rate<0.01"],
        sio_connect_ms: ["p(95)<1000"],
        room_join_ms: ["p(95)<1000"],
        time_sync_rtt_ms: ["p(95)<100"],
        chat_delivery_ms: ["p(95)<500"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
    load: {
      description: "Expected peak traffic: 20 rooms x 6 participants (120) held for 5 min.",
      perRoom: 6,
      stages: [
        { sec: 120, rooms: 20 },
        { sec: 300, rooms: 20 },
        { sec: 30, rooms: 0 },
      ],
      sessionSec: 90,
      chatEverySec: 10,
      syncEverySec: 5,
      audioLevelHz: 2,
      media: true,
      thresholds: {
        join_success: ["rate>0.99"],
        media_success: ["rate>0.99"],
        session_dropped: ["rate<0.01"],
        sio_connect_ms: ["p(95)<1000"],
        room_join_ms: ["p(95)<1500"],
        time_sync_rtt_ms: ["p(95)<100"],
        chat_delivery_ms: ["p(95)<250"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
    stress: {
      description: "Find the breaking point: step up to 200 rooms x 6 (1200 participants). Stops itself when the server is clearly broken.",
      perRoom: 6,
      stages: [
        // ramp 45s / hold 75s per step
        { sec: 45, rooms: 10 }, { sec: 75, rooms: 10 },
        { sec: 45, rooms: 20 }, { sec: 75, rooms: 20 },
        { sec: 45, rooms: 40 }, { sec: 75, rooms: 40 },
        { sec: 45, rooms: 80 }, { sec: 75, rooms: 80 },
        { sec: 45, rooms: 120 }, { sec: 75, rooms: 120 },
        { sec: 45, rooms: 160 }, { sec: 75, rooms: 160 },
        { sec: 45, rooms: 200 }, { sec: 75, rooms: 200 },
        { sec: 30, rooms: 0 },
      ],
      sessionSec: 120,
      chatEverySec: 10,
      syncEverySec: 5,
      audioLevelHz: 2,
      media: true,
      // Whole-run aggregates are deliberately loose: the point of this level is the
      // per-step capacity curve, not a pass/fail on the average of a ramp.
      thresholds: {
        join_success: ["rate>0.95"],
        session_dropped: ["rate<0.05"],
        time_sync_rtt_ms: ["p(95)<1000"],
        chat_delivery_ms: ["p(95)<2000"],
      },
      serverThresholds: {},
      // Self-stop: abort when the server is clearly past its limit.
      guard: { eventLoopP99Ms: 1000, healthLatencyMs: 3000, consecutive: 3 },
    },
    soak: {
      description: "Leak hunt: 10 rooms x 6 for 30 min. Watch RSS slope and latency drift.",
      perRoom: 6,
      stages: [
        { sec: 60, rooms: 10 },
        { sec: 1800, rooms: 10 },
        { sec: 30, rooms: 0 },
      ],
      sessionSec: 300,
      chatEverySec: 10,
      syncEverySec: 5,
      audioLevelHz: 2,
      media: true,
      thresholds: {
        join_success: ["rate>0.99"],
        media_success: ["rate>0.99"],
        session_dropped: ["rate<0.01"],
        room_join_ms: ["p(95)<1500"],
        time_sync_rtt_ms: ["p(95)<100"],
        chat_delivery_ms: ["p(95)<250"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
  },

  // ───────────────────── real browsers, real RTP, glass-to-glass ─────────────────────
  // One k6 VU == one Chromium == `peersPerPage` participants. Rooms start `rampEverySec`
  // apart and all stop `holdSec` after the last room has started.
  g2g: {
    smoke: {
      description: "1 room x 2 browsers for ~40s. Proves media flows and the glass-to-glass clock works.",
      rooms: 1, perRoom: 2, peersPerPage: 1, rampEverySec: 0, holdSec: 30, minFpsRatio: 0.5,
      video: { w: 640, h: 360, fps: 24, maxKbps: 800 },
      thresholds: {
        g2g_latency_ms: ["p(95)<400"],
        stream_ok: ["rate>0.99"],
        peer_ok: ["rate>0.99"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
    load: {
      description: "2 rooms x 4 browsers (8 real participants) for 2 min. Everyone sends and receives video.",
      rooms: 2, perRoom: 4, peersPerPage: 1, rampEverySec: 20, holdSec: 120, minFpsRatio: 0.7,
      video: { w: 640, h: 360, fps: 24, maxKbps: 800 },
      thresholds: {
        g2g_latency_ms: ["p(95)<400", "p(99)<800"],
        stream_ok: ["rate>0.99"],
        peer_ok: ["rate>0.99"],
        video_freezes: ["count<5"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
    stress: {
      description: "Step up to 6 rooms x 4 browsers (24 real participants). Run the browsers on a separate machine for honest numbers.",
      rooms: 6, perRoom: 4, peersPerPage: 1, rampEverySec: 60, holdSec: 120, minFpsRatio: 0,
      video: { w: 640, h: 360, fps: 24, maxKbps: 800 },
      thresholds: {
        g2g_latency_ms: ["p(95)<1500"],
        stream_ok: ["rate>0.9"],
        peer_ok: ["rate>0.9"],
      },
      serverThresholds: {},
      guard: { eventLoopP99Ms: 1000, healthLatencyMs: 3000, consecutive: 3 },
    },
    soak: {
      description: "2 rooms x 4 browsers for 30 min: leak and drift hunt on the media path.",
      rooms: 2, perRoom: 4, peersPerPage: 1, rampEverySec: 20, holdSec: 1800, minFpsRatio: 0.7,
      video: { w: 640, h: 360, fps: 24, maxKbps: 800 },
      thresholds: {
        g2g_latency_ms: ["p(95)<400", "p(99)<800"],
        stream_ok: ["rate>0.99"],
        peer_ok: ["rate>0.99"],
        health_ok: ["rate>0.99"],
      },
      serverThresholds: SERVER_THRESHOLDS_LOAD,
    },
  },
};

// ───────────────────────────── helpers ─────────────────────────────

const num = (v, d) => (v === undefined || v === "" || Number.isNaN(+v) ? d : +v);

/**
 * Resolve a level and apply env overrides. `env` is k6's __ENV or process.env.
 *   ROOMS, PER_ROOM, HOLD_SEC, RAMP_SEC, SESSION_SEC, CHAT_EVERY_SEC, AUDIO_LEVEL_HZ, MEDIA (0/1),
 *   GUARD (0 = off), GUARD_LOOP_MS, GUARD_HEALTH_MS, RAMP_EVERY_SEC, PEERS_PER_PAGE, VIDEO_W, VIDEO_H, VIDEO_FPS, VIDEO_KBPS
 */
export function resolveLevel(suite, level, env = {}) {
  const base = LEVELS[suite] && LEVELS[suite][level];
  if (!base) {
    const known = Object.keys(LEVELS[suite] || {}).join(", ");
    throw new Error(`Unknown level "${level}" for suite "${suite}". Known: ${known}`);
  }
  const cfg = JSON.parse(JSON.stringify(base));
  cfg.suite = suite;
  cfg.level = level;
  cfg.perRoom = num(env.PER_ROOM, cfg.perRoom);

  if (suite === "signaling") {
    const peak = Math.max(...cfg.stages.map((s) => s.rooms));
    if (env.ROOMS) {
      const k = num(env.ROOMS, peak) / peak;
      cfg.stages.forEach((s) => (s.rooms = Math.max(0, Math.round(s.rooms * k))));
    }
    // HOLD_SEC sets every plateau (a stage that keeps the previous room count); RAMP_SEC every ramp.
    if (env.HOLD_SEC || env.RAMP_SEC) {
      let prev = 0;
      for (const st of cfg.stages) {
        const isHold = st.rooms === prev && st.rooms > 0;
        const isRampUp = st.rooms > prev;
        if (isHold && env.HOLD_SEC) st.sec = num(env.HOLD_SEC, st.sec);
        if (isRampUp && env.RAMP_SEC) st.sec = num(env.RAMP_SEC, st.sec);
        prev = st.rooms;
      }
    }
    cfg.sessionSec = num(env.SESSION_SEC, cfg.sessionSec);
    cfg.chatEverySec = num(env.CHAT_EVERY_SEC, cfg.chatEverySec);
    cfg.audioLevelHz = num(env.AUDIO_LEVEL_HZ, cfg.audioLevelHz);
    if (env.MEDIA !== undefined && env.MEDIA !== "") cfg.media = env.MEDIA !== "0" && env.MEDIA !== "false";
    cfg.maxRooms = Math.max(...cfg.stages.map((s) => s.rooms));
    cfg.maxParticipants = cfg.maxRooms * cfg.perRoom;
    cfg.totalSec = cfg.stages.reduce((a, s) => a + s.sec, 0);
  } else {
    cfg.rooms = num(env.ROOMS, cfg.rooms);
    cfg.holdSec = num(env.HOLD_SEC, cfg.holdSec);
    cfg.rampEverySec = num(env.RAMP_EVERY_SEC, cfg.rampEverySec);
    cfg.peersPerPage = num(env.PEERS_PER_PAGE, cfg.peersPerPage);
    cfg.video.w = num(env.VIDEO_W, cfg.video.w);
    cfg.video.h = num(env.VIDEO_H, cfg.video.h);
    cfg.video.fps = num(env.VIDEO_FPS, cfg.video.fps);
    cfg.video.maxKbps = num(env.VIDEO_KBPS, cfg.video.maxKbps);
    cfg.maxRooms = cfg.rooms;
    cfg.maxParticipants = cfg.rooms * cfg.perRoom * cfg.peersPerPage;
    cfg.totalSec = (cfg.rooms - 1) * cfg.rampEverySec + cfg.holdSec;
    // Room r (1-based) starts at (r-1)*rampEverySec; all rooms stop at totalSec.
    cfg.steps = [];
    for (let r = 1; r <= cfg.rooms; r++) {
      cfg.steps.push({
        rooms: r,
        startSec: (r - 1) * cfg.rampEverySec,
        endSec: r < cfg.rooms ? r * cfg.rampEverySec : cfg.totalSec,
      });
    }
  }
  // Breaking-point guard (stress): GUARD=0 disables it, GUARD_LOOP_MS / GUARD_HEALTH_MS tune it.
  if (env.GUARD === "0") delete cfg.guard;
  else if (env.GUARD_LOOP_MS || env.GUARD_HEALTH_MS) {
    cfg.guard = Object.assign({ eventLoopP99Ms: 1000, healthLatencyMs: 3000, consecutive: 3 }, cfg.guard);
    cfg.guard.eventLoopP99Ms = num(env.GUARD_LOOP_MS, cfg.guard.eventLoopP99Ms);
    cfg.guard.healthLatencyMs = num(env.GUARD_HEALTH_MS, cfg.guard.healthLatencyMs);
  }
  return cfg;
}

/** Linear room target at time t (seconds) for a stage list. */
export function roomsAt(stages, t) {
  let start = 0;
  let prev = 0;
  for (const s of stages) {
    const end = start + s.sec;
    if (t < end || s === stages[stages.length - 1]) {
      if (s.sec === 0) return s.rooms;
      const f = Math.min(1, Math.max(0, (t - start) / s.sec));
      return prev + (s.rooms - prev) * f;
    }
    start = end;
    prev = s.rooms;
  }
  return 0;
}

/**
 * Time intervals [startSec, endSec) during which participant #rank (0-based) must be
 * present: whenever target participants exceed `rank`. Sampled at 1 s resolution.
 */
export function presenceIntervals(stages, perRoom, rank) {
  const total = stages.reduce((a, s) => a + s.sec, 0);
  const out = [];
  let open = null;
  for (let t = 0; t <= total; t++) {
    const present = Math.round(roomsAt(stages, t) * perRoom) > rank;
    if (present && open === null) open = t;
    if (!present && open !== null) {
      out.push([open, t]);
      open = null;
    }
  }
  if (open !== null) out.push([open, total]);
  return out;
}

/**
 * Index of the stage active at second t, and whether it is a plateau.
 * Returns { index, hold, rooms }.
 */
export function stageAt(stages, t) {
  let start = 0;
  let prev = 0;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const end = start + s.sec;
    if (t < end || i === stages.length - 1) return { index: i, hold: s.rooms === prev && s.rooms > 0, rooms: s.rooms };
    start = end;
    prev = s.rooms;
  }
  return { index: 0, hold: false, rooms: 0 };
}

export const stageLabel = (i) => "s" + String(i).padStart(2, "0");

/**
 * Measurement plateaus: the periods where load is steady, with the label that
 * per-step metrics are tagged with. signaling: every hold stage. g2g: every step.
 */
export function plateaus(cfg) {
  const out = [];
  if (cfg.suite === "signaling") {
    let start = 0;
    let prev = 0;
    cfg.stages.forEach((s, i) => {
      if (s.rooms === prev && s.rooms > 0) {
        out.push({ label: stageLabel(i), rooms: s.rooms, participants: s.rooms * cfg.perRoom, startSec: start, endSec: start + s.sec });
      }
      start += s.sec;
      prev = s.rooms;
    });
  } else {
    for (const st of cfg.steps) {
      out.push({
        label: stageLabel(st.rooms),
        rooms: st.rooms,
        participants: st.rooms * cfg.perRoom * cfg.peersPerPage,
        startSec: st.startSec,
        endSec: st.endSec,
      });
    }
  }
  return out;
}
