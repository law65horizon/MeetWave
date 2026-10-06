import { config } from "./index";
import type {
  WorkerSettings,
  RouterOptions,
  WebRtcTransportOptions,
} from "mediasoup/types";
import os from "os";
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const info of iface!) {
      if (info.family === "IPv4" && !info.internal) return info.address;
    }
  }
  return "127.0.0.1";
}

export const workerSettings: WorkerSettings = {
  logLevel: "warn",
  logTags: ["ice", "dtls"],
  // logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  rtcMinPort: config.MEDIASOUP_MIN_PORT,
  rtcMaxPort: config.MEDIASOUP_MAX_PORT,
};

export const routerOptions: RouterOptions = {
  mediaCodecs: [
    {
      kind: "audio",
      mimeType: "audio/opus",
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
      parameters: { "x-google-start-bitrate": 1000 },
    },
    {
      kind: "video",
      mimeType: "video/H264",
      clockRate: 90000,
      parameters: {
        "packetization-mode": 1,
        "profile-level-id": "42e01f",
        "level-asymmetry-allowed": 1,
      },
    },
  ],
};

const announcedAddress = getLocalIp();

// config/mediasoup.ts
export const webRtcTransportOptions: WebRtcTransportOptions = {
  listenInfos: [
    {
      protocol: "udp",
      ip: "0.0.0.0",
      announcedAddress: config.ANNOUNCED_IP ?? "192.168.1.173",
    },
    {
      protocol: "tcp",
      ip: "0.0.0.0",
      announcedAddress: config.ANNOUNCED_IP ?? "192.168.1.173",
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 600_000,
};

export function getIceServers() {
  const servers = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    // Free TURN — good for dev / testing (1 GB / month, no auth needed)
    {
      urls: ["turn:freestun.net:3478"],
      username: "free",
      credential: "free",
    },
    // TLS variant to pierce strict firewalls
    {
      urls: ["turns:freestun.net:5349"],
      username: "free",
      credential: "free",
    },
  ];

  return servers;
}
