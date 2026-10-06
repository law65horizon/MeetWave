# Troubleshooting

Symptom → likely cause → what to check. Every cause is derived from the code. Where a cause is a hypothesis, it says so.

## Server will not start

| Symptom | Cause | Fix |
|---|---|---|
| Prints `❌ Invalid environment variables:` with field names, exits | Zod validation failed in `config/index.ts` | Provide the missing or too-short values. `REDIS_PORT`, `REDIS_PASSWORD` are required. The three secrets need ≥ 32 characters |
| `Redis error` repeating in logs, health shows `"redis":"disconnected"` | Wrong host, port or password. `REDIS_URL` is used as a **host**, so `redis://…` will not resolve | Use a bare host name and the matching `REDIS_PORT` / `REDIS_PASSWORD` |
| Fails while creating mediasoup workers | The native mediasoup worker is missing or not built (pnpm skipped its build script) | Reinstall. The build script is allowed in `pnpm-workspace.yaml`. Check the platform build tools if no prebuilt binary applies |
| Process keeps running but errors are only logged | `uncaughtException` and `unhandledRejection` handlers log and continue | Watch for `Uncaught exception` / `Unhandled rejection` log lines |
| Cannot reach the server from another machine | The HTTP server listens on `127.0.0.1` only | Use a reverse proxy on the same host, or change the bind address in `server.ts` (a code change) |

## Sign-in problems

| Symptom | Cause | Fix |
|---|---|---|
| App shows a spinner then the sign-in page, and logging in "works" but you are sent back | Cookies not stored or not sent. Cookies are `Secure; SameSite=None` | Use HTTPS (or `localhost`), make sure `CLIENT_ORIGIN` matches the UI origin exactly, and allow third-party cookies if the two sites are on different domains |
| Browser console: CORS error | UI origin not allowed | The REST API allows `CLIENT_ORIGIN` and `http://localhost:5173`. Socket.IO allows only `CLIENT_ORIGIN` |
| Every user gets logged out everywhere unexpectedly | Refresh-token reuse detected. Two refreshes presented the same single-use token (for example from a second client that does not use the Web Locks logic) | Ensure all clients share the UI's refresh logic. See [STATE_AND_DATA.md](../apps/ui/docs/STATE_AND_DATA.md) |
| UI error: `VITE_API_URL is not set` | Missing build/dev variable | Set it in `apps/ui/.env` and restart Vite. For builds, set it before building |
| Sessions last much longer than 30 minutes | Token lifetime unit bug | [Server KNOWN_ISSUES #1](../apps/server/docs/KNOWN_ISSUES.md) |

## Joining a meeting

| Message in the UI | Cause |
|---|---|
| `Room not found` | Never created, ended by the host, or expired (rooms live 4 hours) |
| `Room is full` | `maxParticipants` reached (default 50) |
| `Wrong password` | Password in the `?pw=` URL parameter or the dialog differs from the room's |
| `Sign in to join this meeting` | Server error `UNAUTHENTICATED`. Only occurs for rooms flagged `private`, which no code currently sets |
| `Your session is invalid. Sign in again` | Access cookie present but not verifiable (expired tokens also report this) |
| `Failed to connect to server` | Handshake failed or the 10 s connection timeout passed. Check `VITE_API_URL`, reverse-proxy WebSocket support, and `connect_error` in the console |
| `You joined this meeting from another tab or device` | Same account joined again. The older session is intentionally replaced |
| Stuck on "waiting" | The room is locked and the host has not admitted you (or has no waiting-list view open) |
| A guest cannot host their demo room after reload | The demo identity lives in `sessionStorage`, so a new tab or a cleared session loses it |

## Media problems

| Symptom | Likely cause | What to check |
|---|---|---|
| Joined, signalling works, but no audio/video from others | Media path blocked or wrong `ANNOUNCED_IP` | `ANNOUNCED_IP` must be the address browsers can reach. Open UDP/TCP 10000–10100. Check `iceCandidates` returned by `transport:create` in the browser's network tab |
| Works on LAN, not from the internet | NAT or firewall, or a missing `ANNOUNCED_IP` | Set `ANNOUNCED_IP` to the public IP. If clients are behind strict firewalls you need a working TURN server (the built-in one is a public test service) |
| "Could not access camera/microphone" toast | Permission denied, no device, or an insecure origin | Camera access needs HTTPS or `localhost` |
| Viewer in a broadcast room cannot turn on the camera | By design: `VIEWERS_CANNOT_PRODUCE` | Only the host/broadcaster publishes in `broadcast` mode |
| `ROUTER_NOT_FOUND` on `transport:create` | The router is created at `room:join`. It can be missing after the room emptied, or on a second server instance | Run a single server instance. Rejoin the room |
| Screen share replaces your camera | By design in the current client | [UI KNOWN_ISSUES #6](../apps/ui/docs/KNOWN_ISSUES.md) |

## Docker Compose

| Symptom | Cause | Fix |
|---|---|---|
| `server` cannot reach Redis | Host networking and no Redis port published | See [DEPLOYMENT.md](DEPLOYMENT.md#-verify-redis-connectivity-in-this-stack) |
| Redis auth errors | Client sends a password but Redis has none configured | Start Redis with `--requirepass` matching `REDIS_PASSWORD` |
| Container `unhealthy` | `/health` unreachable on `127.0.0.1:${PORT}`, or `PORT` not set in the Compose environment | Make sure `PORT` is exported or in a root `.env` |
| A variable you added is ignored | It is not in `compose.yaml`'s `environment:` list | Add it there |

## Still stuck

Collect: server log lines around the failure (`Socket auth failed`, `room:join error`, `transport:create error`), the browser console's `connect_error` text, the response of `GET /health`, and your `ANNOUNCED_IP` / ports. Then check [KNOWN_ISSUES.md](KNOWN_ISSUES.md).
