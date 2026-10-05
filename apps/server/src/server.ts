import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { initFirebase } from './firebase';
import { workerPool } from './mediasoup/workerPool';
import { createSocketServer } from './socket';
import { redis, isRedisHealthy, connectRedis } from './redis/client';
import { createRoom, getActiveRoomCount } from './redis/roomRepository';
import { logger } from './lib/logger';
import os from 'os'
import cookieParser from 'cookie-parser'
import { authRouter } from './routes/auth/authRoutes';
import { requireAuth } from './middleware';
import { AppRequest } from './types';
import { findUserById } from './routes/auth/authController';
import { AppError } from './lib/error';
const SERVER_ID = os.hostname();
function generateRoomId(): string {
  const words = ['oak','river','pine','lake','moon','star','mist','dawn','sage','fern','iris','wave'];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}-${b}-${n}`;
}

async function bootstrap() {
  // Firebase
  // initFirebase();

  connectRedis()
  // mediasoup workers
  await workerPool.init();

  // Express
  const app = express();
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(cookieParser())

  // Health check
  app.get('/health', async (_req, res) => {
    const redisOk = await isRedisHealthy();
    const roomCount = await getActiveRoomCount();
    const workerStats = await workerPool.getWorkerStats();

    res.json({
      status: 'ok',
      redis: redisOk ? 'connected' : 'disconnected',
      rooms: roomCount,
      workers: workerPool.workerCount,
      workerStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  app.post('/create', requireAuth, async (req: AppRequest, res) => {
    const {name, mode, isLocked, password, maxParticipants} = req.body

    try {
      const userId = req.userId!
      const user = await findUserById(userId)
      const roomId = 'james'
      // generateRoomId();

      if (!user) {
        throw new AppError("UNAUTHENTICATED", "User not found", 401)
      }
    
      console.log('creating')
      const meta = {
        roomId,
        hostId: user?.id,
        hostName: user?.name,
        name: name || `${user?.name}'s Room`,
        mode,
        isLocked: isLocked ? 'true' : 'false' as any,
        password: password ?? '',
        maxParticipants: maxParticipants ?? 50,
        createdAt: Date.now(),
        serverId: SERVER_ID,
      };
    
      console.log({meta})
    
      await createRoom(meta);
      console.log('created')
      logger.info({ roomId, uid: user.id, mode }, 'Room created');
      res.json({
        roomId
      })
    } catch (err) {
      res.status(500).json("Internal Server Error")
    }
  })

  // routes
  app.use("/auth", authRouter)

  // 404
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  const httpServer = http.createServer(app);
  createSocketServer(httpServer);

  httpServer.listen(config.PORT, () => {
    logger.info({ port: config.PORT, env: config.NODE_ENV }, '🚀 Server started');
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    httpServer.close();
    redis.destroy();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => logger.fatal({ err }, 'Uncaught exception'));
  process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});