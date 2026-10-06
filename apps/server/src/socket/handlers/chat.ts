import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../../middleware/index';
import { logger } from '../../lib/logger';
import { v4 as uuidv4 } from 'uuid';
import { appendChatMessage } from '../../redis/roomRepository';
import { requireHost } from './guards';

export function registerChatHandlers(io: Server, socket: AuthenticatedSocket): void {
  // NOTE: never destructure socket.data at registration time. displayName/roomId
  // change after registration, so a snapshot goes stale (that was a source of
  // "undefined" sender names). Always read socket.data inside the handler.

  socket.on('chat:send', async (
    data: { text: string },
    cb: (res: { error?: string; messageId?: string }) => void,
  ) => {
    try {
      const { id, displayName, roomId } = socket.data;
      if (!roomId) return cb({ error: 'NOT_IN_ROOM' });
      if (!data?.text?.trim()) return cb({ error: 'EMPTY_MESSAGE' });

      const msg = {
        id: uuidv4(),
        roomId,
        senderId: id,
        senderName: displayName,
        senderPhoto: '',
        text: data.text.trim().slice(0, 2000),
        timestamp: Date.now(),
      };

      await appendChatMessage(msg);
      io.to(roomId).emit('chat:message', msg);
      cb({ messageId: msg.id });
    } catch (err) {
      logger.error({ err }, 'chat:send error');
      cb({ error: 'Failed to send message' });
    }
  });

  socket.on('chat:typing', (data: { isTyping: boolean }) => {
    const { id, displayName, roomId } = socket.data;
    if (!roomId) return;
    socket.to(roomId).emit('chat:typing', {
      socketId: socket.id,
      userId: id,
      displayName,
      isTyping: Boolean(data?.isTyping),
    });
  });

  socket.on('reaction:send', (data: { emoji: string }) => {
    const { id, displayName, roomId } = socket.data;
    if (!roomId) return;
    const allowed = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🔥', '💯'];
    if (!allowed.includes(data?.emoji)) return;
    io.to(roomId).emit('reaction:received', {
      socketId: socket.id,
      userId: id,
      displayName,
      emoji: data.emoji,
      timestamp: Date.now(),
    });
  });
}

export function registerTimeSyncHandlers(io: Server, socket: AuthenticatedSocket): void {
  /**
   * NTP-style sync. Client sends { t0 }, server stamps t1/t2, client computes
   * RTT = (t3 - t0) - (t2 - t1), offset = ((t1 - t0) + (t2 - t3)) / 2.
   */
  socket.on('time:sync', (_data: { t0: number }, cb: (res: { t1: number; t2: number; serverNow: number }) => void) => {
    const t1 = Date.now();
    const t2 = Date.now();
    cb({ t1, t2, serverNow: t2 });
  });

  socket.on('time:broadcast-request', () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;
    io.to(roomId).emit('time:server-tick', { serverNow: Date.now() });
  });
}

export function registerModerationHandlers(io: Server, socket: AuthenticatedSocket): void {
  socket.on('host:mute-all', async () => {
    const guard = await requireHost(socket);
    if (!guard.ok) return;
    socket.to(guard.roomId).emit('host:mute-all');
  });

  socket.on('host:disable-all-cameras', async () => {
    const guard = await requireHost(socket);
    if (!guard.ok) return;
    socket.to(guard.roomId).emit('host:disable-all-cameras');
  });

  socket.on('host:mute-participant', async (data: { socketId: string }) => {
    const guard = await requireHost(socket);
    if (!guard.ok) return;
    // Only sockets in the host's own room can be targeted.
    const [target] = await io.in(data.socketId).fetchSockets();
    if (!target || target.data?.roomId !== guard.roomId) return;
    io.to(data.socketId).emit('host:mute-you');
  });
}