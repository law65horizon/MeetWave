# Configuration Reference

All configuration is through environment variables. Values are never documented here, only names, rules and what the code does with them.

## Server (`apps/server`)

Validated at startup by a Zod schema in `apps/server/src/config/index.ts`, after `dotenv` loads `apps/server/.env` (or the process environment). If validation fails the process prints the offending fields and exits with code 1.

`apps/server/.env.example` lists the 16 variables below as empty assignments.

| Variable | Required | Default | Rule | Actually used for |
|---|---|---|---|---|
| `PORT` | no | `3001` | string → number | HTTP listen port. The Compose healthcheck also reads it |
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` | Log level (`info` in production, else `debug`), pretty logging outside production, cookie `secure` flag |
| `CLIENT_ORIGIN` | no | `http://localhost:5173` | string | The allowed browser origin for REST CORS and Socket.IO CORS. REST CORS also always allows `http://localhost:5173` |
| `REDIS_URL` | no | `redis://localhost:6379` | string | **Used as the Redis host name**, not as a URL (`redis/client.ts`). Set a bare host such as `localhost` |
| `REDIS_PORT` | **yes** | none | string | Redis port (`parseInt`) |
| `REDIS_PASSWORD` | **yes** | none | string | Redis password. The client always logs in as user `default` |
| `COOKIE_SECRET` | **yes** | none | min 32 chars | Validated but **not used** by any code |
| `JWT_ACCESS_SECRET` | **yes** | none | min 32 chars | Signs access tokens (HS256) |
| `JWT_REFRESH_SECRET` | **yes** | none | min 32 chars | Signs refresh tokens |
| `MEDIASOUP_WORKER_COUNT` | no | `4` | string → number | Number of mediasoup worker processes |
| `MEDIASOUP_MIN_PORT` | no | `40000` | string → number | Validated but **not used** (see below) |
| `MEDIASOUP_MAX_PORT` | no | `49999` | string → number | Validated but **not used** |
| `ANNOUNCED_IP` | no | `127.0.0.1` | string | The IP clients are told to send media to (mediasoup `announcedAddress`). Must be the server's address **as seen by the browsers** |
| `TURN_URLS` | no | none | optional string | Validated but **not used** |
| `TURN_USERNAME` | no | none | optional string | Validated but **not used** |
| `TURN_CREDENTIAL` | no | none | optional string | Validated but **not used** |

Two more values are in the schema but are **not environment variables** you can set: `TTL_ACCESS_SECRET` (default `1800000`) and `TTL_REFRESH_SECRET` (default `604800000`) are declared as `z.number()`, but environment values are always strings, so setting them in the environment would fail validation. In practice they are fixed at their defaults. They are described in [KNOWN_ISSUES.md](KNOWN_ISSUES.md) (units issue).

### Values hard-coded instead of configurable

| Setting | Value | File |
|---|---|---|
| mediasoup worker port range | `10000`–`10100` | `config/mediasoup.ts` |
| Router codecs | Opus 48 kHz stereo; VP8; H264 (profile `42e01f`, packetization mode 1) | `config/mediasoup.ts` |
| Initial outgoing bitrate | `600000` | `config/mediasoup.ts` |
| ICE servers | Google STUN ×2, `freestun.net` TURN and TURNS with shared public credentials | `config/mediasoup.ts` |
| Room TTL | 4 hours | `redis/roomRepository.ts` |
| Chat history limit | 100 messages | `redis/roomRepository.ts` |
| Bcrypt cost | 12 | `routes/auth/authRoutes.ts` |
| Socket ping | interval 10 s, timeout 20 s | `socket/index.ts` |
| Listen address | `127.0.0.1` | `server.ts` |

### Docker Compose pass-through

`compose.yaml` passes these into the `server` container from the shell or a root-level `.env` (Compose's `${VAR}` substitution): `PORT`, `NODE_ENV`, `CLIENT_ORIGIN`, `REDIS_URL`, `REDIS_PASSWORD`, `COOKIE_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_SECRET`, `REDIS_PORT`, `MEDIASOUP_WORKER_COUNT`, `MEDIASOUP_MIN_PORT`, `MEDIASOUP_MAX_PORT`, `ANNOUNCED_IP`, `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`. Any variable not listed there cannot reach the container. A root `.env` is git-ignored (`.gitignore`) and excluded from the build context (`.dockerignore`: `.env*`).

## UI (`apps/ui`)

Vite exposes variables prefixed `VITE_` at build time. They are baked into the bundle, so **changing one requires a rebuild**.

| Variable | Required | Used in | Meaning |
|---|---|---|---|
| `VITE_API_URL` | **yes** | `src/lib/api.ts`, `src/lib/socket.ts` | Server base URL for both REST and Socket.IO. Trailing slash is removed for REST |

`VITE_SERVER_URL` appears in `src/config.js`, but that file is not imported.

## Minimum working local setup (checklist)

1. `apps/server/.env` has non-empty `REDIS_PORT`, `REDIS_PASSWORD`, `COOKIE_SECRET`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (the last three at least 32 characters each).
2. `REDIS_URL` is a **host name** (for example `localhost`), and a Redis with that password is listening on `REDIS_PORT`.
3. `ANNOUNCED_IP` is reachable by your browser. For a browser on the same machine, the default `127.0.0.1` is enough.
4. `apps/ui/.env` has `VITE_API_URL` pointing at the server (default port `3001`).
5. If the UI is served from an origin other than `http://localhost:5173`, set `CLIENT_ORIGIN` to it exactly (scheme, host and port, no trailing slash).

Generating secrets: any random string of 32 or more characters works, for example `openssl rand -hex 32`.
