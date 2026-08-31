# Development environment

## Prerequisites

- Node.js 20.9 or newer and pnpm 10.34.5 (pinned in the root `packageManager` field).
- Docker Desktop for the local MySQL instance.
- An Upstash Redis database for Redis REST and Upstash Realtime.
- A LiveKit Cloud project for browser-media credentials.

Copy `.env.example` to `.env.local` and enter only local/development credentials. `.env.local` is ignored by Git; never commit credentials or put server secrets in `NEXT_PUBLIC_*` variables.

## Local MySQL

Start a local development database with Docker:

```sh
docker run --name supernizo-mysql -e MYSQL_DATABASE=supernizo -e MYSQL_USER=supernizo -e MYSQL_PASSWORD=supernizo-dev-password -e MYSQL_ROOT_PASSWORD=local-root-password -p 3306:3306 -d mysql:8.4
```

Use a local-only value such as:

```dotenv
DATABASE_URL=mysql://supernizo:supernizo-dev-password@127.0.0.1:3306/supernizo
```

With Docker running and `DATABASE_URL` present in `.env.local`, create the schema and local seed data from the repository root:

```sh
pnpm prisma:migrate --name init
pnpm prisma:seed
pnpm test:db
```

The initial migration is committed for repeatable clean-database creation. Use `pnpm prisma:deploy` in production; it applies committed migrations and never creates one. The seed creates `admin@local.test` and the `Demo Site`, whose allowed origin is `http://localhost:3100`.

## Local dashboard sign-in

Set a unique local-only admin password in `.env.local` before running the seed:

```dotenv
LOCAL_ADMIN_PASSWORD=replace-with-a-unique-local-password-of-at-least-12-characters
```

Then rerun `pnpm prisma:seed`. Sign in at `/login` as `admin@local.test` with that password. `AUTH_SECRET` must also be a random value of at least 32 characters for the encrypted/signed dashboard session. Do not use `LOCAL_ADMIN_PASSWORD` in production; production users must be provisioned through the approved identity workflow.

For production, use a managed MySQL provider with TLS and connection management. Do not reuse the local password.

## Upstash Redis and Realtime

Create an Upstash Redis database, then copy its REST URL and token from the Upstash console:

```dotenv
UPSTASH_REDIS_REST_URL=https://your-database.upstash.io
UPSTASH_REDIS_REST_TOKEN=replace-with-a-server-only-token
```

Upstash Realtime is backed by this Redis database. Phase 2 adds an internal `RealtimeProvider` contract but intentionally defines no application events or subscriptions yet.

## LiveKit Cloud

Create a LiveKit Cloud project and add its WebSocket endpoint, API key, and API secret:

```dotenv
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=replace-with-a-server-only-key
LIVEKIT_API_SECRET=replace-with-a-server-only-secret
```

`LIVEKIT_API_SECRET` is server-only. `LIVEKIT_URL` contains no secret and may later be returned by a trusted API response; it must not imply that the API key or secret can be exposed.

## Application secrets

```dotenv
APP_URL=http://localhost:3000
TRACKING_IP_HASH_SECRET=use-a-random-value-at-least-32-characters-long
AUTH_SECRET=use-a-random-value-at-least-32-characters-long
```

`TRACKING_IP_HASH_SECRET` is reserved for a later abuse/deduplication signal. It must not be used to store a raw IP or infer personal identity.

## Configuration behavior

Server provider modules validate the full configuration on import and throw a readable `EnvironmentConfigurationError` that names invalid variables but never prints their values. The development landing page does not import providers, so it remains runnable before credentials are provisioned.

`GET /api/health/config` is an unauthenticated diagnostic suitable for deployment checks. It returns only boolean readiness checks and an overall `ready` flag—never URLs, tokens, secrets, stack traces, or provider responses.

Vercel environment variables must be configured separately for Development, Preview, and Production. Choose a production function region close to the managed MySQL database. Use Vercel request geolocation later for approximate location; do not request device GPS permissions or add third-party location services.
