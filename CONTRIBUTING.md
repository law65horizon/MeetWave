# Contributing to MeetWave

Thanks for helping. This guide is grounded in how the repository is set up today. Where something does not exist yet (tests, CI, lint), it says so.

## Getting set up

Follow [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md): Node 24+, pnpm 12.9.1, a password-protected Redis, then `pnpm install` and `pnpm dev`.

## Where to make changes

| You want to change | Look at |
|---|---|
| Account or auth behaviour | `apps/server/src/routes/auth/`, `apps/server/src/middleware/` |
| Meeting rules (join, lock, waiting room, kick) | `apps/server/src/socket/handlers/room.ts`, `guards.ts` |
| Media signalling | `apps/server/src/socket/handlers/media.ts`, `mediasoup/workerPool.ts`, `config/mediasoup.ts` |
| What is stored in Redis | `apps/server/src/redis/roomRepository.ts` (and update [DATA_MODEL.md](apps/server/docs/DATA_MODEL.md)) |
| In-meeting UI | `apps/ui/src/pages/meeting/MeetingRoom.tsx`, `components/meeting`, `components/video` |
| Look and feel | `apps/ui/src/theme/index.ts` |

Read the ["Project conventions"](docs/DEVELOPMENT.md#project-conventions-seen-in-the-code) first. They exist because of bugs the code comments describe (double-announced departures, stale `socket.data`, stale store snapshots).

## Workflow

1. Create a branch.
2. Make a focused change. Keep unrelated cleanup out of the same change.
3. Check it:
   - Server: `pnpm --filter ./apps/server build` (runs `tsc`).
   - UI: `pnpm --filter ./apps/ui build` (runs `tsc && vite build`).
   - Test the meeting flow manually with two browser contexts. There is no automated test suite.
4. Update the docs that your change affects (see below).
5. Open a pull request describing what changed and how you verified it.

## Documentation rules

Docs here are meant to match the code exactly.

- Changing a REST route → update [apps/server/docs/API.md](apps/server/docs/API.md).
- Changing a socket event → update [apps/server/docs/SOCKET_EVENTS.md](apps/server/docs/SOCKET_EVENTS.md).
- Changing a Redis key or TTL → update [apps/server/docs/DATA_MODEL.md](apps/server/docs/DATA_MODEL.md).
- Adding or renaming an environment variable → update `apps/server/.env.example`, `compose.yaml` and [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
- Fixing an item from a `KNOWN_ISSUES.md` → remove it from the table (and from the summary in [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)).

## Code style

- TypeScript `strict`. No `any` for new public interfaces if you can avoid it.
- `prettier` is a root dev dependency, but no config or script exists yet. Match the surrounding formatting (double quotes, semicolons, trailing commas in multi-line literals).
- Log with `logger` on the server. Do not leave `console.log` in the UI (production builds strip them, but the repo's own ESLint config forbids `no-console`).

## Security

Do not open public issues for vulnerabilities. <!-- TODO: add a private reporting channel --> Never commit `.env` files or real secrets. `.gitignore` already excludes `.env`. Review [docs/SECURITY.md](docs/SECURITY.md) before touching auth, cookies, rooms or moderation.

## Licensing

`package.json` says `ISC`, but there is no `LICENSE` file. <!-- TODO: confirm --> Ask the maintainer before contributing code that has other license terms.
