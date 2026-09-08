# Directory bridge implementation verification

Implementation covers both `Supernizo-Autocall` and the sibling `lead-generation-tool` repository. Production activation is separate: no existing application database was migrated and both enable flags default to false. Follow [the rollout runbook](supernizo-directory-bridge.md).

## Verified behavior

- Supernizo database changes atomically produce directory state and durable outbox events, including bulk edits and deletion tombstones.
- Signed delivery provisions agents before their first login. Duplicate, reordered and concurrent events preserve the latest source revision.
- Supernizo controls identity, role and eligibility; Autocall controls site/event membership. Revocation preserves membership and historical identity.
- A real Python relay delivered to the built Next.js receiver over HTTP using an isolated PostgreSQL database. The return lookup used the actual signed FastAPI endpoint over test TLS.
- Playwright verified the earlier management page: source fields were read-only, site assignment persisted, a forged role change was rejected, and revocation disabled editing while retaining membership. The current screen limits the API and UI to event assignments only.
- The existing-user reconciliation CLI completed successfully through the signed source API.

## Commands and results

Commands used the project's installed pnpm 10 through `node node_modules/pnpm/bin/pnpm.cjs`. Database checks used a disposable PostgreSQL container and a database named `bridge_test`.

| Check                                                                                           | Result                                               |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm test` with `BRIDGE_TEST_DATABASE_URL`                                                     | 53 files, 189 tests passed                           |
| `pnpm typecheck`                                                                                | Passed                                               |
| `pnpm lint` (ESLint and Prettier)                                                               | Passed                                               |
| `pnpm build` (Prisma generation, packages and Next.js production build)                         | Passed                                               |
| Backend pytest: directory, PostgreSQL integration, Autocall access, RBAC, profile and bootstrap | 102 tests passed; one dependency deprecation warning |
| `pnpm directory:reconcile`                                                                      | Successfully synchronized an existing SSO identity   |
| `git diff --check` in both repositories                                                         | Passed                                               |

This verifies the bridge and relevant regressions locally. Deployment proxy paths, production credentials, worker capacity, external Redis/LiveKit services and live production rollout require staging/operational verification. Existing live SSE/media session lifecycles are unchanged.

## Changed files

Paths below are relative to their respective repository roots.

### Autocall

- `prisma/schema.prisma`
- `prisma/migrations/20260908000000_supernizo_directory/migration.sql`
- `apps/platform/src/server/integrations/supernizo-contract.ts`
- `apps/platform/src/server/integrations/supernizo-signature.ts`
- `apps/platform/src/server/integrations/supernizo-signature.test.ts`
- `apps/platform/src/server/integrations/supernizo-directory-client.ts`
- `apps/platform/src/server/integrations/reconcile-supernizo-users.ts`
- `apps/platform/src/server/services/supernizo-directory-service.ts`
- `apps/platform/src/server/services/supernizo-directory.postgres.test.ts`
- `apps/platform/src/server/services/access-management-service.ts`
- `apps/platform/src/server/auth/supernizo-sso.ts`
- `apps/platform/src/app/api/internal/integrations/supernizo/users/sync/route.ts`
- `apps/platform/src/app/api/internal/integrations/supernizo/users/sync/route.test.ts`
- `apps/platform/src/app/api/dashboard/access/users/route.test.ts`
- `apps/platform/src/app/components/access-management.tsx`
- `packages/shared/src/contracts.ts`
- `packages/shared/src/contracts.test.ts`
- `scripts/reconcile-supernizo-users.mjs`
- `package.json`
- `.env.example`
- `.env.production.example`
- `docker-compose.production.yml`
- `.github/workflows/production-deploy.yml`
- `docs/supernizo-directory-bridge.md`
- `docs/supernizo-directory-validation.md`

### Supernizo backend

- `migrations/20260908_autocall_directory.sql`
- `tools/migrate_autocall_directory.py`
- `tools/run_schema_migration.py`
- `app/application/services/autocall_directory.py`
- `app/application/services/auth_context.py`
- `app/api/auth/autocall_routes.py`
- `app/worker/system/autocall_directory.py`
- `app/worker/core/celery_app.py`
- `scripts/autocall_directory.py`
- `tests/test_autocall_directory.py`
- `tests/test_autocall_directory_postgres_integration.py`
- `.env.example`
- `docker-compose.yml`
- `.github/workflows/tests.yml`
- `.github/workflows/deploy.yml`
- `docs/autocall-directory-bridge.md`
