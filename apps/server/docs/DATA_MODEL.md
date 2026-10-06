# Redis Data Model

Redis is the only datastore. Everything below is read from `src/redis/roomRepository.ts`,
`src/routes/auth/authController.ts` and `src/middleware/authenticate.ts`.

## Clients

`src/redis/client.ts` creates three node-redis clients, all with username `default`, `REDIS_PASSWORD`, and socket `host: config.REDIS_URL`, `port: parseInt(config.REDIS_PORT)`:

| Client | Used for |
|---|---|
| `redis` | All normal commands |
| `redisPub`, `redisSub` | The Socket.IO Redis adapter (pub/sub needs dedicated connections) |

> `REDIS_URL` is passed as the **host**, not parsed as a URL. Set it to a hostname such as `localhost`, not `redis://localhost:6379`. The schema default (`redis://localhost:6379`) would not work as a host. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Key reference

TTL constants: `ROOM_TTL = 4 * 60 * 60` s (4 hours), `CHAT_MAX = 100`.

### Rooms and meeting state

| Key | Type | Value | TTL |
|---|---|---|---|
| `room:{roomId}` | hash | Room metadata (see below) | 4 h, refreshed by `updateRoom` |
| `room:{roomId}:participants` | hash | field = socket id, value = JSON `ParticipantMeta` | 4 h, set on `addParticipant` |
| `room:{roomId}:chat` | list | JSON `ChatMessage`, trimmed to the last 100 | 4 h, set on each append |
| `room:{roomId}:waiting` | hash | field = socket id, value = JSON `WaitingEntry` | 4 h, set on add |
| `room:{roomId}:admitted` | set | socket ids the host approved (one-shot) | 4 h, set on `markAdmitted` |
| `room:{roomId}:producers` | hash | field = producer id, value = JSON producer info | 4 h, set on register |
| `rooms:active` | sorted set | member = roomId, score = creation time in ms | none |
| `user:{userId}:room` | string | roomId the user is in | 4 h |

`rooms:active` is only removed from when a room is explicitly deleted (`room:end`). Rooms that expire through TTL are **not** removed from it, so `GET /health`'s `rooms` count can drift upward over time. (Inferred from `deleteRoom` and `getActiveRoomCount`.)

#### `room:{roomId}` hash fields

Written by `createRoom` through `toHash`, which drops `null`/`undefined` values and stringifies everything else:

| Field | Stored as | Read back as (`getRoom`) |
|---|---|---|
| `roomId`, `hostId`, `hostName`, `name`, `mode`, `serverId` | string | string |
| `isLocked` | `"true"` / `"false"` | boolean (`=== "true"`) |
| `password` | string (`""` when none) | string, or `undefined` when empty |
| `maxParticipants` | number as string | `Number(...)` |
| `createdAt` | number as string | `Number(...)` |
| `private` | never written by any code path | boolean, always `false` |

Types: `RoomMeta`, `ParticipantMeta`, `ChatMessage`, `WaitingEntry` and `ProducerInfo` in `src/types/index.ts`.

### Users and sessions

| Key | Type | Value | TTL |
|---|---|---|---|
| `user:{id}` | hash | `{ id, name, email, passwordHash }` | none |
| `user:email:{email}` | string | user id. The unique index, written with `NX`. `email` is lower-cased and trimmed | none |
| `refresh:{jti}` | string | user id. **Existence means "this refresh token is still valid"** | `TTL_REFRESH_SECRET` |
| `user:{userId}:refresh` | set | jtis of the user's live refresh tokens | `TTL_REFRESH_SECRET` |

> Key-name collision to be aware of: `user:{id}` (hash) and `user:{userId}:room` / `user:{userId}:refresh` / `user:email:{email}` share the `user:` prefix, but they are distinct keys. No data collides unless a user id equals `email` (ids are UUIDs).

## Concurrency guarantees in the repository

| Operation | Mechanism | Why |
|---|---|---|
| Sign-up | `SET user:email:{email} {id} NX` | Two simultaneous sign-ups with one email cannot both succeed. If the following `HSET` fails, the email key is deleted |
| Refresh rotation | `DEL refresh:{jti}` returns the number of deleted keys | Acts as an atomic claim: only one request can get `1`. `0` means reuse, so all sessions are revoked |
| Leave | `HDEL` result of `1` required (`removeParticipant`) | Only the caller that really removed the record announces `participant:left` |
| Waiting admit/deny | `removeWaitingEntry` returns true only for the remover | One admit/deny can succeed per guest |
| Admission | `SREM room:{id}:admitted {socketId}` returns `1` once | The host's approval can be used for one join |
| Room create / delete / chat append | `MULTI`/`EXEC` | Related writes are applied together |

## Persistence

In `compose.yaml`, the Redis container runs `redis-server --appendonly yes` with a named volume `redis-data` mounted at `/data`, so data survives container restarts.
