# Socket.IO Event Reference

Realtime protocol of `meetapp-server`. Handlers live in `src/socket/handlers/`:
`room.ts` (room lifecycle), `media.ts` (WebRTC/mediasoup), `chat.ts` (chat, reactions, time sync, moderation) and `guards.ts`.
The server is created in `src/socket/index.ts`.

Naming used below:

- **C→S** is an event the client emits. **S→C** is an event the server emits.
- **ack** is the Socket.IO acknowledgement callback. Most C→S events with a callback reply `{ error?: string, … }`.
- "Host-only" means the handler calls `requireHost`: the socket must have joined a room and `room.hostId === socket.data.id`.

## Server settings

From `createSocketServer`:

| Setting | Value |
|---|---|
| CORS origin | `CLIENT_ORIGIN` (a single origin; `http://localhost:5173` is **not** added here, unlike the REST CORS list) |
| CORS methods / credentials | `GET, POST` / `true` |
| Transports | `websocket`, `polling` |
| `pingInterval` / `pingTimeout` | `10000` ms / `20000` ms |
| Adapter | `@socket.io/redis-adapter` using the `pub` and `sub` Redis clients |

## 1. Connecting (handshake)

The client must pass an `auth` object when connecting (`socketMiddleware` in `src/middleware/index.ts`):

```ts
io(API_URL, {
  withCredentials: true,           // sends the access_token cookie
  auth: {
    roomId: "oak-river-42",        // REQUIRED
    displayName: "Ada",            // optional
    demoUserId: "<uuid>"           // optional; guest/demo host identity
  }
})
```

What the middleware does, in order:

1. `auth.roomId` must be a non-empty string, otherwise the connection is rejected with `NOT_IN_ROOM`. It is lower-cased and trimmed.
2. Parses cookies from the handshake request and reads `access_token`.
3. If a token is present and valid, `userId` = JWT `sub`. If present but invalid, the handshake fails with `TOKEN_INVALID`. A logged-in user is never silently downgraded to a guest.
4. Loads the room. If `room.private` is set and there is no `userId`, fails with `UNAUTHENTICATED`. (No code path ever sets `private`. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).) A missing room does **not** fail here. `room:join` answers `ROOM_NOT_FOUND`.
5. Looks up the account name server-side. The socket identity becomes:
   - `data.id` = `userId` if logged in, else `auth.demoUserId`, else a fresh `randomUUID()`.
   - `data.requestedRoomId` = the room from the handshake. **This is the only room the socket may join.**
   - `data.displayName` = `auth.displayName` (trimmed, ≤ 50 chars) → account name → `Guest-<first 4 chars of id>`.

**Handshake errors** arrive as `connect_error` with `err.message` equal to one of:
`NOT_IN_ROOM`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `INTERNAL_SERVER_ERROR`.

### Socket state (`AuthenticatedSocket["data"]`)

| Field | Meaning |
|---|---|
| `id` | User identity (not the socket id) |
| `displayName` | Name shown to others |
| `requestedRoomId` | Room authorised by the handshake |
| `roomId` | Set only after a real join. Unset while waiting |
| `waitingRoomId` | Set while queued in the waiting room |

### Socket.IO rooms the server uses

| Room name | Members | Used for |
|---|---|---|
| `<roomId>` | Every joined participant | Broadcasts to the meeting |
| `host:<roomId>` | Host socket(s) only | Waiting-room notifications (`hostRoom()` in `guards.ts`) |

---

## 2. Room lifecycle (`handlers/room.ts`)

### C→S `room:join`

Payload: `{ password?: string } | undefined`. **A callback is required**; without one the event is ignored. Joins from one socket are serialised through a promise chain, so a double emit cannot race.

The room comes from the handshake, never from the payload.

Ack (`JoinResponse`):

```ts
{
  id?: string;               // user identity
  error?: string;
  waiting?: boolean;         // true → queued for host approval
  room?: RoomMeta;
  participants?: ParticipantMeta[];
  chatHistory?: ChatMessage[];       // last 100 messages
  producers?: ProducerInfo[];        // existing media sources to consume
  rtpCapabilities?: RtpCapabilities; // router capabilities for mediasoup-client
}
```

