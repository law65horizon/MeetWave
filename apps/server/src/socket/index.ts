import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type http from 'http';
import { redisPub, redisSub } from '../redis/client';
import { socketMiddleware, type AuthenticatedSocket } from '../middleware/index';
import { registerRoomHandlers, handleLeave } from './handlers/room';
import { registerMediaHandlers, cleanupSocketMedia } from './handlers/media';
import { registerChatHandlers, registerTimeSyncHandlers, registerModerationHandlers } from './handlers/chat';
import { logger } from '../lib/logger';
import { config } from '../config';
import { refreshParticipantHeartbeat } from '../redis/roomRepository';

export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
  });

  io.adapter(createAdapter(redisPub, redisSub));
  io.use(socketMiddleware);

  io.on('connection', (socket) => {
    const authed = socket as AuthenticatedSocket;
    logger.debug({ socketId: socket.id, uid: authed.data.id }, 'Socket connected');

    registerRoomHandlers(io, authed);
    registerMediaHandlers(io, authed);
    registerChatHandlers(io, authed);
    registerTimeSyncHandlers(io, authed);
    registerModerationHandlers(io, authed);

    socket.on('heartbeat', async () => {
      const roomId = authed.data.roomId;
      if (roomId) await refreshParticipantHeartbeat(roomId, socket.id);
    });

    // ONE exit path. The old code also had a 'disconnecting' handler that emitted
    // 'socket:disconnected' on top of handleLeave's 'participant:left' -> two events
    // per departure. handleLeave is idempotent and also unregisters producers.
    socket.on('disconnect', async (reason) => {
      logger.debug({ socketId: socket.id, uid: authed.data.id, reason }, 'Socket disconnected');
      try {
        cleanupSocketMedia(socket.id);
        await handleLeave(io, authed);
      } catch (err) {
        logger.error({ err }, 'disconnect cleanup failed');
      }
    });
  });

  return io;
}