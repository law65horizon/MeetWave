import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { workerPool } from "./mediasoup/workerPool";
import { createSocketServer } from "./socket";
import { redis, isRedisHealthy, connectRedis } from "./redis/client";
import { createRoom, getActiveRoomCount } from "./redis/roomRepository";
import { logger } from "./lib/logger";
import os from "os";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth/authRoutes";
import { requireAuth } from "./middleware";
import { AppRequest } from "./types";
import { findUserById } from "./routes/auth/authController";
import { AppError } from "./lib/error";
import { randomUUID } from "crypto";
import { pinoHttp } from "pino-http";
import { monitorEventLoopDelay } from "perf_hooks";
const SERVER_ID = os.hostname();

// ── perf metrics for /health (used by apps/perf) ──
// Event-loop delay is snapshotted every 5s so several pollers can read the same window.
const loopHist = monitorEventLoopDelay({ resolution: 10 });
loopHist.enable();
let eventLoop = { meanMs: 0, p50Ms: 0, p99Ms: 0, maxMs: 0 };
setInterval(() => {
  eventLoop = {
    meanMs: loopHist.mean / 1e6,
    p50Ms: loopHist.percentile(50) / 1e6,
    p99Ms: loopHist.percentile(99) / 1e6,
    maxMs: loopHist.max / 1e6,
  };
  loopHist.reset();
}, 5000).unref();
let ioRef: ReturnType<typeof createSocketServer> | undefined;
function generateRoomId(): string {
  const words = [
    "oak",
    "river",
    "pine",
    "lake",
    "moon",
    "star",
    "mist",
    "dawn",
    "sage",
    "fern",
    "iris",
    "wave",
  ];
  const a = words[Math.floor(Math.random() * words.length)];
  const b = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${a}-${b}-${n}`;
}

async function bootstrap() {
  connectRedis();
  // mediasoup workers
  await workerPool.init();

  // Express
  const app = express();
  app.use(express.json());

  app.use(pinoHttp({ logger }));
  app.use(
    cors({
      origin: config.CLIENT_ORIGIN,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "ngrok-skip-browser-warning",
      ],
    }),
  );
  app.use(cookieParser());

  // Health check
  app.get("/health", async (_req, res) => {
    const redisOk = await isRedisHealthy();
    const roomCount = await getActiveRoomCount();
    const workerStats = await workerPool.getWorkerStats();

    res.json({
      status: "ok",
      redis: redisOk ? "connected" : "disconnected",
      rooms: roomCount,
      workers: workerPool.workerCount,
      workerStats,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(), // cumulative µs {user, system}
      eventLoop,
      sockets: ioRef?.engine.clientsCount ?? 0,
      routers: workerPool.routerCount,
    });
  });

  app.post("/create", requireAuth, async (req: AppRequest, res) => {
    const { name, mode, isLocked, password, maxParticipants } = req.body;

    try {
      const userId = req.userId!;
      const user = await findUserById(userId);
      const roomId = generateRoomId();
      generateRoomId();

      if (!user) {
        throw new AppError("UNAUTHENTICATED", "User not found", 404);
      }

      const meta = {
        roomId,
        hostId: user?.id,
        hostName: user?.name,
        name: name || `${user?.name}'s Room`,
        mode,
        isLocked: isLocked ? "true" : ("false" as any),
        password: password ?? "",
        maxParticipants: maxParticipants ?? 50,
        createdAt: Date.now(),
        serverId: SERVER_ID,
      };

      await createRoom(meta);
      logger.info({ roomId, uid: user.id, mode }, "Room created");
      res.json({
        roomId,
      });
    } catch (err) {
      res.status(500).json("Internal Server Error");
    }
  });

  app.post("/demo/create", async (req: AppRequest, res) => {
    const { name, mode, isLocked, password, maxParticipants, displayName } =
      req.body;
    try {
      const userId = randomUUID();
      // const user = await findUserById(userId)
      const roomId = generateRoomId();
      generateRoomId();

      if (!displayName) {
        throw new AppError("FORBIDDEN", "No User Name", 403);
      }

      const meta = {
        roomId,
        hostId: userId,
        hostName: displayName,
        name: name || `${displayName}'s Room`,
        mode,
        isLocked: isLocked ? "true" : ("false" as any),
        password: password ?? "",
        maxParticipants: maxParticipants ?? 50,
        createdAt: Date.now(),
        serverId: SERVER_ID,
      };

      await createRoom(meta);
      logger.info({ roomId, id: userId, mode }, "Room created");
      res.status(201).json({
        userId,
        roomId,
      });
    } catch (err) {
      logger.error({ err });
      res.status(500).json("Internal Server Error");
    }
  });
  // routes
  app.use("/auth", authRouter);

  // 404
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  const httpServer = http.createServer(app);
  ioRef = createSocketServer(httpServer);

  httpServer.listen(config.PORT, "0.0.0.0", () => {
    logger.info(
      { port: config.PORT, env: config.NODE_ENV },
      "🚀 Server started",
    );
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down...");
    httpServer.close();
    redis.destroy();
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("uncaughtException", (err) =>
    logger.fatal({ err }, "Uncaught exception"),
  );
  process.on("unhandledRejection", (err) =>
    logger.error({ err }, "Unhandled rejection"),
  );
}

bootstrap().catch((err) => {
  logger.error("Bootstrap failed:", err);
  process.exit(1);
});