| `error` | Meaning |
|---|---|
| `ROOM_NOT_FOUND` | No such room (never created, expired or ended) |
| `WRONG_PASSWORD` | The room has a password and `data.password` differs |
| `ROOM_FULL` | Participant count has reached `maxParticipants` |
| `Failed to join room` | Unexpected error |

Decision flow inside `handleJoin`:

1. Load the room. Missing → `ROOM_NOT_FOUND`.
2. `isHost = (socket.data.id === room.hostId)`.
3. If this socket has not already joined:
   1. Try `consumeAdmission(roomId, socket.id)`. When the host previously admitted this socket, this succeeds once and **skips** the password and lock checks.
   2. Otherwise: wrong password → `WRONG_PASSWORD`. If the room is locked and the caller is not the host → add to the waiting queue and ack `{ waiting: true, id }`.
   3. `evictStaleSessions`: any other socket of the **same user** in this room is removed. It receives `room:replaced`, everyone gets `participant:left`, and the old socket is disconnected.
   4. Full room → `ROOM_FULL`.
   5. Register the participant, join the Socket.IO room(s), and broadcast `participant:joined` to others.
4. Ack with the current state and `rtpCapabilities`. A second `room:join` from an already-joined socket just returns the state without re-broadcasting.

**Role assignment** (`joinRoom`):

| Room mode | Host | Everyone else |
|---|---|---|
| `conference` | `host` | `participant` |
| `broadcast` | `broadcaster` | `viewer` |

> **Note:** the ack's `room` object contains the room's `password` field (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md)).

### C→S `room:leave`

No payload, no ack. Runs the idempotent `handleLeave`: removes a waiting entry (and notifies the host with `waiting:removed`), leaves the Socket.IO rooms, unregisters the socket's producers in Redis, removes the participant, and broadcasts `participant:left` only if this call actually removed the record. If the room is now empty, its mediasoup router is closed. The Redis room itself expires through its TTL.

`handleLeave` also runs from the `disconnect` event.

### C→S `room:lock` *(host-only)*

Payload `{ locked: boolean }`. Ack `{ error? }`. Updates `isLocked` and broadcasts `room:locked`.

Errors: `NOT_IN_ROOM`, `NOT_HOST`, `Failed`.

### C→S `room:end` *(host-only)*

Ack `{ error? }` (the callback is optional). The server:

1. Collects the sockets in the room and the waiting list.
2. **Deletes** the room data in Redis first, so the disconnects that follow do not announce "X left" for everybody.
3. Closes the room's router.
4. Acks, emits `room:ended` to the room and to each waiting socket, then force-disconnects the members.

### C→S `host:kick` *(host-only)*

Payload `{ socketId: string }`. Ack `{ error? }`.

Errors: `NOT_IN_ROOM` (caller not joined, or target not in this room), `NOT_HOST`, `CANNOT_KICK_SELF`, `Failed`.
On success the target receives `room:kicked` and is disconnected.

### Waiting room

| Event (C→S) | Payload | Ack | Notes |
|---|---|---|---|
| `waiting:list` *(host-only)* | none | `(list: WaitingEntry[])` | Non-hosts get `[]` |
| `waiting:admit` *(host-only)* | `{ socketId }` | `{ error? }` | Errors: `NOT_HOST`, `NOT_IN_ROOM`, `NOT_WAITING`, `Failed`. The server marks the socket admitted **before** telling the guest |
| `waiting:deny` *(host-only)* | `{ socketId }` | `{ error? }` | Same errors as admit |

### S→C events from this module

