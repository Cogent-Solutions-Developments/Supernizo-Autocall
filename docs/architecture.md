# Architecture

## Production topology

Supernizo Autocall is a single Next.js and TypeScript application. In production, Docker Compose runs the application and PostgreSQL together on the existing Hetzner host under `/home/deploy/app/autocall`. Nginx terminates public TLS and forwards only `/autocall-db` traffic to the application’s loopback port.

```text
Browser
  |
  | HTTPS https://api.infrastructuresg.com/autocall-db
  v
Existing host Nginx
  | /autocall-db/* -> 127.0.0.1:3200
  v
Next.js app container :3000
  |
  | private Docker network only
  v
PostgreSQL container :5432 -> named persistent volume

Next.js -> Upstash Redis/Realtime over HTTPS
Browsers -> LiveKit over WebRTC after explicit visitor acceptance
```

PostgreSQL has no host port and no public URL. It is reachable only as `postgres:5432` from the private Compose network. The Next.js host port binds to `127.0.0.1`, so it can be reached by host Nginx but not directly from the Internet. The separate `Supernizo-Autocall-Database` repository is not part of or modified by this deployment.

## Service boundaries

| Concern                   | Service               | Boundary                                                                                                             |
| ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| UI and HTTP APIs          | Next.js App Router    | Server Components by default. Route Handlers validate and authorize requests, call services, and map safe responses. |
| Durable data              | PostgreSQL and Prisma | Configuration, users, visitors, sessions, events, conversations, calls, scores, and audit records.                   |
| Presence                  | Upstash Redis         | Short-lived presence, heartbeats, connection state, and expiry; it is not durable history.                           |
| Realtime application push | Upstash Realtime/SSE  | Dashboard updates, chat delivery, and ringing events through the internal realtime adapter.                          |
| Voice/video               | LiveKit               | Browsers connect directly to LiveKit after consent. Next.js issues scoped tokens and never proxies media.            |

## Deployment flow

Pull requests and `main` pushes run lint, type-checking, unit tests, PostgreSQL repository tests, migrations, and the production build in GitHub Actions. A successful `main` run connects to Hetzner using a pinned SSH host key and asks the fixed server checkout to deploy that exact reviewed commit.

The server deploy script validates its protected environment file, builds immutable commit-tagged app and migration images locally, starts PostgreSQL, applies committed Prisma migrations once, and replaces the application container. If the app fails its database-backed readiness check, the previous app image is restored when it is still present. Database migrations are never automatically reversed.

## Security boundaries

- Only Nginx ports 80/443 and the restricted SSH service need public host access. PostgreSQL is never published.
- Database, Redis, LiveKit API, authentication, and tracking secrets remain server-only.
- Public tracker endpoints validate the site public key, allowed origin, payload schema, and rate limit before business logic runs.
- Raw visitor IP addresses are not stored by default. Approximate location is accepted only from explicitly trusted reverse-proxy headers.
- Production `.env.production` is stored only on Hetzner with mode `0600`, never in GitHub or an image.
- Media requires visitor acceptance and browser permission. V1 does not record media.

See `docs/hetzner-deployment.md` for the host bootstrap, Nginx, GitHub Actions, backup, restore, and deployment procedures.
