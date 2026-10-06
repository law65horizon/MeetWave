import type { Server } from "socket.io";
import type { AuthenticatedSocket } from "../../middleware/index";
import {
  getRoom,
  deleteRoom,
  addParticipant,
  removeParticipant,
  getParticipants,
  getParticipantCount,
  updateRoom,
  addWaitingEntry,
  removeWaitingEntry,
  isWaiting,
  getWaitingList,
  getChatHistory,
  getProducers,
  unregisterProducer,
  markAdmitted,
  consumeAdmission,
} from "../../redis/roomRepository";
import { workerPool } from "../../mediasoup/workerPool";
import { logger } from "../../lib/logger";
import type { RoomMeta } from "../../types";
import { hostRoom, requireHost } from "./guards";

interface JoinResponse {
  id?: string;
  error?: string;
  waiting?: boolean;
  room?: Omit<RoomMeta, 'password'>;
  participants?: unknown[];
  chatHistory?: unknown[];
  producers?: unknown[];
  rtpCapabilities?: unknown;
}
type JoinCb = (res: JoinResponse) => void;
type AckCb = (res: { error?: string }) => void;

export function registerRoomHandlers(
  io: Server,
  socket: AuthenticatedSocket,
): void {
  // Serialise join attempts per socket. A double emit (StrictMode, retries) can no
  // longer race past the "already joined" check and double-announce.
  let joinChain: Promise<void> = Promise.resolve();

  socket.on(
    "room:join",
    (data: { password?: string } | undefined, cb: JoinCb) => {
      if (typeof cb !== "function") return;
      joinChain = joinChain.then(() => handleJoin(io, socket, data ?? {}, cb));
    },
  );

  // ─── ADMIT / DENY ─────────────────────────────────────────────────────────
  socket.on("waiting:admit", async (data: { socketId: string }, cb: AckCb) => {
    try {
      const guard = await requireHost(socket);
      if (!guard.ok) return cb({ error: guard.error });

      // Atomic: only one admit/deny can ever succeed for a given waiting socket.
      const removed = await removeWaitingEntry(guard.roomId, data.socketId);
      if (!removed) return cb({ error: "NOT_WAITING" });

      await markAdmitted(guard.roomId, data.socketId); // BEFORE notifying the guest
      io.to(data.socketId).emit("waiting:admitted");
      io.to(hostRoom(guard.roomId)).emit("waiting:removed", {
        socketId: data.socketId,
      });
      cb({});
    } catch (err) {
      logger.error({ err }, "waiting:admit error");
      cb({ error: "Failed" });
    }
  });

  socket.on("waiting:deny", async (data: { socketId: string }, cb: AckCb) => {
    try {
      const guard = await requireHost(socket);
      if (!guard.ok) return cb({ error: guard.error });

      const removed = await removeWaitingEntry(guard.roomId, data.socketId);
      if (!removed) return cb({ error: "NOT_WAITING" });

      io.to(data.socketId).emit("waiting:denied");
      io.to(hostRoom(guard.roomId)).emit("waiting:removed", {
        socketId: data.socketId,
      });
      cb({});
    } catch (err) {
      logger.error({ err }, "waiting:deny error");
      cb({ error: "Failed" });
    }
  });

  socket.on("waiting:list", async (cb: (list: unknown[]) => void) => {
    if (typeof cb !== "function") return;
    const guard = await requireHost(socket);
    if (!guard.ok) return cb([]);
    cb(await getWaitingList(guard.roomId));
  });

  // ─── LOCK / UNLOCK ────────────────────────────────────────────────────────
  socket.on("room:lock", async (data: { locked: boolean }, cb: AckCb) => {
    try {
      const guard = await requireHost(socket);
      if (!guard.ok) return cb({ error: guard.error });

      await updateRoom(guard.roomId, { isLocked: Boolean(data.locked) });
      io.to(guard.roomId).emit("room:locked", {
        locked: Boolean(data.locked),
        by: socket.data.displayName,
      });
      cb({});
    } catch (err) {
      logger.error({ err }, "room:lock error");
      cb({ error: "Failed" });
    }
  });

  // ─── LEAVE ────────────────────────────────────────────────────────────────
  socket.on("room:leave", async () => {
    await handleLeave(io, socket);
  });

  // ─── END ROOM (host) ──────────────────────────────────────────────────────
  socket.on("room:end", async (cb: AckCb) => {
    try {
      const guard = await requireHost(socket);
      if (!guard.ok) return cb?.({ error: guard.error });
      const { roomId } = guard;

      const [members, waiting] = await Promise.all([
        io.in(roomId).fetchSockets(),
        getWaitingList(roomId),
      ]);

      // Delete FIRST so the disconnect handlers below find no participant record
      // and therefore don't broadcast a "X left" for every person after the end.
      await deleteRoom(roomId);
      workerPool.closeRouter(roomId);

      cb?.({}); // ack before we disconnect the host's own socket

      io.to(roomId).emit("room:ended", { by: socket.data.displayName });
      for (const w of waiting)
        io.to(w.socketId).emit("room:ended", { by: socket.data.displayName });
      for (const s of members) s.disconnect(true);
      logger.info({ roomId }, "Room ended by host");
    } catch (err) {
      logger.error({ err }, "room:end error");
      cb?.({ error: "Failed" });
    }
  });

  // ─── KICK ─────────────────────────────────────────────────────────────────
  socket.on("host:kick", async (data: { socketId: string }, cb: AckCb) => {
    try {
      const guard = await requireHost(socket);
      if (!guard.ok) return cb?.({ error: guard.error });
      if (data.socketId === socket.id)
        return cb?.({ error: "CANNOT_KICK_SELF" });

      // Only sockets that are actually in THIS room can be kicked.
      const [target] = await io.in(data.socketId).fetchSockets();
      if (!target || target.data?.roomId !== guard.roomId)
        return cb?.({ error: "NOT_IN_ROOM" });

      io.to(data.socketId).emit("room:kicked");
      target.disconnect(true); // disconnect handler announces "left" exactly once
      cb?.({});
    } catch (err) {
      logger.error({ err }, "host:kick error");
      cb?.({ error: "Failed" });
    }
  });
}

