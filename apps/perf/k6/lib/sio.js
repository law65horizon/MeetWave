// Minimal Socket.IO v4 client (Engine.IO v4, Socket.IO protocol v5) over k6/websockets.
// Supports exactly what the meeting server uses: default namespace, JSON events, acks.
import { WebSocket } from "k6/websockets";

export class SioClient {
  /**
   * @param {string} baseUrl  http://host:port
   * @param {object} auth     sent in the CONNECT packet (server reads socket.handshake.auth)
   */
  constructor(baseUrl, auth, opts = {}) {
    this.url = baseUrl.replace(/^http/, "ws") + "/socket.io/?EIO=4&transport=websocket";
    this.auth = auth || {};
    this.ackTimeoutMs = opts.ackTimeoutMs || 10000;
    this.connectTimeoutMs = opts.connectTimeoutMs || 10000;
    this.handlers = {};
    this.acks = new Map();
    this.nextId = 1;
    this.sid = null; // equals `socket.id` on the server
    this.connected = false;
    this.closed = false;
    this.onclose = null;
    this._settle = null;
  }

  on(event, fn) {
    this.handlers[event] = fn;
    return this;
  }

  /** Resolves once the server accepted the handshake (middleware passed). */
  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => settle(new Error("CONNECT_TIMEOUT")), this.connectTimeoutMs);
      const settle = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) {
          this.close();
          reject(err);
        } else resolve();
      };
      this._settle = settle;

      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onmessage = (ev) => this._onPacket(typeof ev.data === "string" ? ev.data : "");
      ws.onerror = (e) => settle(new Error("WS_ERROR:" + ((e && (e.error || e.message)) || "unknown")));
      ws.onclose = () => {
        this.closed = true;
        this.connected = false;
        settle(new Error("CLOSED_BEFORE_CONNECT"));
        this._failAcks(new Error("SOCKET_CLOSED"));
        if (this.onclose) this.onclose();
      };
    });
  }

  /** Fire and forget. */
  emit(event, data) {
    if (!this.connected) return;
    this.ws.send("42" + JSON.stringify(data === undefined ? [event] : [event, data]));
  }

  /** Emit and wait for the server's acknowledgement (first ack argument). */
  request(event, data) {
    return new Promise((resolve, reject) => {
      if (!this.connected) return reject(new Error("NOT_CONNECTED"));
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.acks.delete(id);
        reject(new Error("ACK_TIMEOUT:" + event));
      }, this.ackTimeoutMs);
      this.acks.set(id, { resolve, reject, timer });
      this.ws.send("42" + id + JSON.stringify(data === undefined ? [event] : [event, data]));
    });
  }

  close() {
    this.connected = false;
    try {
      if (this.ws && !this.closed) this.ws.close();
    } catch (_) {
      /* already closing */
    }
  }

  _failAcks(err) {
    for (const [, a] of this.acks) {
      clearTimeout(a.timer);
      a.reject(err);
    }
    this.acks.clear();
  }

  _onPacket(msg) {
    if (!msg) return;
    switch (msg.charAt(0)) {
      case "0": // Engine.IO OPEN -> send Socket.IO CONNECT with auth
        this.ws.send("40" + JSON.stringify(this.auth));
        return;
      case "2": // Engine.IO PING -> PONG (miss these and the server drops us after pingTimeout)
        this.ws.send("3");
        return;
      case "4":
        return this._onSocketIo(msg.slice(1));
      default:
        return; // 1 close, 3 pong, 6 noop
    }
  }

  _onSocketIo(body) {
    const type = body.charAt(0);
    if (type === "0") {
      // CONNECT ok: 0{"sid":"..."}
      try {
        this.sid = JSON.parse(body.slice(1)).sid;
      } catch (_) {
        /* ignore */
      }
      this.connected = true;
      if (this._settle) this._settle(null);
    } else if (type === "4") {
      // CONNECT_ERROR: 4{"message":"NOT_IN_ROOM"}
      let m = "CONNECT_ERROR";
      try {
        m = JSON.parse(body.slice(1)).message || m;
      } catch (_) {
        /* ignore */
      }
      if (this._settle) this._settle(new Error(m));
    } else if (type === "1") {
      this.close(); // server-initiated DISCONNECT
    } else if (type === "2" || type === "3") {
      // EVENT: 2[id]["name",...args]   ACK: 3<id>[...args]
      let i = 1;
      while (i < body.length && body.charCodeAt(i) >= 48 && body.charCodeAt(i) <= 57) i++;
      const id = i > 1 ? Number(body.slice(1, i)) : null;
      let arr;
      try {
        arr = JSON.parse(body.slice(i));
      } catch (_) {
        return;
      }
      if (type === "2") {
        const h = this.handlers[arr[0]];
        if (h) h(...arr.slice(1));
      } else {
        const a = this.acks.get(id);
        if (a) {
          clearTimeout(a.timer);
          this.acks.delete(id);
          a.resolve(arr[0]);
        }
      }
    }
  }
}