| Event | Payload | Sent to | When |
|---|---|---|---|
| `participant:joined` | `ParticipantMeta` | Everyone in the room except the joiner | A participant joined |
| `participant:left` | `{ socketId, userId, displayName }` | Whole room | A participant left, was kicked or was replaced |
| `waiting:request` | `WaitingEntry` | `host:<roomId>` | A guest was queued |
| `waiting:removed` | `{ socketId }` | `host:<roomId>` | Admitted, denied or left the queue |
| `waiting:admitted` | none | The waiting guest | Host approved. The guest should now emit `room:join` again |
| `waiting:denied` | none | The waiting guest | Host denied |
| `room:locked` | `{ locked: boolean, by: string }` | Whole room | Lock toggled |
| `room:ended` | `{ by: string }` | Room and waiting guests | Host ended the meeting |
| `room:kicked` | none | The target | Host kicked them |
| `room:replaced` | none | The older socket | The same user joined from another tab or device |

---

## 3. Media signalling (`handlers/media.ts`)

All events require the socket to be in a room (`NOT_IN_ROOM` otherwise) unless noted. Transports, producers and consumers are kept in **process-local** `Map`s keyed by socket id. They are closed by `cleanupSocketMedia` on disconnect.

### Typical call order (a participant who publishes and subscribes)

1. `room:join` → ack contains `rtpCapabilities`. The client runs `device.load({ routerRtpCapabilities })`.
2. `transport:create { direction: "send" }` → params. `transport:create { direction: "recv" }` → params.
3. The send transport fires `connect` → client emits `transport:connect`.
4. The client calls `transport.produce(...)` → send transport fires `produce` → client emits `produce` → ack `{ producerId }`.
5. For each existing producer in the join ack, and each later `new:producer`: client emits `consume`, creates the consumer from the params, then emits `consumer:resume`.

### C→S events

| Event | Payload | Ack | Notes |
|---|---|---|---|
| `transport:create` | `{ direction: "send" \| "recv" }` | `{ error?, params? }` | `params` = `{ id, iceParameters, iceCandidates, dtlsParameters, iceServers }`. Errors: `NOT_IN_ROOM`, `ROUTER_NOT_FOUND`, `Failed to create transport` |
| `transport:connect` | `{ transportId, dtlsParameters }` | `{ error? }` | Errors: `TRANSPORT_NOT_FOUND`, `Failed to connect transport` |
| `produce` | `{ transportId, kind: "audio"\|"video", rtpParameters, appData? }` | `{ error?, producerId? }` | `appData.isScreenShare === true` marks a screen share. Errors: `NOT_IN_ROOM`, `ROOM_NOT_FOUND`, `VIEWERS_CANNOT_PRODUCE`, `TRANSPORT_NOT_FOUND`, `Failed to produce` |
| `consume` | `{ producerId, rtpCapabilities }` | `{ error?, params? }` | `params` = `{ id, producerId, kind, rtpParameters }`. The consumer starts **paused**. Errors: `NOT_IN_ROOM`, `ROUTER_NOT_FOUND`, `CANNOT_CONSUME`, `NO_RECV_TRANSPORT`, `Failed to consume` |
| `consumer:resume` | `{ consumerId }` | `{ error? }` | Errors: `CONSUMER_NOT_FOUND`, `Failed` |
| `producer:pause` | `{ producerId }` | `{ error? }` | Errors: `PRODUCER_NOT_FOUND`, `Failed` |
| `producer:resume` | `{ producerId }` | `{ error? }` | Same errors |
| `producer:close` | `{ producerId }` | none | Closes it, removes it from Redis, emits `producer:closed` |
| `audio:level` | `{ level: number }` | none | Clamped to 0–100, relayed to the rest of the room |
| `rtp:capabilities` | none | `{ error?, rtpCapabilities? }` | Errors: `NOT_IN_ROOM`, `ROUTER_NOT_FOUND`, `Failed` |
| `requestKeyFrame` | `{ roomId, consumerId }` | none | Requests a key frame for the consumer. `roomId` is ignored by the server |

### S→C events

