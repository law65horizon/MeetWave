# Deployment

What the repository provides for deployment, and what you must add yourself. Items marked **⚠ verify** come from reading the files, not from a tested deployment.

## What exists in the repo

| Artifact | Purpose |
|---|---|
| `apps/server/Dockerfile` | Three stages on `node:24-slim`: `prod-deps` (production dependencies), `build` (installs with `--ignore-scripts`, runs `tsc` through `pnpm --filter "./apps/server" run build`), `runtime` (copies `node_modules` and `dist`, runs as user `node`, `EXPOSE 3001`, `CMD ["node", "dist/server.js"]`) |
| `compose.yaml` | `server` + `redis` services |
| `apps/ui/vercel.json` | SPA rewrite `/(.*)` → `/index.html` for static hosting on Vercel |
| `.dockerignore` | Excludes `node_modules`, `dist`, `.git`, `.env*`, `*.log`, `Dockerfile`, `.dockerignore` |

There is no CI configuration in the repository.

## Compose stack

```bash
# from the repository root, with the variables listed in docs/CONFIGURATION.md exported
# or placed in a root-level .env file
docker compose up -d --build
```

Server service highlights (`compose.yaml`):

- `network_mode: "host"`: the container shares the host's network. This avoids publishing the large UDP port range for media, and means the server's `127.0.0.1:${PORT}` is the host's loopback.
- `init: true`, `restart: unless-stopped`, `stop_grace_period: 30s`, JSON log rotation (10 MB × 3).
- `depends_on: redis` with `condition: service_healthy` (Redis healthcheck: `redis-cli ping`).
- Healthcheck: a Node one-liner that fetches `http://127.0.0.1:${PORT}/health` and exits 0 only on an OK response. Interval 30 s, timeout 5 s, 3 retries, 15 s start period.

Redis service: `redis:7-alpine`, `--appendonly yes`, named volume `redis-data` at `/data`, JSON log rotation (5 MB × 2).

### ⚠ verify: Redis connectivity in this stack

Three things interact here and the compose file alone does not settle them:

1. The server uses `network_mode: host`, so Docker's service-name DNS (`redis`) is **not** available to it.
2. The `redis` service has no `ports:` mapping, so it is not published on the host either.
3. The server logs in with a **password**, but Redis is started without `--requirepass`.

Pick one explicit setup, for example: publish Redis on the host loopback (`ports: ["127.0.0.1:6379:6379"]`), start it with a password (`command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]`), and set `REDIS_URL=127.0.0.1`, `REDIS_PORT=6379`. This is a suggestion derived from the constraints above. It has not been run against this repository.

## Required network exposure

| Traffic | Port | Notes |
|---|---|---|
| HTTP + WebSocket (signalling) | `PORT` (default `3001`) | **Bound to `127.0.0.1` only.** Publish through a reverse proxy on the same host |
| WebRTC media | UDP and TCP **10000–10100** | The range is hard-coded in `config/mediasoup.ts`. Open it in the firewall and security group |
| Redis | `REDIS_PORT` | Keep private |

`ANNOUNCED_IP` must be the public (or LAN) IP that browsers can reach. If it is wrong the page loads and signalling works, but no audio/video arrives. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

### Reverse proxy requirements

The proxy must:

- terminate TLS (cookies are `Secure`, and browsers require HTTPS for camera access except on `localhost`),
- forward WebSocket upgrades on `/socket.io/`,
- pass the `Cookie` header and not strip `Set-Cookie`.

No proxy configuration ships with the repo. <!-- TODO: confirm which proxy (nginx, Caddy, …) is used in production -->

## UI hosting

1. Set `VITE_API_URL` to the public server URL **at build time**.
2. `pnpm --filter ./apps/ui build` produces static files in `apps/ui/dist` (Vite default output).
3. Serve them with an SPA fallback to `index.html`. `vercel.json` does this on Vercel. Other hosts need an equivalent rule.

### Cross-origin cookies

When the UI (for example `https://app.example.com` or a Vercel domain) and the API are on different origins:

- the server's cookies are `SameSite=None; Secure`, which is correct for cross-site use but requires HTTPS on the API,
- `CLIENT_ORIGIN` on the server must equal the UI origin exactly (CORS with credentials),
- browsers that block third-party cookies can break sign-in when the two sites do not share a registrable domain. Hosting the API on a subdomain of the UI's domain avoids this. (Browser behaviour; not tested for this project.)

## Environment checklist for production

- [ ] `NODE_ENV=production` (JSON logs, `info` level)
- [ ] Strong, unique `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET` (≥ 32 chars each)
- [ ] `ANNOUNCED_IP` = public IP of the host
- [ ] Redis with a password, not reachable from the internet, persisted volume
- [ ] UDP/TCP 10000–10100 open; HTTPS reverse proxy forwarding `/socket.io/` WebSockets
- [ ] `CLIENT_ORIGIN` = exact UI origin
- [ ] Your own TURN server wired in. The current code hard-codes public test TURN servers, and the `TURN_*` variables are ignored (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md))
- [ ] Review the High items in [KNOWN_ISSUES.md](KNOWN_ISSUES.md), especially token lifetimes and room password exposure

## Operations

| Task | How |
|---|---|
| Health | `GET /health` (Redis state, active room count, worker stats, uptime, memory) |
| Logs | pino JSON to stdout in production. Compose rotates them |
| Graceful stop | `SIGTERM`/`SIGINT` close the HTTP listener and the main Redis client, then exit 0. Connected sockets are dropped, and room data survives in Redis |
| Scale | Run **one** server instance. Media state is in process memory (see [ARCHITECTURE.md](ARCHITECTURE.md#6-scalability-and-operational-limits)) |
| Backups | Redis AOF is enabled in Compose. It holds user accounts, so back up the `redis-data` volume |
