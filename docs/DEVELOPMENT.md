# Development Guide

## Toolchain

| Tool | Version / source |
|---|---|
| Node.js | `>=24` (`apps/server/package.json` → `engines`; the Dockerfile uses `node:24-slim`) |
| pnpm | `12.9.1` (root `packageManager` and `devEngines`) |
| TypeScript | `^5.5.3` (server), `^5.2.2` (UI) |
| Redis | A reachable instance with a password. Compose uses `redis:7-alpine` |
| Formatter | `prettier ^3.9.9` at the root (no config file or script exists, so run `pnpm exec prettier …` yourself) |

Workspace: `pnpm-workspace.yaml` includes `apps/*`, and allows build scripts for `esbuild`, `mediasoup` and `protobufjs`.

## First run

```bash
pnpm install
cp apps/server/.env.example apps/server/.env     # fill in values: docs/CONFIGURATION.md
cp apps/ui/.env.example apps/ui/.env             # VITE_API_URL=http://localhost:3001
pnpm dev                                         # server + UI in parallel
```

Open <http://localhost:5173>.

You need Redis before the server can serve anything. A quick local Redis with a password, matching what the server's client expects (user `default`):

```bash
docker run --rm -p 6379:6379 redis:7-alpine redis-server --requirepass "<your password>"
```

Then in `apps/server/.env`: `REDIS_URL=localhost`, `REDIS_PORT=6379`, `REDIS_PASSWORD=<your password>`. Remember that `REDIS_URL` is used as a **host name**.

## Running one app

```bash
pnpm --filter ./apps/server dev     # ts-node-dev, restarts on change, no type-check (--transpile-only)
pnpm --filter ./apps/ui dev         # vite on :5173
```

## Building

```bash
pnpm --filter ./apps/server build   # tsc → apps/server/dist
pnpm --filter ./apps/server start   # node dist/server.js
pnpm --filter ./apps/ui build       # tsc && vite build (strips console.log/debug/info)
pnpm --filter ./apps/ui preview
```

## Verifying your setup without the UI

1. Server health: `curl http://127.0.0.1:3001/health`. Expect `"status":"ok"` and `"redis":"connected"`.
2. Register:
   ```bash
   curl -i -c jar.txt -H 'Content-Type: application/json' \
     -d '{"name":"Ada","email":"ada@example.com","password":"correct horse"}' \
     http://127.0.0.1:3001/auth/register
   ```
   Expect `201` and two `Set-Cookie` headers. The cookies are `Secure; SameSite=None`. curl will store them but may only send them over HTTPS, which is a curl cookie-jar rule, not a server bug. Use the browser flow if you need to test cookies end to end.
3. Create a room with a **demo** host (no cookies needed):
   ```bash
   curl -s -H 'Content-Type: application/json' \
     -d '{"displayName":"Ada","mode":"conference"}' \
     http://127.0.0.1:3001/demo/create
   ```
   Expect `{"userId":"…","roomId":"word-word-NN"}`.

## Project conventions seen in the code

- **TypeScript strict** in both apps. UI also has `noUnusedLocals` / `noUnusedParameters`.
- **Server structure:** protocol handlers in `socket/handlers/*`, persistence only through `redis/roomRepository.ts`, config only through `config/index.ts`.
- **Redis writes that must be all-or-nothing** use `multi()/exec()`. Operations that decide "who wins" use return values (`HDEL`, `DEL`, `SREM`, `SET NX`). Keep that pattern when adding stateful behaviour. See [DATA_MODEL.md](../apps/server/docs/DATA_MODEL.md).
- **Socket handlers read `socket.data` inside the handler**, never destructured at registration time (comment in `handlers/chat.ts`), because `roomId` and `displayName` change after registration.
- **Client listeners** in `MeetingRoom` go through the `on()` helper and read state via `useMeetingStore.getState()`.
- **Acknowledgement style:** server replies `{ error?: string, ... }`, with error codes in `UPPER_SNAKE_CASE` (some legacy messages are sentences, such as `Failed`).
- **Logging:** use `logger` (pino) on the server. In production builds the UI strips `console.log/debug/info`.
- **Shared types are duplicated** in `apps/server/src/types/index.ts` and `apps/ui/src/types/index.ts`. Change both.

## Adding things

### A new socket event

1. Server: add `socket.on("area:action", …)` in the matching file in `socket/handlers/`. Use `requireHost(socket)` for host-only actions. Reply through the ack callback.
2. Document it in [SOCKET_EVENTS.md](../apps/server/docs/SOCKET_EVENTS.md).
3. Client: emit it from a component or from `MeetingRoom`. Register listeners with `on()` so teardown removes them.

### A new REST endpoint

1. Add the route in `apps/server/src/routes/…` (and mount it in `server.ts`), or directly in `server.ts` for room-level routes.
2. Use `requireAuth` for protected routes and validate the body with Zod, as `authRoutes.ts` does.
3. Add a client call through `apiFetch` (`apps/ui/src/lib/api.ts`).
4. Document it in [API.md](../apps/server/docs/API.md).

### A new environment variable

1. Add it to the Zod schema in `apps/server/src/config/index.ts`.
2. Add it to `apps/server/.env.example`.
3. Add it to the `environment:` list in `compose.yaml`, otherwise it never reaches the container.
4. Document it in [CONFIGURATION.md](CONFIGURATION.md).

## Testing

There are no tests and no test runner configured (`pnpm test` prints "no test specified" and fails). Manual testing for the meeting flow needs two browser contexts (for example a normal and a private window, or two browsers) so that you can see a second participant.

## Debugging tips

- Server logs are pretty-printed at `debug` level outside production, and show `Socket connected`, `Participant joined`, `Room created`, `Socket auth failed`.
- A `connect_error` message in the browser console is the handshake error code (see [SOCKET_EVENTS.md](../apps/server/docs/SOCKET_EVENTS.md#1-connecting-handshake)).
- Media not arriving? See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