// ─── JOIN ───────────────────────────────────────────────────────────────────
async function handleJoin(
  io: Server,
  socket: AuthenticatedSocket,
  data: { password?: string },
  cb: JoinCb,
) {
  try {
    // The room is fixed by the authenticated handshake. Trusting a roomId from the
    // payload would let a socket authorised for a public room join a private one.
    const roomId = socket.data.requestedRoomId;
    const { id } = socket.data;

    const room = await getRoom(roomId);
    if (!room) return cb({ error: "ROOM_NOT_FOUND" });

    const isHost = id === room.hostId;

    if (socket.data.roomId !== roomId) {
      const admitted = await consumeAdmission(roomId, socket.id);

      if (!admitted) {
        if (room.password && data.password !== room.password)
          return cb({ error: "WRONG_PASSWORD" });
        if (room.isLocked && !isHost)
          return await enqueueWaiting(io, socket, roomId, cb);
      }

      await evictStaleSessions(io, socket, roomId);

      if ((await getParticipantCount(roomId)) >= room.maxParticipants)
        return cb({ error: "ROOM_FULL" });

      await joinRoom(io, socket, room, isHost);
    }
    // else: duplicate join emit from an already-joined socket -> just return state, no re-broadcast.

    socket.data.waitingRoomId = undefined;

    const [participants, chatHistory, producers, router] = await Promise.all([
      getParticipants(roomId),
      getChatHistory(roomId),
      getProducers(roomId),
      workerPool.getOrCreateRouter(roomId),
    ]);

    const {password: _omit, ...safeRoom} = room
    cb({
      id,
      room: safeRoom,
      participants,
      chatHistory,
      producers,
      rtpCapabilities: router.rtpCapabilities,
    });
  } catch (err) {
    logger.error({ err }, "room:join error");
    cb({ error: "Failed to join room" });
  }
}

