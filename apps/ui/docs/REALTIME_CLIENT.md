# Realtime Client (`MeetingRoom`)

How the browser joins a meeting and exchanges media. The page is `src/pages/meeting/MeetingRoom.tsx`; media plumbing is in `src/hooks/useMediaSoup.ts`; the socket singleton is in `src/lib/socket.ts`. The matching server side is described in [SOCKET_EVENTS.md](../../server/docs/SOCKET_EVENTS.md).

## Socket singleton: `lib/socket.ts`

| Function | Behaviour |
|---|---|
| `getSocket()` | Lazily creates one Socket.IO client for `VITE_API_URL` (falls back to a hard-coded ngrok URL if unset). Options: transports `websocket` then `polling`, `autoConnect: false`, `withCredentials: true`, header `ngrok-skip-browser-warning` |
| `connectSocket(roomId, displayName?, demoUserId?)` | Sets `socket.auth = { roomId, displayName, demoUserId }` and connects if not already connected |
| `disconnectSocket()` | Disconnects and discards the singleton |

## Phases

`MeetingRoom` keeps a `phase` state: `connecting` → (`waiting` →) `joined`, or `error` / `ended`. Each phase renders its own full-screen view.

## Join pipeline, step by step

Scenario: a signed-in user opens `/meeting/oak-river-42` in a room that is not locked.

1. **Effect runs** (`useEffect` on `roomId`). Display name = `localStorage.displayName || user.name || undefined`. Demo identity = `sessionStorage.demoUser || undefined`.
2. **Connect.** `connectSocket("oak-river-42", name, demoId)`. The effect waits for `connect` (rejecting on `connect_error`, or after a 10 s timeout). The server's handshake errors (`NOT_IN_ROOM`, `UNAUTHENTICATED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`) surface as `err.message`, and the `ERRORS` map in the file turns them into user text.
3. **Register listeners** (`registerListeners`) *before* joining, so no event is missed.
4. **Emit `room:join`** with `{ password }` where `password` comes from `?pw=` in the URL. Ack outcomes:
   - `error` → show message via `ERRORS[res.error]` (`ROOM_NOT_FOUND`, `ROOM_FULL`, `WRONG_PASSWORD`, …) and set phase `error`.
   - `waiting: true` → phase `waiting`. Later, a `waiting:admitted` event makes the client call `joinRoom` again.
   - otherwise → `bootMedia`.
5. **`bootMedia`** (guarded by `joinedRef` so it never runs twice):
   1. Writes `room`, `participants`, `messages` (chat history) and `mySocketId` to the store.
   2. Creates metadata-only `remoteStreams` entries for everyone already present.
   3. Finds *my* participant by **socket id**, sets `myRole`. A `viewer` cannot produce.
   4. `ms.loadDevice(rtpCapabilities)` → `new mediasoupClient.Device().load(...)`.
   5. `createSendTransport()` (skipped for viewers), then `createRecvTransport()`. Each emits `transport:create`, builds the transport from the returned params, and wires `connect` → `transport:connect` (and `produce` → `produce` for the send transport).
   6. `startLocalMedia`: `getUserMedia({ audio: true, video: { width: 1280, height: 720, frameRate: 30 } })`, then `produceTrack` for the audio and the video track. If permission is denied, a toast says "Could not access camera/microphone" and the user stays in the meeting without publishing.
   7. For each producer in the join ack, calls `consumeProducer`. Then sets `mediaReadyRef = true` and drains producers that arrived in `new:producer` while setup was still running (`pendingProducersRef`), skipping duplicates.
   8. Starts a **15-second heartbeat** (`heartbeat` event). If the user is the host, requests `waiting:list`.
   9. Sets phase `joined`.
6. **`useTimeSync(socket)`** (separate hook) runs 5 `time:sync` round trips, drops the lowest and highest offset, averages the rest into `clockOffset`, and repeats every 30 seconds. It also applies `time:server-tick` events.

## Consuming a remote producer: `consumeProducer`

1. Emit `consume { producerId, rtpCapabilities: device.recvRtpCapabilities }`.
2. `recvTransport.consume(params)` creates the consumer.
3. Pick the target field: `screenStream` if `isScreenShare`, else `videoStream` for video, else `audioStream`.
4. Put `new MediaStream([consumer.track])` into the store with `setRemoteStream`.
5. Emit `consumer:resume` (the server created the consumer paused).
6. On the track's `unmute`, re-attach a fresh `MediaStream`. On `trackended`, clear the field and forget the consumer.

## Socket events handled in `registerListeners`

`participant:joined`, `participant:left`, `new:producer`, `producer:paused`, `producer:resumed`, `producer:closed`, `audio:level`, `chat:message`, `chat:typing`, `waiting:request`, `waiting:removed`, `waiting:admitted`, `waiting:denied`, `room:locked`, `room:ended`, `room:kicked`, `room:replaced`, `host:mute-all`, `host:mute-you`, `host:disable-all-cameras`.

Child components register their own listeners: `ChatPanel` (typing and sending), `ReactionsOverlay` (`reaction:received`), `ParticipantsList` and `WaitingRoomRequests` (emit moderation events).

Notable behaviours:

| Event | Client reaction |
|---|---|
| `room:ended`, `room:kicked`, `room:replaced` | `endSession(message)`: toast, `teardown()`, phase `ended`, navigate to `/` after 2 s |
| `host:mute-all`, `host:mute-you` | The client mutes its own mic (the server does not enforce it) |
| `host:disable-all-cameras` | The client turns its own camera off |
| `audio:level` | Updates the tile's level. A level above 20 marks that participant the active speaker. Ignored for unknown sockets |
| `producer:paused` / `producer:resumed` | Clears or restores the matching audio or video stream on that participant |

## Controls

| Action | What it does |
|---|---|
| Mute mic / camera | Toggles `track.enabled`, pauses or resumes the producer locally, and emits `producer:pause` / `producer:resume` so others update |
| Screen share | `getDisplayMedia`, then **`replaceTrack` on the existing video producer**. It does not publish a separate screen producer (`screenProducerRef` is never assigned). Stopping restores the camera with a new `getUserMedia` call |
| Reaction | `reaction:send { emoji }` |
| Lock / unlock (host) | `room:lock { locked }` |
| Mute all (host) | `host:mute-all` |
| Leave | `room:leave`, local teardown, navigate to `/` |
| End meeting (host) | `room:end` and **wait for the ack** (5 s fallback) before disconnecting. Disconnecting first would stop the server from processing the end request |
| Keyboard | `m` mic, `v` camera, `c` chat panel, `p` participants panel (ignored while typing in an input) |

## Teardown

`teardown()` is idempotent and also runs when the effect's cleanup fires: it removes exactly the listeners it added, clears the timers, closes the `AudioContext`, stops local and screen tracks, calls `ms.closeAll()`, resets the meeting store and **disconnects the socket**.

## Audio level reporting

`MeetingRoom` samples the local microphone with a Web Audio `AnalyserNode` every 200 ms and emits `audio:level`. A separate `hooks/useAudioLevel.ts` implements similar logic but is not used.
