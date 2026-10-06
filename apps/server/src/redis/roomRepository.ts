import { redis } from './client';
import type { RoomMeta, ParticipantMeta, ChatMessage, WaitingEntry } from '../types';

const ROOM_TTL = 4 * 60 * 60;
const CHAT_MAX = 100;

const K = {
  room: (id: string) => `room:${id}`,
  participants: (id: string) => `room:${id}:participants`,
  chat: (id: string) => `room:${id}:chat`,
  waiting: (id: string) => `room:${id}:waiting`,
  admitted: (id: string) => `room:${id}:admitted`,
  producers: (id: string) => `room:${id}:producers`,
  activeRooms: () => `rooms:active`,
  userRoom: (uid: string) => `user:${uid}:room`,
};

/** Redis hashes only hold strings. Drop null/undefined, stringify the rest. */
function toHash(obj: object): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return out;
}

// ─── Room ─────────────────────────────────────

export async function createRoom(meta: RoomMeta): Promise<void> {
  // Errors are intentionally NOT swallowed: a silently failed create looks like
  // "ROOM_NOT_FOUND" later and is very hard to trace.
  const tx = redis.multi();
  tx.hSet(K.room(meta.roomId), toHash(meta));
  tx.expire(K.room(meta.roomId), ROOM_TTL);
  tx.zAdd(K.activeRooms(), { score: Date.now(), value: meta.roomId });
  await tx.exec();
}

export async function getRoom(roomId: string): Promise<RoomMeta | null> {
  const data = await redis.hGetAll(K.room(roomId));
  if (!data || !data.roomId) return null;

  return {
    ...data,
    isLocked: data.isLocked === 'true',
    // BUG FIX: Redis returns the STRING "false", which is truthy. Without this,
    // every room was treated as private and the socket middleware never set displayName.
    private: data.private === 'true',
    password: data.password || undefined,
    maxParticipants: Number(data.maxParticipants),
    createdAt: Number(data.createdAt),
  } as unknown as RoomMeta;
}

export async function updateRoom(roomId: string, fields: Partial<RoomMeta>): Promise<void> {
  const hash = toHash(fields);
  if (Object.keys(hash).length > 0) await redis.hSet(K.room(roomId), hash);
  await redis.expire(K.room(roomId), ROOM_TTL);
}

export async function deleteRoom(roomId: string): Promise<void> {
  const tx = redis.multi();
  tx.del(K.room(roomId));
  tx.del(K.participants(roomId));
  tx.del(K.chat(roomId));
  tx.del(K.waiting(roomId));
  tx.del(K.admitted(roomId));
  tx.del(K.producers(roomId));
  tx.zRem(K.activeRooms(), roomId);
  await tx.exec();
}

export async function roomExists(roomId: string): Promise<boolean> {
  return (await redis.exists(K.room(roomId))) === 1;
}

// ─── Participants ─────────────────────────────

export async function addParticipant(p: ParticipantMeta): Promise<void> {
  const tx = redis.multi();
  tx.hSet(K.participants(p.roomId), p.socketId, JSON.stringify(p));
  tx.expire(K.participants(p.roomId), ROOM_TTL);
  tx.set(K.userRoom(p.userId), p.roomId, { EX: ROOM_TTL });
  await tx.exec();
}

/**
 * Idempotent. Returns the removed participant ONLY for the caller that actually
 * deleted the record, otherwise null. Callers broadcast "left" only when non-null,
 * so room:leave + disconnect (or two server instances) can never double-announce.
 */
export async function removeParticipant(
  roomId: string,
  socketId: string,
  userId: string,
): Promise<ParticipantMeta | null> {
  const raw = await redis.hGet(K.participants(roomId), socketId);
  if (!raw) return null;

  const deleted = await redis.hDel(K.participants(roomId), socketId);
  if (Number(deleted) !== 1) return null; // someone else won the race

  const mapped = await redis.get(K.userRoom(userId));
  if (mapped === roomId) await redis.del(K.userRoom(userId));

  return JSON.parse(raw) as ParticipantMeta;
}

