# Pages, Components and Hooks

Inventory of `apps/ui/src`, with what is **wired into the running app** (reachable from `main.tsx` → `App.tsx`) and what is not. Status was determined by tracing imports.

Legend: ✅ used by the running app · ⚪ present but not reachable.

## Pages (`src/pages`)

| Page | Status | Description |
|---|---|---|
| `auth/AuthPage.tsx` | ✅ route `/auth` | Sign-in and registration form (`lib/authApi.login` / `register`). Also opens `JoinMeetingDialog` (guest join) and `CreateDemoDialog` (account-free demo room). On success navigates to `/` |
| `home/HomePage.tsx` | ✅ route `/` | Landing page for signed-in users: new meeting (`CreateMeetingDialog`), join (`JoinMeetingDialog`), theme toggle, sign-out menu |
| `meeting/MeetingRoom.tsx` | ✅ route `/meeting/:roomId` | The meeting itself. See [REALTIME_CLIENT.md](REALTIME_CLIENT.md) |
| `meetings/MeetingsPage.tsx` | ⚪ | Upcoming/previous meetings list. Its data fetch is commented out and the state starts empty |
| `profile/ProfilePage.tsx` | ⚪ | Profile screen (reads `authStore`) |
| `settings/SettingsPage.tsx` | ⚪ | Settings screen (its route is commented out in `routes/index.tsx`) |
| `support/SupportPage.tsx` | ⚪ | Static help articles. Titles are hard-coded and refer to "MeetApp" |

The ⚪ pages are only referenced by `src/routes/index.tsx`, which `main.tsx` does not import.

## Components (`src/components`)

### Dialogs: ✅

| Component | Props | Action |
|---|---|---|
| `CreateMeetingDialog` | `{ open, onClose }` | Form (name, mode, lock + password, max participants) → `POST /create` → navigate to `/meeting/:roomId` |
| `CreateDemoDialog` | `{ open, onClose }` | Same plus a display name → `POST /demo/create` → stores `demoUser` in `sessionStorage` → navigate |
| `JoinMeetingDialog` | `{ open, onClose }` | Room code (lower-cased), optional password, display name (required when signed out) → saves `displayName` in `localStorage` → navigate to `/meeting/:code?pw=…` |

### Meeting room: ✅

| Component | Props | Role |
|---|---|---|
| `video/VideoGrid` | see file | Lays out tiles for local and remote streams. Reads `layoutMode`, `pinnedSocketId`, `activeSpeakerSocketId` from the store |
| `video/VideoTile` | see file | One participant's video, audio level and name |
| `meeting/MeetingControls` | `onToggleMic`, `onToggleCamera`, `onToggleScreen`, `onLeave`, `onEndRoom?`, `onToggleLock?`, `onMuteAll?`, `onReaction`, `onToggleLayout`, `isRecording?`, `onToggleRecording?`, `isHost`, `roomMode`, `canProduce`, `roomId?` | Bottom control bar. Has a server-synced elapsed timer and a copy-room-code helper. No recording is implemented in `MeetingRoom`, so the optional recording props are unused |
| `chat/ChatPanel` | `{ socket }` | Message list, input, typing indicator. Emits `chat:send` and `chat:typing` |
| `meeting/ParticipantsList` | `{ socket, isHost }` | Participant list. Host can mute (`host:mute-participant`) or remove (`host:kick`) |
| `meeting/WaitingRoomRequests` | `{ socket }` | Host's admit and deny list (`waiting:admit`, `waiting:deny`) |
| `meeting/Reactionsoverlay` | `{ socket }` | Listens for `reaction:received` and animates reactions |

### Unused: ⚪

| Component | Note |
|---|---|
| `layout/AppLayout`, `layout/Header`, `layout/Sidebar` | Shell used only by the unmounted `routes/index.tsx` |
| `meeting/DeviceSettings` | Not imported anywhere |
| `meeting/BroadCastBanner` (`BroadcastBanner`) | Not imported anywhere |

## Hooks (`src/hooks`)

| Hook | Status | Description |
|---|---|---|
| `useMediasoup(socketRef)` | ✅ | Wraps a mediasoup-client `Device`, send/recv transports, producers and consumers. Returns `loadDevice`, `createSendTransport`, `createRecvTransport`, `consumeProducer`, `produceTrack`, `closeAll` and the refs |
| `useTimeSync(socket)` | ✅ | NTP-style clock offset (5 rounds, outliers trimmed, every 30 s) |
| `useAuth()` | ⚪ | `{ user, loading, isAuthenticated }` selector. Only used by `routes/index.tsx` |
| `useDevices()` | ⚪ | Camera, microphone and speaker enumeration and switching |
| `useAudioLevel(stream, isMuted)` | ⚪ | Web Audio level meter that emits `audio:level` (the room does its own sampling) |

## Other files

| File | Status | Description |
|---|---|---|
| `src/theme/index.ts` | ✅ | `darkTheme`, `lightTheme`, default export `darkTheme` |
| `src/config.js` | ⚪ | `SERVER_URL` from `VITE_SERVER_URL` (default `http://localhost:3000`). Not imported |
| `src/index.css` | ⚪ | Tailwind directives and a `.scroll` helper. Not imported |
| `public/mock/*.json` | ⚪ | `devices`, `meetings`, `messages`, `participants`, `users` sample data. Not fetched |
| `remove-console.js` | tool | A jscodeshift transform. Not wired into a script |

## Adding a feature: where things go

- A new REST call: add a function that calls `apiFetch` (see `lib/authApi.ts` for the pattern).
- A new in-meeting socket event: add the server handler first ([SOCKET_EVENTS.md](../../server/docs/SOCKET_EVENTS.md)), then register the listener with the `on()` helper in `MeetingRoom.registerListeners` so teardown removes it. For component-local events, remove the listener in the effect cleanup.
- New shared meeting data: add a field and setter to `meetingStore.ts` and include it in `initialState` so `reset()` clears it.
- Shared types: update **both** `apps/ui/src/types/index.ts` and `apps/server/src/types/index.ts`.
