# Local startup recovery — 2026-09-08

The local app could serve its login page, but PostgreSQL at `127.0.0.1:5433` was unavailable. Docker Desktop was stopped, and its active context had no Autocall database container or volume. Prisma generation succeeded because it does not connect to the database; migration, seeding and local administrator authentication required that missing database. The credentials provider masks database failures as a generic 401 sign-in failure.

After restoring PostgreSQL, the live visitor page exposed a second configuration issue: the active Upstash Redis hostname did not resolve. The alternate credentials already present in the user's local `.envv` file passed an authenticated Redis ping. Only those two Redis settings were copied into ignored `.env.local`, and the dev server was restarted.

## Changes

- `docker-compose.local.yml`: dedicated PostgreSQL 17 container, loopback port 5433, persistent volume, restart policy and readiness check.
- `package.json`: `pnpm db:up` waits for PostgreSQL readiness; `pnpm db:stop` preserves its data.
- `.env.example`: matching database port and canonical Autocall/auth URLs on port 3001.
- `docs/development-environment.md`: startup, sign-in, macOS package-manager and troubleshooting instructions.
- `.env.local` (ignored): working Redis URL/token from the existing local configuration. No secrets were added to tracked files.

## Verification

- `pnpm prisma:generate`, `pnpm prisma:deploy`, `pnpm prisma:seed`: passed. All four existing migrations applied to the new local database; no migrations created.
- `pnpm exec prisma migrate status`: database schema up to date.
- `pnpm lint`: passed, including repository formatting.
- `pnpm typecheck`: passed.
- `pnpm test`: 193 passed, 8 skipped across 54 files; the PostgreSQL repository smoke test passed.
- `pnpm build`: passed, including the shared package, tracker SDK and Next.js production build. Sandbox-only database/process restrictions required elevated verification; Turbopack's cached sandbox failure was moved aside before the successful build.
- `pnpm dev`: running on port 3001 with the corrected configuration.
- HTTP readiness and configuration endpoints: ready.
- Browser: local administrator sign-in and Events, Live visitors, Calls and Analytics navigation checked. Live dashboard presence and chat-list requests returned 200, session checks returned 204, and the realtime SSE connection returned 200.
- A fresh browser session after the restart completed login and loaded Live visitors with an empty browser error report and no framework error overlay.
- Providers: authenticated Upstash ping and LiveKit room-list request succeeded. The provider check did not create rooms or place calls.

## Remaining validation limits

No remaining blocker was observed for local administrator startup and dashboard use. A complete Supernizo portal login/handoff and two-device microphone/camera call were not exercised. Those flows require their own portal session and media-device verification. Existing gated tests remained skipped; no production deployment was performed.
