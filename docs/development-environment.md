# Local development

## Quick start

Use Node.js 24, pnpm 10.34.5, and Docker Desktop with Linux containers. Start Docker Desktop before setup. Run these commands from the repository root (PowerShell, macOS, and Linux use the same commands):

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev:local
```

Setup creates an ignored `.env.development.local` with random authentication, tracking, and administrator secrets, starts PostgreSQL, generates Prisma Client, applies existing migrations, seeds a local administrator and demo site, and builds the shared package and tracker. It preserves an existing development file and never resets database volumes. Existing `.env` and `.env.local` files are unchanged.

Open **http://localhost:3001/autocall-db/login**. Sign in as **admin@local.test**, using `LOCAL_ADMIN_PASSWORD` from `.env.development.local`. Keep this file private. Running setup again updates the local administrator password to the value in that file.

## Realtime and calls

Add development provider values to `.env.development.local`:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-server-only-token
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-server-only-key
LIVEKIT_API_SECRET=your-server-only-secret
```

To prepare only the configuration before starting Docker, use `pnpm dev:init`. It never overwrites existing values. Restart `pnpm dev:local` after editing settings. The local launcher explicitly loads this file into the subprocess environment, so Prisma, Next.js, and test commands all use the same settings instead of inheriting an unrelated database URL from `.env.local`.

PostgreSQL runs locally; Upstash Realtime/SSE and LiveKit remain external providers. Dashboard login and database tests can be used without provider credentials, but live visitor tracking, chat, and calls need working provider connections. A shared Upstash database also shares ephemeral application state with other environments. Do not test against production provider resources. Microphone/camera permission and visitor acceptance remain required. Optional GeoIP lookups use `GEOIP_DATABASE_PATH` if you supply a local MMDB file.

Directory and notification synchronization are disabled by the local launcher. For full Supernizo SSO integration, use the separate [integration guide](supernizo-integration.md) and your explicitly configured `pnpm dev` environment.

## Database and test isolation

Compose is tracked at `ops/docker/docker-compose.local.yml`. PostgreSQL is exposed only at `127.0.0.1:15433`, leaving port 5432 free for the Supernizo backend. Local-only credentials are `supernizo` / `supernizo-dev-password`. A dedicated named volume preserves data between restarts.

Setup prepares three databases:

| Database        | Purpose                                                   |
| --------------- | --------------------------------------------------------- |
| `supernizo`     | Development dashboard, seeded administrator and demo site |
| `autocall_test` | Application repository smoke tests                        |
| `bridge_test`   | Isolated directory synchronization integration tests      |

Local commands reject a changed database URL to avoid applying local seeds or tests to an unrelated server. Existing custom environments can still use the original `prisma:*`, `dev`, and `test` commands explicitly.

```sh
pnpm db:up
pnpm db:logs
pnpm db:stop
pnpm db:migrate:local --name describe_your_change
```

Stopping preserves data. After adding a migration, rerun `pnpm dev:setup` to regenerate the client and update all three local databases. Avoid concurrent test runs against the same test databases.

## Test the application

Keep `pnpm dev:local` running. Open the [visitor fixture](http://localhost:3001/autocall-db/sdk/fixture.html) in a separate browser context and the dashboard in another to exercise tracking, chat and calls. The seeded site public key is `site_demo_local`, and its allowed origins include localhost ports 3000, 3001, and 3100.

```sh
pnpm test:local
pnpm test:db:local
pnpm exec playwright install chromium
pnpm test:e2e:smoke:local
pnpm test:e2e:local
```

The local test commands select the isolated test databases. The browser smoke command checks login and authenticated site access without requiring realtime providers. The browser test command loads the local administrator password without printing it. Playwright connects to the running app on port 3001; it does not start a second server. Chat and call scenarios need Upstash and LiveKit and may require updates when product UI changes. Browser artifacts are stored in `tests/test-results`.

Repository quality checks:

```sh
pnpm lint
pnpm typecheck
pnpm build
```

## Troubleshooting

- **Docker pipe/daemon unavailable:** start Docker Desktop, wait for the Linux engine, then rerun `pnpm dev:setup`.
- **Port 15433 in use:** stop the conflicting local service before starting this dedicated database.
- **Missing TLS certificate:** use `pnpm dev:local` and `pnpm test:local`; these use loopback PostgreSQL without the old remote certificate URL.
- **Login fails:** check [database readiness](http://localhost:3001/autocall-db/api/health/ready), rerun setup, and use the password from `.env.development.local`.
- **Widgets fail or Redis returns ENOTFOUND:** check the provider values and network access, then restart the dev server. Provider configuration being present does not prove connectivity.
- **Port 3001/Next.js lock already in use:** stop the earlier dev server for this checkout; run only one.
- **SSO redirects away:** use the local administrator form for standalone development. SSO requires the separate Supernizo applications.
