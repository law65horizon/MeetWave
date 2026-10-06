# State and Data Access

## HTTP client: `src/lib/api.ts`

`apiFetch<T>(path, { method?, body? }, retry = true)` is the only way the UI calls the REST API.

| Behaviour | Detail |
|---|---|
| Base URL | `VITE_API_URL` without a trailing slash. Throws at import time if missing |
| Method | `options.method`, else `POST` when a `body` is given, else `GET` |
| Body | **Pass a plain object.** The wrapper calls `JSON.stringify` and sets `Content-Type: application/json` |
| Cookies | `credentials: "include"` on every call |
| Extra header | `ngrok-skip-browser-warning: true` (for dev tunnels) |
| 204 | Returns `undefined` |
| Non-2xx | Throws `ApiError(status, message, code?, details?)`, using `error`, `code` and `details` from the JSON body |
| Network failure | `fetch` rejects with a `TypeError` |

`errorMessage(e)` converts anything thrown into a toast-safe string: first Zod detail message, else the API message, else `"Cannot reach the server"` for a `TypeError`, else `"Something went wrong"`.

### Automatic session refresh

On a `401`, for any path **not** in `NO_REFRESH` (`/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`), the client:

1. calls `refreshSession()`,
2. if it succeeded, replays the original request once (`retry = false`),
3. if it failed, calls `useAuthStore.getState().setUser(null)`, which sends guarded routes back to `/auth`.

`refreshSession()` is **single-flight per tab**: concurrent callers share one promise. `doRefresh()` additionally wraps the request in `navigator.locks.request("auth-refresh", …)` when the Web Locks API exists, so several tabs take turns.

### Trace: a request after the access cookie expired

Two tabs, A and B, are open. The 30-minute access cookie is gone in both. Both fire a request at nearly the same time.

1. Tab A: `GET /auth/me` → server sees no `access_token` → `401 {"code":"NO_TOKEN"}`.
2. Tab A: `refreshSession()` creates the promise and asks the lock `auth-refresh`. It gets it and sends `POST /auth/refresh` with cookie `refresh_token=R1`.
3. Tab B: its own `GET` also returns 401. `refreshSession()` asks for the same lock and **waits**.
4. The server consumes `R1`, returns `200`, and sets new cookies containing `R2`. Tab A releases the lock and replays `GET /auth/me`, which succeeds.
5. Tab B gets the lock and sends `POST /auth/refresh`. The browser attaches the cookie jar's *current* value, `R2` (cookies are shared across tabs), so the server accepts it and issues `R3`.
6. Without the lock, step 5 could have sent `R1` again. The server treats a reused token as theft and would revoke every session of the user.

## Auth: two overlapping modules

| Module | Role |
|---|---|
| `store/authStore.ts` | Zustand store: `user`, `isAuthenticated`, `loading`, `setUser`, `setLoading`, `initAuth`, `login`, `register`, `logout`. **Used by the app for `initAuth` and `logout`, and as the source of `user`** |
| `lib/authApi.ts` | Plain functions `register`, `login`, `logout`, `initAuth` that call `apiFetch` and then `setUser`. **`AuthPage` uses `login` and `register` from here** |

`authApi.initAuth` is **not** called anywhere. `App.tsx` uses the store's `initAuth`, which de-duplicates concurrent calls through a module-level `initPromise`.
`authStore.login` and `authStore.register` are not called by any component. They go through a helper `submit()` that does not match how `apiFetch` behaves. See [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

`useAuth()` (`hooks/useAuth.ts`) is a thin selector returning `{ user, loading, isAuthenticated }`. It is only used by the unused `routes/index.tsx`.

### `AuthUser`

```ts
{ id: string; name: string; email: string }
```

## Meeting state: `store/meetingStore.ts`

One Zustand store (`useMeetingStore`) holds everything about the current meeting. It is cleared by `reset()` when the user leaves.

| Group | Fields | Notes |
|---|---|---|
| Room | `room`, `participants`, `myRole`, `mySocketId` | Filled from the `room:join` ack |
| Media | `localStream`, `localScreenStream`, `remoteStreams` (`Map<socketId, RemoteStream>`), `isMicOn`, `isCameraOn`, `isScreenSharing` | `RemoteStream` holds separate `videoStream`, `audioStream`, `screenStream`, plus `audioLevel`, `role`, `isHost` |
| Chat | `messages`, `typingUsers` (`Map<socketId, name>`), `unreadCount` | |
| Reactions | `reactions` | Short-lived items for the overlay |
| Waiting room | `waitingList` | Only the host receives entries |
| Clock | `clockOffset` | Add to `Date.now()` to get server time |
| UI | `isChatOpen`, `isParticipantsOpen`, `layoutMode` (`"grid" \| "spotlight" \| "sidebar"`), `pinnedSocketId`, `activeSpeakerSocketId` | |

Behaviours worth knowing:

- `setRemoteStream(socketId, partial)` **creates** the entry if missing and merges the partial over it, ignoring `undefined` values. A late update for someone who left would re-create a blank tile, so callers guard with `remoteStreams.has(socketId)` (see the `audio:level` handler in `MeetingRoom.tsx`).
- `addParticipant` replaces any existing participant with the same `socketId`.
- Components that must not re-render on every audio-level update subscribe with selectors, for example `useMeetingStore((s) => s.isChatOpen)`.
- `useMeetingStore.getState()` is used inside socket callbacks to read current values.

## Browser storage keys

| Storage | Key | Written by | Read by |
|---|---|---|---|
| `localStorage` | `displayName` | `JoinMeetingDialog` | `MeetingRoom` (fallback chain: stored name, then the account name) |
| `sessionStorage` | `demoUser` | `CreateDemoDialog` | `MeetingRoom` (sent as `auth.demoUserId`) |

Both are plain, user-editable values. The server treats `demoUserId` as the demo host's identity (see the server [KNOWN_ISSUES](../../server/docs/KNOWN_ISSUES.md)).

## Shared types: `src/types/index.ts`

Mirrors `apps/server/src/types/index.ts`: `RoomMode`, `RoomMeta`, `ParticipantMeta`, `ChatMessage`, `WaitingEntry`, `ProducerInfo`, plus the client-only `RemoteStream` and `Reaction`. The two files are separate copies, so changes must be made in both by hand. The client's `RoomMeta` has no optional `private` field.
