# Security Overview

A description of the security design **as implemented**, followed by the open risks found by reading the code. This is not a penetration test. Nothing here was exploited or run.

## Authentication design

| Aspect | Implementation | Source |
|---|---|---|
| Password storage | bcrypt, 12 rounds. Password length 8–72 | `routes/auth/authRoutes.ts` |
| Login timing | Compares against a dummy hash if the email is unknown, so timing does not reveal whether an account exists | `authRoutes.ts` (`DUMMY_HASH`) |
| Email uniqueness | Atomic `SET … NX` on `user:email:{email}` | `routes/auth/authController.ts` |
| Access token | JWT (HS256), claim `sub` = user id, signed with `JWT_ACCESS_SECRET`. Verification pins `algorithms: ["HS256"]` | `middleware/authenticate.ts` |
| Refresh token | JWT with `sub` and `jti`, signed with `JWT_REFRESH_SECRET`. The `jti` is tracked in Redis | `middleware/authenticate.ts` |
| Rotation and theft detection | Each refresh token works once. Presenting one a second time revokes **all** sessions of that user | `rotateRefreshToken` |
| Transport of tokens | `httpOnly` cookies only. Never in JSON bodies. Refresh cookie is scoped to path `/auth` | `middleware/cookies.ts` |
| Cookie flags | `httpOnly`, `SameSite=None`, `Secure` | `cookies.ts` |
| Logout | Revokes the presented refresh token and clears both cookies | `authRoutes.ts` |
| Input validation | Zod on register and login. Not on room creation | `authRoutes.ts` |
| Browser multi-tab refresh | Web Locks serialise refreshes so the shared single-use cookie is not replayed | `apps/ui/src/lib/api.ts` |

## Authorisation design

| Action | Check | Source |
|---|---|---|
| Join a room | Room fixed at the handshake (`requestedRoomId`). Payload cannot change it | `middleware/index.ts`, `handlers/room.ts` |
| Password-protected / locked rooms | Checked on `room:join`. A host-admitted socket skips the check **once** | `handleJoin` |
| Host-only actions | `requireHost`: caller must be in a room and `room.hostId === socket.data.id`. Targets of kick and mute must be in the host's own room | `handlers/guards.ts`, `room.ts`, `chat.ts` |
| Broadcast mode | Viewers cannot `produce` | `handlers/media.ts` |
| Same user twice | Older session evicted | `evictStaleSessions` |

## CORS and transport

- REST CORS: origins `CLIENT_ORIGIN` and `http://localhost:5173`, with credentials.
- Socket.IO CORS: `CLIENT_ORIGIN` only, with credentials.
- Nothing in the application enforces HTTPS. Terminate TLS in the reverse proxy ([DEPLOYMENT.md](DEPLOYMENT.md)).
- `SameSite=None` means cookies are sent on cross-site requests. The code comments note CSRF protection should be added for fully cross-domain setups, and none exists today. Mitigating factors: state-changing endpoints require JSON bodies, and CORS only allows listed origins (browsers send a preflight for JSON content type). Still, treat CSRF as an open item.

## Open risks (ordered by severity)

Cross-references point to the detailed entries.

| Sev | Risk | Detail |
|---|---|---|
| High | **Room passwords are plain text and are sent to every joiner.** They are stored unhashed in Redis, and the `room:join` acknowledgement returns the room object including `password` | Server [KNOWN_ISSUES #11](../apps/server/docs/KNOWN_ISSUES.md) |
| High | **Token lifetimes are far longer than intended** because millisecond constants are used as seconds. An access JWT stays valid for about 20.8 days and cannot be revoked, since access tokens are not tracked server-side | Server KNOWN_ISSUES #1 |
| High | **Public TURN credentials and servers are hard-coded** (`freestun.net`, `free`/`free`), and the `TURN_*` settings are ignored. Media relayed through a third party you do not control. A free test service is not suitable for production | Server KNOWN_ISSUES #6 |
| Medium | **Demo host identity is bearer-only.** `demoUserId` is accepted from any unauthenticated socket, so knowing the id grants host rights. Because the server also accepts an arbitrary `demoUserId` from guests, a guest can impersonate that identity | Server KNOWN_ISSUES #12 |
| Medium | **No rate limiting** on login, registration or room creation. Registration is open to anyone. `/demo/create` needs no authentication and creates Redis state, so it can be abused to fill Redis | Server KNOWN_ISSUES #15, #16 |
| Medium | **Room IDs are guessable.** 12 × 12 words × 90 numbers is 12,960 combinations. Joining an unlocked, password-less room needs only the ID. Collisions are not detected | Server KNOWN_ISSUES #15 |
| Medium | **Moderation is advisory.** Mute and camera-off are requests handled by the client | Server #17, UI #7 |
| Medium | **Redis hygiene.** A Redis password is required, but the bundled Compose Redis sets none, and has no network access defined. Misconfiguration here will push people toward an open Redis | [DEPLOYMENT.md](DEPLOYMENT.md#-verify-redis-connectivity-in-this-stack) |
| Low | `COOKIE_SECRET` is required but unused | Server KNOWN_ISSUES #7 |
| Low | The `/health` endpoint is unauthenticated and returns process memory, uptime and worker PIDs. Restrict it at the proxy if exposed publicly | `server.ts` |
| Low | Chat text is stored and relayed as plain text, truncated to 2000 characters. React escapes it on render by default. No server-side sanitisation exists | `handlers/chat.ts` |
| Low | Dependency `firebase-admin` (server) and `firebase` (UI) are installed but unused, which adds attack surface for no benefit | `package.json` files |
| Info | Secrets are never committed in the repository. `.gitignore` excludes `.env`, and `.env.example` holds names only | `.gitignore`, `apps/server/.env.example` |

## Reporting a vulnerability

The repository has no security policy file. <!-- TODO: add a contact or process -->

## Hardening checklist

- [ ] Fix token TTL units (convert ms → seconds for JWT `expiresIn` and Redis `EX`).
- [ ] Hash room passwords and stop returning `password` in `RoomMeta` sent to clients.
- [ ] Wire `TURN_*` into `getIceServers()` and use your own TURN server.
- [ ] Add rate limits (login, register, `/demo/create`, `/create`).
- [ ] Bind demo identity to a server-issued signed token instead of a bare UUID.
- [ ] Validate `mode`, `maxParticipants` and `password` on room creation. Check ID uniqueness (`HSETNX`/`EXISTS`).
- [ ] Add CSRF protection if the UI and API are on different registrable domains.
- [ ] Enforce mute/camera-off on the server (pause the producer) if you need them as hard controls.
