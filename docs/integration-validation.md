# Integration delivery and validation

Branch in all repositories: `feat/imp/supernizo-autocall-access`. No push, deployment, production configuration change, or production migration was performed.

## Result

Added compatible secondary Autocall assignments, administrator assignment controls, navigation in both frontend themes, PKCE/state-bound single-use sign-in, private server exchange and permission revalidation, synchronized parent logout, immutable identity provisioning, and administrator-only direct Autocall sign-in.

## Validation

| Repository     | Checks                                                                                                          | Result                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Autocall       | Pinned pnpm `typecheck`, full `test`, `build`, workspace ESLint, changed-file Prettier, `git diff --check`      | Passed; 169 tests passed, one existing DB smoke test skipped |
| Backend        | Auth/Autocall/RBAC/DB-pool pytest suites, new-module compileall                                                 | Passed; 72 tests                                             |
| Light frontend | Next production build, TypeScript through build, full ESLint with zero warnings, node access tests              | Passed; two targeted tests                                   |
| Heavy frontend | Next production build, TypeScript through build, full ESLint with zero warnings, access/navigation Vitest tests | Passed; five targeted tests                                  |

The full Autocall `pnpm lint` command also runs repository-wide Prettier, which reports existing formatting issues outside this integration. Workspace ESLint and formatting for all changed TypeScript, TSX, YAML and Markdown files pass. Unrelated files were left unchanged.

Initial environment issues were resolved: the fallback global pnpm was replaced with the repository-pinned pnpm executable; stale heavy `.next/dev/types` output referencing an absent route was removed from its verified generated directory; the Autocall build was rerun with permitted network access for its existing Google font. No dependency upgrades were made.

## Commands

Autocall (using its pinned pnpm 10.34.5):

```powershell
node node_modules/pnpm/bin/pnpm.cjs run typecheck
node node_modules/pnpm/bin/pnpm.cjs run test
node node_modules/pnpm/bin/pnpm.cjs run build
node node_modules/pnpm/bin/pnpm.cjs run lint
# Changed-file ESLint / Prettier were also run separately.
git diff --check
```

Backend:

```powershell
python -m pytest tests/test_autocall_access.py tests/test_auth_rbac.py tests/test_auth_middleware_db_pool.py -q -p no:cacheprovider
python -m compileall -q app/api/auth/autocall_routes.py app/application/services/autocall_access.py app/infrastructure/db/models/auth_user_department_assignment_model.py app/infrastructure/db/repositories/auth_user_department_assignment_repo.py
```

Frontends:

```powershell
# Both repositories
node node_modules/next/dist/bin/next build
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings=0
# Light
node --experimental-strip-types --test tests/autocall-access.test.mjs
# Heavy
node node_modules/vitest/vitest.mjs run lib/autocall-access.test.ts lib/authenticatedRoutes.test.ts
```

## Migrations created (not applied)

- Backend: `migrations/20260907_add_autocall_access.sql` creates the compatible secondary-assignment table and indexes if absent.
- Autocall: `prisma/migrations/20260907000000_supernizo_identity/migration.sql` adds the nullable unique Supernizo UUID to users.

## Deployment work remaining

- Supply the canonical URLs and dedicated shared secret listed in the integration guide; apply both migrations and deploy in the documented order.
- Run the hosted, cross-application browser checks with real test accounts. Unit/service tests use controlled dependencies and do not prove the live proxy, TLS, Redis failover, or production database configuration.
- Assign agent site memberships after first SSO provisioning. Existing local users are not linked by email.
- Confirm existing SSE and LiveKit session lifetimes: this access-only change rejects new unauthorized requests but does not terminate active media or rewrite realtime delivery.
- Reconcile the shared assignment helper when merging `feat/imp/dep-delegate-sales`, preserving both feature assignments as documented.

## Files changed

### Supernizo-Autocall

- `.env.example`
- `.env.production.example`
- `apps/platform/src/app/components/login-form.tsx`
- `apps/platform/src/app/components/supernizo-sign-in.tsx`
- `apps/platform/src/app/dashboard/layout.tsx`
- `apps/platform/src/app/sso/callback/page.tsx`
- `apps/platform/src/app/sso/start/route.ts`
- `apps/platform/src/server/auth/access.test.ts`
- `apps/platform/src/server/auth/access.ts`
- `apps/platform/src/server/auth/auth-options.ts`
- `apps/platform/src/server/auth/local-admin-login.ts`
- `apps/platform/src/server/auth/supernizo-sso.test.ts`
- `apps/platform/src/server/auth/supernizo-sso.ts`
- `apps/platform/src/types/next-auth.d.ts`
- `docker-compose.production.yml`
- `docs/integration-validation.md`
- `docs/supernizo-integration.md`
- `prisma/migrations/20260907000000_supernizo_identity/migration.sql`
- `prisma/schema.prisma`

### lead-generation-tool

- `.env.example`
- `app/api/auth/autocall_routes.py`
- `app/api/auth/routes.py`
- `app/application/services/auth_context.py`
- `app/application/services/autocall_access.py`
- `app/infrastructure/db/models/__init__.py`
- `app/infrastructure/db/models/auth_user_department_assignment_model.py`
- `app/infrastructure/db/repositories/auth_user_department_assignment_repo.py`
- `app/infrastructure/db/repositories/auth_user_repo.py`
- `app/main.py`
- `docs/autocall-integration.md`
- `migrations/20260907_add_autocall_access.sql`
- `tests/test_auth_rbac.py`
- `tests/test_autocall_access.py`

### lead-gen-dashboard

- `.env.example`
- `app/admin/users/page.tsx`
- `app/autocall/page.tsx`
- `components/autocall/AutocallAccessToggle.tsx`
- `components/autocall/AutocallLaunch.tsx`
- `components/layout/AdminPanelShell.tsx`
- `components/layout/AppShell.tsx`
- `components/layout/Sidebar.tsx`
- `docs/autocall-integration.md`
- `lib/auth.ts`
- `lib/autocall-access.ts`
- `tests/autocall-access.test.mjs`

### supernizo-heavy

- `.env.example`
- `app/autocall/page.tsx`
- `app/business/page.tsx`
- `components/autocall/AutocallLaunch.tsx`
- `components/ceo/CeoShell.tsx`
- `components/layout/AppShell.tsx`
- `components/layout/Sidebar.tsx`
- `docs/autocall-integration.md`
- `lib/auth.ts`
- `lib/autocall-access.test.ts`
- `lib/autocall-access.ts`
