# Development environment

## Prerequisites

- Node.js 24 and pnpm 10.34.5.
- Docker Desktop for local PostgreSQL.
- Development Upstash Redis and LiveKit credentials.

Copy `.env.example` to `.env.local`. The local file is ignored by Git; never use `NEXT_PUBLIC_*` for server credentials.

On macOS, use `pnpm` (or `corepack pnpm`), not the Windows-only `pnpm.cmd` or `npm.cmd`. If `pnpm --version` already reports `10.34.5`, no global reinstall is needed. npm may warn about pnpm-specific `.npmrc` settings; use pnpm for this workspace.

## Local PostgreSQL

Start Docker Desktop first, then start the dedicated Autocall database and wait for it to become healthy:

```sh
pnpm db:up
```

`docker-compose.local.yml` publishes PostgreSQL only on loopback port `5433` and retains its data in a named volume. Port `5432` remains available for the separate Supernizo backend. Use `pnpm db:stop` to stop this database while preserving its data. These credentials are for local development only. If you already have an Autocall database on a different port, keep its matching `DATABASE_URL` and start that existing database instead.

Use this local URL:

```dotenv
DATABASE_URL=postgresql://supernizo:supernizo-dev-password@127.0.0.1:5433/supernizo
```

Then install, create the schema, seed local-only data, and verify the repository:

```sh
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
pnpm test:db
```

For later schema work, run `pnpm prisma:migrate --name descriptive_name` against local PostgreSQL. Production uses only `pnpm prisma:deploy` through the migration container.

## Local dashboard sign-in

Set a unique local-only password before seeding:

```dotenv
LOCAL_ADMIN_PASSWORD=replace-with-a-unique-local-password-of-at-least-12-characters
AUTH_SECRET=replace-with-a-random-value-of-at-least-32-characters
```

After `pnpm prisma:seed`, sign in at `http://localhost:3001/autocall-db/login` as `admin@local.test`, using `LOCAL_ADMIN_PASSWORD` from `.env.local`. Rerunning the seed updates that local account's password. The local seed and password must never be used in production. Supernizo credentials belong in the separate **Continue through Supernizo** flow; they cannot sign in through this local administrator form.

## External application providers

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-a-server-only-token
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=replace-with-a-server-only-key
LIVEKIT_API_SECRET=replace-with-a-server-only-secret
APP_URL=http://localhost:3001/autocall-db
NEXTAUTH_URL=http://localhost:3001/autocall-db/api/auth
TRACKING_IP_HASH_SECRET=replace-with-an-independent-random-value-of-at-least-32-characters
```

Upstash stores transient presence and carries SSE application events. LiveKit handles WebRTC signalling and media. `LIVEKIT_API_SECRET`, Redis credentials, database credentials, and signing secrets must remain server-only.

## Run and verify

```sh
pnpm db:up
pnpm --filter @supernizo/shared build
pnpm --filter @supernizo/tracker-sdk build
pnpm dev
```

Open `http://localhost:3001/autocall-db/login`. The platform dev command selects port `3001`; keep the `/autocall-db` base path in browser URLs. Run only one platform dev server for this checkout.

In another terminal, verify the repository:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The application base path is `/autocall-db`. `GET /autocall-db/api/health/config` reports only boolean configuration readiness. `GET /autocall-db/api/health/ready` additionally verifies a database query and is used by Docker and deployment health checks.

## Troubleshooting startup

- **Prisma P1001 at `127.0.0.1:5433`:** start Docker Desktop and run `pnpm db:up` before deploying migrations or seeding. Generating Prisma Client does not start PostgreSQL or create tables.
- **Local login returns 401:** first check `/autocall-db/api/health/ready`, then run `pnpm prisma:deploy` and `pnpm prisma:seed`. The credentials provider returns a generic sign-in failure when its database query fails as well as when credentials are invalid.
- **Repeated `/sso/start` redirects:** this route intentionally redirects to the configured Supernizo portal. Verify the correct Light/Heavy portal is running at its configured URL and has a valid Supernizo session. Use the local administrator form for standalone Autocall testing. See [Supernizo integration](supernizo-integration.md) for the full SSO setup.
- **Health configuration is ready but calls/presence fail:** configuration readiness validates settings, not provider connectivity. Upstash Redis and LiveKit must be reachable with valid development credentials; media testing also requires microphone/camera permission.
- **Redis `ENOTFOUND` or live visitors fails to load:** verify that `UPSTASH_REDIS_REST_URL` belongs to an active database and that its REST token matches. Replace obsolete settings in `.env.local` and restart `pnpm dev`. Files with other names, such as `.envv`, are not loaded by the application.
