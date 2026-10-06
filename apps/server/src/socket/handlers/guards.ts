import type { AuthenticatedSocket } from '../../middleware/index';
import { getRoom } from '../../redis/roomRepository';
import type { RoomMeta } from '../../types';

/** Socket.IO room that only the host's socket(s) join. Host-only events go here. */
export const hostRoom = (roomId: string) => `host:${roomId}`;

export type HostCheck =
  | { ok: true; roomId: string; room: RoomMeta }
  | { ok: false; error: string };

export async function requireHost(socket: AuthenticatedSocket): Promise<HostCheck> {
  const roomId = socket.data.roomId;
  if (!roomId) return { ok: false, error: 'NOT_IN_ROOM' };
  const room = await getRoom(roomId);
  if (!room || room.hostId !== socket.data.id) return { ok: false, error: 'NOT_HOST' };
  return { ok: true, roomId, room };
}