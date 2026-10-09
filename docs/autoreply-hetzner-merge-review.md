# Autoreply to Hetzner production merge review

The reviewed production reference is `9e8176792f910c4cacc7496d5b2737db3e923c59`.
The source is `feat/autoreply` at `d461f4c5d425b083ef8b851f2b35c9739e54783a`.
Production is already an ancestor of the source; Git reports no merge conflicts.
The source adds three commits and changes 362 paths, including many file moves.

## Application changes

- Reorganizes components and server code into application, composition, domain,
  infrastructure, and interface folders, with repository ports and tests.
- Adds visitor contact capture and follow-up statuses to chat and the agent inbox.
- Adds user display names and profile photos with an authenticated settings API.
- Resets the chat header to Swetha when a visitor returns after presence expiry
  or starts a new session; a fresh agent reply supplies the current name/photo.
- Includes widget styling and local authentication fixes. Local admins are eligible
  for visitor calls only in development; production retains Supernizo eligibility.

## Production compatibility

A direct merge of the source removes `scripts/github-deploy-command.sh` and
`scripts/deploy-production.sh`, which the working server invokes using its existing
restricted SSH command. It also moves the Compose file and the backup entry point.
The source runbook requires a server configuration migration for those moves.

The local `review/autoreply-hetzner` candidate retains the original production
Dockerfile, Compose file, seven operational shell scripts, and backup service
bytes. The workflow still builds the root Dockerfile, uses the existing routing
check path, and runs the relocated tests plus a compatibility regression test.
The existing production deployment guide is retained. Legacy Node script entry
points delegate to their relocated implementations. No SSH, Nginx, systemd,
provider, secret, volume, or server settings were changed.

The `ops/` copies remain available. Production Compose, the Nginx configuration,
`.env.production.example`, dependency versions, and the lockfile are unchanged
from production. The application still uses `/autocall-db` and loopback port 3200.
The production session-cookie name and path are unchanged; CSRF and callback
cookies are now explicitly scoped to the application.

## Database changes

Two new migrations must run before the new application starts:

- `20261008000000_chat_follow_up`: adds two enums and six columns to `ChatThread`.
  Existing rows receive `NEEDS_REPLY`; contact fields are nullable.
- `20261009000000_user_profile`: adds the `UserProfile` table and a user foreign key.

Existing migration files are unchanged. Neither migration drops data or renames
existing tables. The normal deploy script runs `prisma migrate deploy` before
starting the new app. The old app can continue using its existing columns if the
application image is rolled back; database migrations are not automatically
reversed. Take the normal production backup before approving deployment. Do not
run the development seed on production.

## Release boundary

The production workflow publishes and deploys automatically on a successful push
to `hetzner-prod`. A pull request runs quality checks without deploying. This
review creates only a local candidate; no branch was pushed, no pull request was
merged, no workflow was dispatched, and no production database was accessed.

Local validation results are recorded below. Re-fetch and
re-check the production reference before approving the actual merge.

## Local validation results

All checks passed on the isolated candidate:

- `pnpm lint`: ESLint and repository formatting.
- `pnpm typecheck`: all three TypeScript workspaces.
- `pnpm test`: 354 tests across 88 files, including PostgreSQL integration and
  durable contact-follow-up tests. `CI=true` enables the smoke tests. The directory
  integration database must be named `bridge_test`; the initial differently named
  fixture was corrected before the successful full run.
- `node --test tests/deployment/production-compatibility.test.mjs
tests/deployment/vercel-config.test.mjs tests/deployment/nginx-routing.test.mjs
tests/development/local.test.mjs`: 11 tests passed, including real local Nginx.
- `pnpm exec prisma validate`, `pnpm prisma:generate`, and `pnpm prisma:deploy`:
  schema valid and all eight migrations applied to isolated local databases.
- Upgrade rehearsal: applied the six production migrations, inserted synthetic
  existing user/site/visitor/thread/message records, then applied the two new
  migrations. Existing records survived, the thread received `NEEDS_REPLY` with
  empty contact fields, and a profile could be saved for the existing user.
- `docker compose -f docker-compose.production.yml config --quiet` and the `ops/`
  equivalent passed using synthetic settings; every operational shell script
  passed Git Bash `bash -n`.
- `pnpm build`: complete production build passed.
- `git diff --check`: no whitespace errors. Retained production files were checked
  against `origin/hetzner-prod` and match its Git content exactly.

Dependencies were installed from the existing cache with
`pnpm install --offline --frozen-lockfile --ignore-scripts`; versions did not change.
No full browser call flow, live provider requests, Docker image publication, or
production deployment was performed. GitHub CI has not run for this local branch.
The disposable database container was stopped after validation.

## Candidate files

The compatibility commit changes these files relative to `feat/autoreply`:

- Restores `Dockerfile`, `docker-compose.production.yml`, and the original shell
  files under `scripts/`: `backup-postgres.sh`, `check-public-routing.sh`,
  `create-production-env.sh`, `deploy-production.sh`, `github-deploy-command.sh`,
  `production-env.sh`, and `validate-production-env.sh`.
- Restores the original `ops/systemd/supernizo-autocall-backup.service` path and
  `docs/hetzner-deployment.md`; updates `ops/README.md` to document compatibility.
- Adds compatibility entry points `scripts/reconcile-supernizo-users.mjs`,
  `scripts/nginx-routing.test.mjs`, and `scripts/vercel-config.test.mjs`.
- Updates `.github/workflows/production-deploy.yml` to retain production build and
  routing paths and include `tests/deployment/production-compatibility.test.mjs`.
- Adds this review report and the compatibility test, ignores `/debug.log` in
  `.gitignore`, and removes the committed browser debug log from the candidate.

No additional migrations or application behavior changes were introduced by the
compatibility commit. The two feature migrations listed above remain part of the
candidate and are required for release.
