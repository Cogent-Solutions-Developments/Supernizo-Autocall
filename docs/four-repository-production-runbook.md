# Four-repository production runbook

This runbook deploys the Supernizo system as four coordinated repositories:

| Repository | Production responsibility | Deployment target |
| --- | --- | --- |
| `lead-generation-tool` | Identity, roles, access eligibility, SSO code exchange, directory outbox, business API and workers | Docker Compose on the backend host |
| `lead-gen-dashboard` | Light portal, including user and role administration | Vercel |
| `supernizo-heavy` | Heavy portal and Autocall launcher | Vercel |
| `Supernizo-Autocall` | Event assignment, calling, tracking and the directory receiver | Hetzner Docker Compose behind Nginx |

## 1. Set the canonical URLs once

Choose the real HTTPS hosts before configuring any repository. Do not use a
trailing slash.

| Name | Example | Used by |
| --- | --- | --- |
| `BACKEND_URL` | `https://api.example.com` | Both frontends and Autocall |
| `LIGHT_URL` | `https://light.example.com` | Autocall |
| `HEAVY_URL` | `https://heavy.example.com` | Autocall |
| `AUTOCALL_URL` | `https://api.infrastructuresg.com/autocall-db` | Backend, both frontends and Autocall |

The Autocall URL must end exactly in `/autocall-db`. The backend and both
frontends must use the same value. All production URLs in this table require
HTTPS; local loopback exceptions are only for `next dev`.

## 2. Secrets and shared values

Generate each secret separately with a cryptographically secure generator. Do
not reuse tokens across rows.

| Shared value | Backend variable | Autocall variable | Rule |
| --- | --- | --- | --- |
| SSO client secret | `AUTOCALL_CLIENT_SECRET` | `SUPERNIZO_AUTOCALL_CLIENT_SECRET` | Same 32+-character value on both sides. |
| Directory HMAC secret | `AUTOCALL_DIRECTORY_SYNC_SECRET` | `SUPERNIZO_DIRECTORY_SYNC_SECRET` | Same 32+-character value on both sides; distinct from the SSO secret. |
| Backend service token | `RUN_TOKEN` | — | Server-only. Use it as `BACKEND_SERVICE_API_KEY` only in Vercel server runtime. Never place it in a browser variable. |

Rotate `RUN_TOKEN` before this release if it has ever been used as
`NEXT_PUBLIC_API_KEY`. The Heavy frontend no longer sends browser API keys;
browser calls use the logged-in user's bearer token. Set a short
`RUN_TOKEN_PREVIOUS_EXPIRES_AT` only when a deliberate rotation grace period is
needed, then remove the previous value.

## 3. Repository environment variables

Store real values in the platform secret manager or ignored environment file;
commit only the provided `.env.example` templates.

### LeadGen backend (`lead-generation-tool`)

Set `ENV=production`. These values are mandatory because startup validates them:

| Group | Variables |
| --- | --- |
| Public callback URLs | `APP_PUBLIC_BASE_URL`, `SIGNALHIRE_CALLBACK_BASE_URL`, `TWILIO_WEBHOOK_PUBLIC_BASE_URL` — all absolute HTTPS URLs. |
| Data and queue | `DATABASE_URL`, `REDIS_URL`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Set `AUTO_CREATE_TABLES=false`. |
| Core secrets | `RUN_TOKEN`, `AUTH_SECRET_KEY`, `AUTH_MFA_SECRET_KEY`, `SIGNALHIRE_WEBHOOK_TOKEN`, `EVENT_SUBMISSION_API_KEY`, `TWILIO_AUTH_TOKEN` — each unique, random, and at least 32 characters. |
| Trusted ingress | `TRUSTED_PROXY_CIDRS`; set `METRICS_ALLOWED_CIDRS` if `PROMETHEUS_METRICS_ENABLED=true`. Values must be private CIDRs. |
| Storage | `STORAGE_PROVIDER=r2`, `R2_ENDPOINT_URL` or `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_REGION=auto`, `R2_SIGNED_URL_TTL_SECONDS=60..900`, and leave `STORAGE_PUBLIC_BASE_URL` empty. |
| Autocall SSO | `AUTOCALL_PUBLIC_URL=${AUTOCALL_URL}`, `AUTOCALL_CLIENT_SECRET`, optional `AUTOCALL_REDIS_URL` (otherwise `REDIS_URL`). |
| Autocall directory | `AUTOCALL_DIRECTORY_SYNC_ENABLED=false` for the first deploy, `AUTOCALL_DIRECTORY_SYNC_SECRET`, and leave `AUTOCALL_DIRECTORY_RECEIVER_URL` empty in production unless a different canonical HTTPS receiver route is required. |

