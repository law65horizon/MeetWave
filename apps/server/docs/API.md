# REST API Reference

HTTP surface of `meetapp-server`. For realtime events, see [SOCKET_EVENTS.md](SOCKET_EVENTS.md).

- **Base URL:** wherever you run the server. It binds to `127.0.0.1:${PORT}` (default `3001`), so this is normally a reverse-proxy address.
- **Format:** JSON request and response bodies (`express.json()` is applied globally).
- **Source of truth:** route definitions are in `src/server.ts` (the routes outside `/auth`) and `src/routes/auth/authRoutes.ts`.

## Conventions

### Authentication

Protected routes accept the access token from either place, in this order (`extractToken` in `src/middleware/index.ts`):

1. the `access_token` cookie
2. an `Authorization: Bearer <token>` header

The browser client only uses cookies.

### Cookies

Set by `setAuthCookies` in `src/middleware/cookies.ts`:

| Cookie | Path | Max-Age source | Purpose |
|---|---|---|---|
| `access_token` | `/` | `TTL_ACCESS_SECRET` (1,800,000 ms by default, 30 min) | Short-lived JWT, sent on every request |
| `refresh_token` | `/auth` | `TTL_REFRESH_SECRET` (604,800,000 ms by default, 7 days) | Single-use refresh JWT, sent only to `/auth/*` |

Both are `httpOnly`, `sameSite: "none"` and, because of that, `secure: true`. The code has a commented-out line that would read `COOKIE_SAMESITE` from the environment. It is **not** active. Currently `sameSite` is hard-coded to `"none"`.

### CORS

`server.ts` allows these origins: `CLIENT_ORIGIN` and `http://localhost:5173`. It also sets `credentials: true`, methods `GET, POST, PUT, DELETE, OPTIONS`, and allowed headers `Content-Type`, `Authorization` and `ngrok-skip-browser-warning`.

### Error shapes

The API has **no single error format**. What you get depends on the route:

| Source | Shape |
|---|---|
| `requireAuth` | `{ "error": string, "code": "NO_TOKEN" \| "TOKEN_EXPIRED" \| "TOKEN_INVALID" }` with status 401 |
| Auth routes | `{ "error": string }`, plus `details` on a failed registration validation |
| `POST /create`, `POST /demo/create` | A bare JSON string: `"Internal Server Error"` with status 500 |
| Unknown route | `{ "error": "Not found" }` with status 404 |
| Unexpected error inside an auth route | Passed to `next(err)`. No error-handling middleware is registered, so Express's default handler responds (status 500, HTML body) |

> `requireAuth` can only return `TOKEN_EXPIRED` if the thrown error's name is `TokenExpiredError`, but `verifyAccessToken` re-throws everything as an `AppError`. In practice an expired token returns `TOKEN_INVALID`. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

---

## System

### `GET /health`

Unauthenticated. Defined in `src/server.ts`.

**200 response**

```json
{
  "status": "ok",
  "redis": "connected",
  "rooms": 3,
  "workers": 4,
  "workerStats": [{ "pid": 1234, "usage": { "...": "mediasoup ResourceUsage" } }],
  "uptime": 1234.5,
  "memory": { "rss": 0, "heapTotal": 0, "heapUsed": 0, "external": 0, "arrayBuffers": 0 }
}
```

- `redis` is `"connected"` or `"disconnected"` (result of a `PING`).
- `rooms` is the size of the `rooms:active` sorted set (see [DATA_MODEL.md](DATA_MODEL.md)).
- The Docker Compose healthcheck calls this endpoint and passes if the response status is OK.
- The `redis` field is computed with a `PING` wrapped in try/catch, but `getActiveRoomCount()` and `getWorkerStats()` run without one. The `/health` handler is an `async` function on Express 4, which does not forward a rejected promise to the error handler. If Redis is down, the `zCard` call can reject, which would surface as an `unhandledRejection` log entry and a request that never completes, rather than a `"disconnected"` response. This is inferred from the code and has not been run.

---

## Rooms

### `POST /create`

Create a meeting room as an authenticated user. **Auth required.**

**Request body**

| Field | Type | Notes |
|---|---|---|
| `name` | string, optional | Defaults to `"<user name>'s Room"` when falsy |
| `mode` | `"conference"` \| `"broadcast"` | **Not validated.** Whatever is sent is stored |
| `isLocked` | boolean | Truthy → stored as `"true"`, otherwise `"false"` |
| `password` | string, optional | Stored in plain text; empty string if omitted |
| `maxParticipants` | number, optional | Defaults to `50`. Not range-checked |

**200 response**

```json
{ "roomId": "oak-river-42" }
```

`roomId` has the form `<word>-<word>-<10..99>`. The words come from a fixed list of 12 (`generateRoomId` in `server.ts`). The server does **not** check whether the ID already exists, so a collision would overwrite the existing room's metadata.

**Errors**

| Status | When |
|---|---|
| 401 | Missing or invalid access token (`requireAuth`) |
| 500 | Any thrown error, including "user not found". The body is the JSON string `"Internal Server Error"` |

**Side effects:** writes the room hash (4 h TTL) and adds the room to `rooms:active` (`createRoom`). The room's `serverId` is set to the machine hostname (`os.hostname()`).

