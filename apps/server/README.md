# MeetWave Server (`meetapp-server`)

The backend for MeetWave: an Express HTTP API plus a Socket.IO signalling server that drives
[mediasoup](https://mediasoup.org/) (an SFU for WebRTC). All persistent state, including user accounts,
lives in Redis.

> Package name: `meetapp-server` (`apps/server/package.json`). Description from the manifest:
> "WebRTC meeting server with mediasoup + Redis".

## What it does

- Registers and authenticates users with email and password. Tokens are httpOnly cookies, and refresh tokens rotate on every use.
- Creates meeting rooms, either as a signed-in user (`POST /create`) or as an anonymous "demo" host (`POST /demo/create`).
- Runs the realtime side of a meeting over Socket.IO: joining, a waiting room, host moderation, chat, reactions, clock sync and WebRTC signalling.
- Relays audio and video through mediasoup workers. Each room gets one mediasoup `Router`.
- Scales out the Socket.IO layer through the Redis adapter. See the limits in [Architecture](docs/ARCHITECTURE.md#scaling-model-and-limits).

## Tech stack

| Concern | Library (from `package.json`) |
|---|---|
| Runtime | Node.js `>=24` (`engines`), TypeScript `^5.5.3`, CommonJS-style output via `module: nodenext` |
| HTTP | `express ^4.19.2`, `cors`, `cookie-parser`, `pino-http` |
| Realtime | `socket.io ^4.7.5`, `@socket.io/redis-adapter ^8.3.0` |
| Media (SFU) | `mediasoup ^3.14.8` |
| Storage | `redis ^5.11.0` (node-redis client) |
| Auth | `jsonwebtoken`, `bcryptjs` |
| Validation / config | `zod`, `dotenv` |
| Logging | `pino`, `pino-pretty` |
| Other | `uuid`, `firebase-admin` (listed as a dependency, but never imported in `src/`) |

## Prerequisites

- Node.js 24 or newer
- pnpm `12.9.1` (pinned by the root `packageManager` field)
- A reachable Redis instance, with a password. `REDIS_PASSWORD` is required.
- Build tools that `mediasoup` needs to compile its native worker if no prebuilt binary applies. The repo allows its build script in `pnpm-workspace.yaml` (`allowBuilds: mediasoup: true`) and in `apps/server/package.json` (`pnpm.onlyBuiltDependencies`).

## Setup

From the **repository root**:

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # then fill in the values, see docs below
pnpm --filter ./apps/server dev
```

`apps/server/.env.example` lists every variable name with empty values. See
[Configuration](../../docs/CONFIGURATION.md) for what each one does and which ones are required.

## Scripts

Copied from `apps/server/package.json`:

| Script | Command | Notes |
|---|---|---|
| `dev` | `ts-node-dev --respawn --transpile-only src/server.ts` | Auto-restarts and skips type checking |
| `build` | `tsc` | Emits to `dist/` (`outDir` in `tsconfig.json`) |
| `start` | `node dist/server.js` | Run after `build` |
| `lint` | `eslint src --ext .ts` | No ESLint config or ESLint dependency exists in this package, so the script will not work as is |

There is no test script and there are no tests in this package.

## Runtime behaviour worth knowing before you run it

- The HTTP server listens on `127.0.0.1` only (`server.ts`: `httpServer.listen(config.PORT, '127.0.0.1', …)`). It is **not** reachable from other machines. Put a reverse proxy on the same host in front of it.
- The default port is `3001` (`config/index.ts`). The Dockerfile also `EXPOSE`s `3001`.
- On boot it connects to Redis, spawns `MEDIASOUP_WORKER_COUNT` mediasoup workers, then starts listening. A bad environment makes the process exit immediately with the Zod field errors (`config/index.ts`).
- `GET /health` reports Redis state, active room count, worker count and per-worker resource usage.

## Documentation

| Doc | What is in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Modules, startup, request and socket flows, scaling limits |
| [docs/API.md](docs/API.md) | REST endpoints: request, response, status codes, cookies |
| [docs/SOCKET_EVENTS.md](docs/SOCKET_EVENTS.md) | Every Socket.IO event, its payload, acknowledgement and errors |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Redis keys, types and TTLs |
| [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) | Verified inconsistencies and dead code in this package |
| [Root docs](../../docs/) | Cross-app architecture, deployment, security, troubleshooting |

## Source layout

```
apps/server/
├── Dockerfile            Multi-stage build (prod-deps → build → runtime), runs as user `node`
├── .env.example          Variable names only
├── tsconfig.json         ES2022, strict, module nodenext, outDir ./dist
└── src/
    ├── server.ts         Bootstrap, Express app, REST routes outside /auth, graceful shutdown
    ├── config/
    │   ├── index.ts      Zod-validated environment → `config`
    │   └── mediasoup.ts  Worker/router/transport options and the ICE server list
    ├── lib/              `logger.ts` (pino), `error.ts` (`AppError`)
    ├── middleware/
    │   ├── index.ts      `requireAuth` (HTTP) and `socketMiddleware` (Socket.IO handshake)
    │   ├── authenticate.ts  JWT signing and verification, refresh-token rotation in Redis
    │   └── cookies.ts    Cookie names, options, set and clear helpers
    ├── mediasoup/
    │   ├── workerPool.ts Worker round-robin and the roomId → Router map (in use)
    │   └── workerManager.js  Older CommonJS variant (unused, see KNOWN_ISSUES)
    ├── redis/
    │   ├── client.ts     Three clients: main, pub, sub
    │   └── roomRepository.ts  All room, participant, chat, waiting and producer persistence
    ├── routes/auth/      `authRoutes.ts` (endpoints) and `authController.ts` (user persistence)
    ├── socket/
    │   ├── index.ts      Creates the Socket.IO server and wires handlers
    │   └── handlers/     `room.ts`, `media.ts`, `chat.ts` (chat, time sync, moderation), `guards.ts`
    ├── services/chat.ts  Empty file
    └── types/index.ts    Shared TypeScript types (`RoomMeta`, `ParticipantMeta`, …)
```