async function enqueueWaiting(
  io: Server,
  socket: AuthenticatedSocket,
  roomId: string,
  cb: JoinCb,
) {
  // Idempotent: a repeat join while already queued must not re-notify the host.
  if (!(await isWaiting(roomId, socket.id))) {
    const entry = {
      socketId: socket.id,
      userId: socket.data.id,
      displayName: socket.data.displayName,
      photoURL: "",
      requestedAt: Date.now(),
    };
    await addWaitingEntry(roomId, entry);
    socket.data.waitingRoomId = roomId; // NOT roomId: a waiting socket must not count as "in the room"
    io.to(hostRoom(roomId)).emit("waiting:request", entry); // host only, not the whole room
    logger.info({ roomId, id: socket.data.id }, "Added to waiting room");
  }
  cb({ waiting: true, id: socket.data.id });
}

/**
 * Same account re-joining (page refresh, second tab) while the old socket is still
 * alive until pingTimeout. Replace the old session so the room never shows the
 * same person twice.
 */
async function evictStaleSessions(
  io: Server,
  socket: AuthenticatedSocket,
  roomId: string,
) {
  const { id } = socket.data;
  for (const p of await getParticipants(roomId)) {
    if (p.userId !== id || p.socketId === socket.id) continue;
    const removed = await removeParticipant(roomId, p.socketId, p.userId);
    if (!removed) continue;
    io.to(p.socketId).emit("room:replaced");
    io.to(roomId).emit("participant:left", {
      socketId: p.socketId,
      userId: p.userId,
      displayName: p.displayName,
    });
    io.in(p.socketId).disconnectSockets(true);
  }
}

async function joinRoom(
  io: Server,
  socket: AuthenticatedSocket,
  room: RoomMeta,
  isHost: boolean,
) {
  const { id, displayName } = socket.data;
  const roomId = room.roomId;

  let role: "host" | "broadcaster" | "viewer" | "participant";
  if (isHost) role = room.mode === "broadcast" ? "broadcaster" : "host";
  else role = room.mode === "broadcast" ? "viewer" : "participant";

  const participantMeta = {
    socketId: socket.id,
    userId: id,
    displayName,
    photoURL: "",
    roomId,
    isHost,
    role,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
  };

  await addParticipant(participantMeta);
  socket.data.roomId = roomId;
  await socket.join(roomId);
  if (isHost) await socket.join(hostRoom(roomId));

  socket.to(roomId).emit("participant:joined", participantMeta);
  logger.info({ roomId, id, role }, "Participant joined");
}

// ─── LEAVE (single, idempotent exit path for room:leave AND disconnect) ──────
export async function handleLeave(
  io: Server,
  socket: AuthenticatedSocket,
): Promise<void> {
  const { id } = socket.data;

  // 1. Waiting-queue cleanup, so the host never sees ghost entries.
  const waitingRoomId = socket.data.waitingRoomId;
  if (waitingRoomId) {
    socket.data.waitingRoomId = undefined;
    await removeWaitingEntry(waitingRoomId, socket.id);
    io.to(hostRoom(waitingRoomId)).emit("waiting:removed", {
      socketId: socket.id,
    });
  }

  // 2. Claim the roomId SYNCHRONOUSLY, before any await. Two concurrent calls
  //    (room:leave + disconnect) can no longer both pass this check.
  const roomId = socket.data.roomId;
  if (!roomId) return;
  socket.data.roomId = undefined;

  await socket.leave(roomId);
  await socket.leave(hostRoom(roomId));

  // 3. Producer registry cleanup (must happen even on a clean room:leave).
  const producers = await getProducers(roomId);
  await Promise.all(
    producers
      .filter((p) => p.socketId === socket.id)
      .map((p) => unregisterProducer(roomId, String(p.producerId))),
  );

  // 4. Only the call that actually deleted the record announces the departure.
  const removed = await removeParticipant(roomId, socket.id, id);
  if (!removed) return;

  io.to(roomId).emit("participant:left", {
    socketId: socket.id,
    userId: id,
    displayName: removed.displayName || socket.data.displayName,
  });

  if ((await getParticipantCount(roomId)) === 0) {
    logger.info({ roomId }, "Room empty, will expire via TTL");
    workerPool.closeRouter(roomId);
  }
}