### `POST /demo/create`

Create a room without an account. **No authentication.** The caller becomes host by presenting the returned `userId` in the socket handshake (`auth.demoUserId`).

**Request body**: same fields as `/create`, plus:

| Field | Type | Notes |
|---|---|---|
| `displayName` | string, **required** | Becomes `hostName` and the default room name |

**201 response**

```json
{ "userId": "<uuid>", "roomId": "oak-river-42" }
```

**Errors**

| Status | When |
|---|---|
| 500 | Missing `displayName`. The code throws `AppError("FORBIDDEN", …, 403)`, but the surrounding `catch` ignores the status and replies 500 `"Internal Server Error"` |
| 500 | Any other failure |

> Anyone who knows the `userId` can claim host rights. The server does not verify it beyond equality with `room.hostId` (see [Security](../../../docs/SECURITY.md)).

---

## Authentication (`/auth`)

Router: `src/routes/auth/authRoutes.ts`, mounted at `/auth`. Passwords are hashed with bcrypt (12 rounds).
Tokens travel **only in cookies**, never in response bodies.

The public user object is always `{ id: string, name: string, email: string }`.

### `POST /auth/register`

| Body field | Rules (Zod) |
|---|---|
| `name` | string, trimmed, 1–100 chars |
| `email` | string, trimmed, valid email, ≤ 254 chars |
| `password` | string, 8–72 chars (bcrypt ignores bytes beyond 72) |

| Status | Body | Notes |
|---|---|---|
| 201 | `{ "user": { id, name, email } }` | Sets both auth cookies |
| 400 | `{ "error": "Invalid input", "details": { field: string[] } }` | Zod `fieldErrors` |
| 409 | `{ "error": "Email already registered" }` | Uniqueness is claimed atomically with `SET NX` (see [DATA_MODEL.md](DATA_MODEL.md)) |

Emails are lower-cased and trimmed before storage.

### `POST /auth/login`

Body: `{ "email": string, "password": string }` (password must be non-empty).

| Status | Body |
|---|---|
| 200 | `{ "user": { id, name, email } }` and sets both cookies |
| 400 | `{ "error": "Invalid input" }` |
| 401 | `{ "error": "Invalid email or password" }` |

When the email does not exist, the handler compares against a dummy bcrypt hash so the response time does not reveal whether the account exists.

### `POST /auth/refresh`

Reads the `refresh_token` cookie (sent automatically because its path is `/auth`). **Rotates** the token: the old one is consumed and a new access and refresh pair is set.

| Status | Body | When |
|---|---|---|
| 200 | `{ "user": { id, name, email } }` | Success. New cookies set |
| 401 | `{ "error": "Not authenticated" }` | No refresh cookie |
| 401 | `{ "error": "Invalid refresh token" }` | Bad signature, expired, or revoked. Cookies cleared |
| 401 | `{ "error": "Refresh token reuse detected" }` | The token was already used. **All of that user's sessions are revoked** and cookies cleared |
| 401 | `{ "error": "User no longer exists" }` | The token was valid but the account is gone. Sessions revoked, cookies cleared |

### `POST /auth/logout`

Revokes the presented refresh token, if any, and clears both cookies. Always responds **204** with an empty body. A missing or invalid token is not an error.

### `GET /auth/me`

**Auth required.** Returns the current user.

| Status | Body |
|---|---|
| 200 | `{ "user": { id, name, email } }` |
| 401 | See [Error shapes](#error-shapes) (`requireAuth`) |
| 404 | `{ "error": "User not found" }` |

---

## Walkthrough: a session from sign-up to a refreshed token

This trace uses the real paths and cookie names. Values are shortened.

1. **Register**
   ```http
   POST /auth/register
   Content-Type: application/json

   {"name":"Ada","email":"Ada@Example.com","password":"correct horse"}
   ```
   Server: normalizes the email to `ada@example.com`, runs `SET user:email:ada@example.com <uuid> NX`, writes `user:<uuid>`, then `issueTokenPair`.
   Response: `201 {"user":{"id":"<uuid>","name":"Ada","email":"ada@example.com"}}`
   with `Set-Cookie: access_token=…; Path=/; HttpOnly; Secure; SameSite=None` and
   `Set-Cookie: refresh_token=…; Path=/auth; HttpOnly; Secure; SameSite=None`.

2. **Call a protected route**
   `POST /create` with the cookies attached. `requireAuth` reads `access_token`, verifies it with `JWT_ACCESS_SECRET`, and sets `req.userId` from the JWT `sub` claim.

3. **Access cookie expires.** The browser drops it, so the next request arrives without a token: `401 {"error":"Not authenticated","code":"NO_TOKEN"}`. The UI treats any 401 as the cue to refresh (`apps/ui/src/lib/api.ts`).

4. **Refresh**
   `POST /auth/refresh` carries only `refresh_token`. Server: verify signature, run `DEL refresh:<jti>`.
   - If `DEL` returned `1`, remove the jti from `user:<id>:refresh`, issue a new pair, and respond `200`.
   - If `DEL` returned `0`, the token was already used, so every session in `user:<id>:refresh` is deleted and the response is `401 "Refresh token reuse detected"`.

5. **Retry** the original request with the new cookie, which now succeeds.