Set provider-specific variables from `.env.example` only for enabled features:
`OPENAI_API_KEY`/agentic models, `SCRAPINGDOG_*`, `SIGNALHIRE_API_KEY`, SMTP or
Microsoft Graph, `D360_*`, Twilio WhatsApp sender/template variables, Make
webhooks, and Grafana/Prometheus settings. Do not leave an enabled feature with
placeholder credentials. Keep `TWILIO_VALIDATE_SIGNATURE=true`.

### Autocall (`Supernizo-Autocall`)

The production file is `/home/deploy/app/autocall/.env.production`, mode `0600`.
It accepts only these keys, which are validated by
`scripts/validate-production-env.sh`:

| Group | Variables |
| --- | --- |
| App and database | `APP_HOST_PORT=3200`, `APP_URL=${AUTOCALL_URL}`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`. Compose constructs the private `DATABASE_URL`; do not add it to this file. |
| Auth and privacy | `AUTH_SECRET`, `TRACKING_IP_HASH_SECRET` (both 32+ characters). |
| Realtime and media | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `LIVEKIT_URL` (`wss://`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. |
| Call tuning | `CALL_RING_TIMEOUT_SECONDS=10..120`, `CALL_CONNECTION_TIMEOUT_SECONDS=30..300`. |
| Supernizo SSO | `SUPERNIZO_BACKEND_URL=${BACKEND_URL}`, `SUPERNIZO_LIGHT_URL=${LIGHT_URL}`, `SUPERNIZO_HEAVY_URL=${HEAVY_URL}`, `SUPERNIZO_AUTOCALL_CLIENT_SECRET`. |
| Directory bridge | `SUPERNIZO_DIRECTORY_SYNC_ENABLED=false` for the first deploy, `SUPERNIZO_DIRECTORY_SYNC_SECRET`. |

The initializer `bash scripts/create-production-env.sh .env.production` writes
the file with correct permissions and prompts for every external credential.
It intentionally leaves directory delivery disabled until both sides are
deployed.

### Light frontend (`lead-gen-dashboard`)

Set these in the Vercel **Production** environment. `NEXT_PUBLIC_` values are
browser-visible. `BACKEND_SERVICE_API_KEY` and the Teams webhook are sensitive
server runtime variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL=${BACKEND_URL}` | Yes | Browser API origin. |
| `BACKEND_SERVICE_API_KEY=${RUN_TOKEN}` | Yes | Server-only KPI proxy credential. |
| `TEAMS_DEAL_BELL_WEBHOOK_URL` | Yes | Server-only deal notification integration. |
| `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`, `NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `NEXT_PUBLIC_EMAILJS_FEEDBACK_TEMPLATE_ID`, `NEXT_PUBLIC_EMAILJS_MEETING_TEMPLATE_ID` | Yes | EmailJS browser integration. |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Yes | Site key allow-listed for the Light host. |
| `AUTOCALL_PUBLIC_URL=${AUTOCALL_URL}` | Yes | Server-rendered SSO launch target. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Only if enabled | Browser Supabase client; require Row Level Security. |

### Heavy frontend (`supernizo-heavy`)