export async function getParticipants(roomId: string): Promise<ParticipantMeta[]> {
  const data = await redis.hGetAll(K.participants(roomId));
  if (!data) return [];
  return Object.values(data).map((v) => JSON.parse(v) as ParticipantMeta);
}

export async function getParticipant(roomId: string, socketId: string): Promise<ParticipantMeta | null> {
  const data = await redis.hGet(K.participants(roomId), socketId);
  return data ? (JSON.parse(data) as ParticipantMeta) : null;
}

export async function updateParticipant(p: ParticipantMeta): Promise<void> {
  await redis.hSet(K.participants(p.roomId), p.socketId, JSON.stringify(p));
}

export async function getParticipantCount(roomId: string): Promise<number> {
  return redis.hLen(K.participants(roomId));
}

export async function refreshParticipantHeartbeat(roomId: string, socketId: string): Promise<void> {
  const raw = await redis.hGet(K.participants(roomId), socketId);
  if (!raw) return;
  const p = JSON.parse(raw) as ParticipantMeta;
  p.lastSeen = Date.now();
  await redis.hSet(K.participants(roomId), socketId, JSON.stringify(p));
}

// ─── Chat ─────────────────────────────────────

export async function appendChatMessage(msg: ChatMessage): Promise<void> {
  const key = K.chat(msg.roomId);
  const tx = redis.multi();
  tx.rPush(key, JSON.stringify(msg));
  tx.lTrim(key, -CHAT_MAX, -1);
  tx.expire(key, ROOM_TTL);
  await tx.exec();
}

export async function getChatHistory(roomId: string): Promise<ChatMessage[]> {
  const messages = await redis.lRange(K.chat(roomId), 0, -1);
  return messages.map((m) => JSON.parse(m) as ChatMessage);
}

// ─── Waiting Room ─────────────────────────────

export async function addWaitingEntry(roomId: string, entry: WaitingEntry): Promise<void> {
  await redis.hSet(K.waiting(roomId), entry.socketId, JSON.stringify(entry));
  await redis.expire(K.waiting(roomId), ROOM_TTL);
}

/** Returns true only for the caller that actually removed the entry (atomic gate for admit/deny). */
export async function removeWaitingEntry(roomId: string, socketId: string): Promise<boolean> {
  return Number(await redis.hDel(K.waiting(roomId), socketId)) === 1;
}

export async function isWaiting(roomId: string, socketId: string): Promise<boolean> {
  return Boolean(await redis.hExists(K.waiting(roomId), socketId));
}

export async function getWaitingList(roomId: string): Promise<WaitingEntry[]> {
  const data = await redis.hGetAll(K.waiting(roomId));
  if (!data) return [];
  return Object.values(data).map((v) => JSON.parse(v) as WaitingEntry);
}

/** Host approved this socket: it may call room:join once and skip the lock check. */
export async function markAdmitted(roomId: string, socketId: string): Promise<void> {
  await redis.sAdd(K.admitted(roomId), socketId);
  await redis.expire(K.admitted(roomId), ROOM_TTL);
}

/** One-shot: returns true exactly once per admission. */
export async function consumeAdmission(roomId: string, socketId: string): Promise<boolean> {
  return Number(await redis.sRem(K.admitted(roomId), socketId)) === 1;
}

// ─── Producers ───────────────────────────────

export async function registerProducer(roomId: string, producerId: string, info: object): Promise<void> {
  await redis.hSet(K.producers(roomId), producerId, JSON.stringify(info));
  await redis.expire(K.producers(roomId), ROOM_TTL);
}

export async function unregisterProducer(roomId: string, producerId: string): Promise<void> {
  await redis.hDel(K.producers(roomId), producerId);
}

export async function getProducers(roomId: string): Promise<Record<string, unknown>[]> {
  const data = await redis.hGetAll(K.producers(roomId));
  if (!data) return [];
  return Object.values(data).map((v) => JSON.parse(v));
}

// ─── Active Rooms ─────────────────────────────

export async function getActiveRoomCount(): Promise<number> {
  return redis.zCard(K.activeRooms());
}