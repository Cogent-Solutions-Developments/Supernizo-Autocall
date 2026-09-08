# Development environment

## Prerequisites

- Node.js 24 and pnpm 10.34.5.
- Docker Desktop for local PostgreSQL.
- Development Upstash Redis and LiveKit credentials.

Copy `.env.example` to `.env.local`. The local file is ignored by Git; never use `NEXT_PUBLIC_*` for server credentials.

## Local PostgreSQL

```sh
docker run --name supernizo-postgres --restart unless-stopped -e POSTGRES_DB=supernizo -e POSTGRES_USER=supernizo -e POSTGRES_PASSWORD=supernizo-dev-password -p 127.0.0.1:5432:5432 -d postgres:17.11-bookworm
```

Use this local URL:

```dotenv
DATABASE_URL=postgresql://supernizo:supernizo-dev-password@127.0.0.1:5432/supernizo
```

Then install, create the schema, seed local-only data, and verify the repository:

```sh
pnpm install
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

After `pnpm prisma:seed`, sign in at `http://localhost:3000/autocall-db/login` as `admin@local.test`. The local seed and password must never be used in production.

## External application providers

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-a-server-only-token
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=replace-with-a-server-only-key
LIVEKIT_API_SECRET=replace-with-a-server-only-secret
APP_URL=http://localhost:3000/autocall-db
TRACKING_IP_HASH_SECRET=replace-with-an-independent-random-value-of-at-least-32-characters
```

Upstash stores transient presence and carries SSE application events. LiveKit handles WebRTC signalling and media. `LIVEKIT_API_SECRET`, Redis credentials, database credentials, and signing secrets must remain server-only.

## Run and verify

```sh
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The application base path is `/autocall-db`. `GET /autocall-db/api/health/config` reports only boolean configuration readiness. `GET /autocall-db/api/health/ready` additionally verifies a database query and is used by Docker and deployment health checks.