Set these in the Vercel **Production** environment:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL=${BACKEND_URL}` | Yes | Browser API origin. |
| `TEAMS_DEAL_BELL_WEBHOOK_URL`, `TEAMS_CLIENT_REQUEST_WEBHOOK_URL` | Yes | Server-only Teams integrations. |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | Yes if speech is enabled | Server-only voice integration. |
| `ELEVENLABS_MODEL_ID`, `ELEVENLABS_OUTPUT_FORMAT`, `ELEVENLABS_VOICE_STABILITY`, `ELEVENLABS_VOICE_SIMILARITY_BOOST`, `ELEVENLABS_VOICE_STYLE`, `ELEVENLABS_VOICE_SPEED`, `ELEVENLABS_VOICE_SPEAKER_BOOST` | Optional | Voice tuning; use the `.env.example` defaults if no override is needed. |
| `NEXT_PUBLIC_EMAILJS_PUBLIC_KEY`, `NEXT_PUBLIC_EMAILJS_SERVICE_ID`, `NEXT_PUBLIC_EMAILJS_FEEDBACK_TEMPLATE_ID`, `NEXT_PUBLIC_EMAILJS_MEETING_TEMPLATE_ID`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Yes | Browser EmailJS and reCAPTCHA configuration. |
| `AUTOCALL_PUBLIC_URL=${AUTOCALL_URL}` | Yes | Server-rendered SSO launch target. |

Do not configure `NEXT_PUBLIC_API_KEY` in either frontend. It is no longer read
by release code and must never contain the backend `RUN_TOKEN`.

## 4. Release order

1. Back up the backend and Autocall PostgreSQL databases. Confirm a restore can
   be performed before changing either schema.
2. Configure the backend production environment, apply its normal schema
   migration job including `migrations/20260907_add_autocall_access.sql` and
   `migrations/20260908_autocall_directory.sql`, then deploy API, worker and
   Beat. Keep `AUTOCALL_DIRECTORY_SYNC_ENABLED=false`.
3. On the Autocall host, create and validate `.env.production`, then deploy the
   immutable GHCR images. The repository workflow runs `pnpm prisma:deploy`
   through the migrator before replacing the app. Keep
   `SUPERNIZO_DIRECTORY_SYNC_ENABLED=false`.
4. Deploy Light and Heavy through their Vercel production workflows only after
   their Production environment variables are complete. The Heavy workflow
   stages, smoke-tests, and promotes the release. The Light workflow requires a
   staged smoke-test gate before it should be trusted for production promotion.
5. Confirm the SSO secret is identical on backend and Autocall, and the
   directory HMAC secret is identical on backend and Autocall. Enable the
   receiver first (`SUPERNIZO_DIRECTORY_SYNC_ENABLED=true`), redeploy Autocall,
   then enable the source (`AUTOCALL_DIRECTORY_SYNC_ENABLED=true`) and restart
   API, worker and Beat.
6. Run `pnpm directory:reconcile` in the Autocall runtime. Inspect backend
   directory outbox status and Autocall's audit records before giving users
   access to events.

## 5. Production verification

Run these checks in staging first, then production with a test employee:

1. Backend health and a deliberately invalid login return a normal `401`/`422`,
   not a proxy or application failure.
2. Light and Heavy login succeed, and their `/autocall` route rejects an
   unauthorized user without exposing a service credential.
3. An eligible user completes `/autocall-db/sso/start` → portal →
   `/sso/callback`; a replayed code, wrong state, revoked account and inactive
   user fail closed.
4. The Supernizo user appears in Autocall's two-selector event assignment page.
   Assign an event, verify the current-assignment table, revoke eligibility,
   then verify the user cannot receive a new assignment or use protected
   Autocall routes.
5. Verify LiveKit call setup, tracker public-origin checks, Redis-backed
   presence, and directory reconciliation. Monitor failed outbox rows and
   pending age.
6. Confirm Nginx disables caching for `/autocall-db/sso/*` and the signed
   directory receiver, redacts authorization headers/query strings, and only
   exposes 80/443. Autocall's 3200 and PostgreSQL ports must remain loopback or
   private-network only.

## 6. Rollback

If a frontend release fails, use Vercel Instant Rollback first. If Autocall
fails health checks, its deployment command restores the previous immutable app
image; Prisma migrations remain additive and are not reversed. For a bridge
problem, set the source sync flag to `false`, retain all outbox/tombstone data,
repair configuration, then replay/reconcile. Do not revert to local agent
creation or delete imported users/site memberships.