| Event | Payload | Sent to | When |
|---|---|---|---|
| `new:producer` | `{ producerId, socketId, userId, displayName, kind, isScreenShare }` | Everyone else in the room | A new producer exists |
| `producer:paused` / `producer:resumed` | `{ producerId, socketId }` | Others in the room | Producer paused or resumed |
| `producer:closed` | `{ producerId, socketId }` | Others in the room | Producer closed |
| `consumer:closed` | `{ consumerId }` | The consumer's owner | The source producer closed |
| `producer:score` | `{ producerId, scores }` | The producer's owner | mediasoup `score` event |
| `consumer:score` | `{ consumerId, score }` | The consumer's owner | mediasoup `score` event |
| `audio:level` | `{ socketId, userId, level }` | Others in the room | Relayed level |

### Broadcast mode

When `room.mode === "broadcast"`, `produce` returns `VIEWERS_CANNOT_PRODUCE` if the caller's stored participant role is `viewer`.

---

## 4. Chat, reactions, time sync (`handlers/chat.ts`)

| Event (C→S) | Payload | Ack | Behaviour |
|---|---|---|---|
| `chat:send` | `{ text: string }` | `{ error?, messageId? }` | Trims, truncates to 2000 chars, stores it (list capped at 100), emits `chat:message` to the **whole room including the sender**. Errors: `NOT_IN_ROOM`, `EMPTY_MESSAGE`, `Failed to send message` |
| `chat:typing` | `{ isTyping: boolean }` | none | Emits `chat:typing` to others |
| `reaction:send` | `{ emoji: string }` | none | Only these emojis are accepted, others are ignored silently: 👍 ❤️ 😂 😮 👏 🎉 🔥 💯. Emits `reaction:received` to the whole room |
| `time:sync` | `{ t0: number }` | `{ t1, t2, serverNow }` | Works without being in a room. `t1` and `t2` are two successive `Date.now()` calls |
| `time:broadcast-request` | none | none | Emits `time:server-tick` `{ serverNow }` to the room. Any participant can trigger it |
| `heartbeat` | none | none | (Defined in `socket/index.ts`.) Updates `lastSeen` for the participant |

| Event (S→C) | Payload |
|---|---|
| `chat:message` | `ChatMessage` = `{ id, roomId, senderId, senderName, senderPhoto, text, timestamp }` |
| `chat:typing` | `{ socketId, userId, displayName, isTyping }` |
| `reaction:received` | `{ socketId, userId, displayName, emoji, timestamp }` |
| `time:server-tick` | `{ serverNow }` |

### Moderation (host-only, fire-and-forget: no ack, no error reply)

| Event (C→S) | Payload | Effect |
|---|---|---|
| `host:mute-all` | none | Emits `host:mute-all` to everyone else in the room |
| `host:disable-all-cameras` | none | Emits `host:disable-all-cameras` to everyone else |
| `host:mute-participant` | `{ socketId }` | Emits `host:mute-you` to that socket, only if it is in the host's room |

These are *requests*. The receiving client is expected to mute itself. The server does not pause the producers.

---

## 5. Disconnect

On `disconnect` (`socket/index.ts`): `cleanupSocketMedia(socket.id)` closes that socket's producers, consumers and transports, then `handleLeave` runs. There is a single exit path, so `participant:left` fires at most once per departure.

## Walkthrough: a guest joining a locked room

1. The guest connects with `auth: { roomId: "oak-river-42", displayName: "Bo" }` and no cookie. The middleware assigns `id = <random uuid>`, `requestedRoomId = "oak-river-42"`.
2. The guest emits `room:join { }`. Server: room found, `isHost = false`, `consumeAdmission` → `false`, no password set, `room.isLocked` is true → `addWaitingEntry`, set `socket.data.waitingRoomId`, emit `waiting:request` to `host:oak-river-42`. Ack: `{ waiting: true, id: "<uuid>" }`.
3. The host emits `waiting:admit { socketId: "<guest socket id>" }`. Server: `requireHost` passes, `removeWaitingEntry` returns `true`, `markAdmitted`, emit `waiting:admitted` to the guest and `waiting:removed` to the host room. Ack `{}`.
4. The guest receives `waiting:admitted` and emits `room:join` again. This time `consumeAdmission` returns `true`, so the lock check is skipped. The stale-session check and capacity check run, the participant is stored, others get `participant:joined`, and the ack carries the full state plus `rtpCapabilities`.
