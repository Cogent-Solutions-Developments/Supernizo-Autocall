# Autocall launch and refresh fix — 2026-09-07

Branch in all four repositories: `feat/imp/supernizo-autocall-access`.

## Problems fixed

- Local HTTP URLs were rejected by HTTPS-only SSO configuration checks. Loopback HTTP now works only in Next.js development mode, with an additional explicit backend opt-in; production still requires HTTPS.
- Both frontend shells deleted the login after any startup profile failure. They now invalidate only a definitive 401 for the current session, preserving login through outages, rate limits and stale requests.
- Concurrent profile requests share an in-flight request, have an eight-second timeout, and cannot overwrite a newer login. Non-JSON errors retain their HTTP status.
- Autocall previously translated all upstream identity-check failures into an authentication failure. Temporary failures now return a service-unavailable error and deny protected access without redirecting the session to login.
- The running local API container lacked Autocall configuration. Its ignored environment file now has the correct callback and matching private secret, and the API container was rebuilt and restarted. Autocall uses the direct local backend connection. Frontend `.env.local` files no longer override `NODE_ENV`.

## Changed files

| Repository     | Files                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Autocall       | `.env.example`; `apps/platform/src/server/auth/access.ts`; `access.test.ts`; `supernizo-sso.ts`; `supernizo-sso.test.ts`; `apps/platform/src/server/errors/app-error.ts`; `docs/supernizo-integration.md`; this report                                                                           |
| Backend        | `.env.example`; `app/application/services/autocall_access.py`; `tests/test_autocall_access.py`; `docs/autocall-integration.md`                                                                                                                                                                   |
| Light frontend | `.env.example`; `app/autocall/page.tsx`; `components/autocall/AutocallLaunch.tsx`; `components/layout/AppShell.tsx`; `lib/auth.ts`; `lib/autocall-access.ts`; `lib/session-validation.ts`; `tests/autocall-access.test.mjs`; `tests/session-validation.test.mjs`; `docs/autocall-integration.md` |
| Heavy frontend | `.env.example`; `app/autocall/page.tsx`; `components/autocall/AutocallLaunch.tsx`; `components/layout/AppShell.tsx`; `lib/auth.ts`; `lib/autocall-access.ts`; `lib/autocall-access.test.ts`; `lib/session-validation.ts`; `lib/session-validation.test.ts`; `docs/autocall-integration.md`       |

Ignored local environment files were updated separately. No secrets are included in source control. Existing light-frontend administrator-management edits are excluded from these fixes. No calling, chat, tracker or media behavior was changed.

## Validation

| Check                                                                                                           | Result                                                                                           |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Autocall `vitest run`                                                                                           | 50 files, 173 tests passed                                                                       |
| Autocall targeted auth/error regression rerun                                                                   | 3 files, 16 tests passed                                                                         |
| Backend `python -m pytest tests/test_autocall_access.py -q`                                                     | 25 tests passed; existing dependency/cache warnings                                              |
| Light `node --experimental-strip-types --test tests/autocall-access.test.mjs tests/session-validation.test.mjs` | 6 tests passed                                                                                   |
| Heavy `vitest run lib/autocall-access.test.ts lib/session-validation.test.ts`                                   | 6 tests passed                                                                                   |
| Light/heavy `tsc --noEmit`                                                                                      | Passed                                                                                           |
| Autocall `pnpm build`                                                                                           | Passed, including Prisma generation, package builds and platform TypeScript checking             |
| Light/heavy `next build`                                                                                        | Both passed, including TypeScript checking                                                       |
| Autocall `pnpm lint`                                                                                            | Platform/shared/tracker ESLint passed; global Prettier check reports 79 existing unrelated files |
| Changed light/heavy source and test files: ESLint                                                               | Passed                                                                                           |
| Changed Autocall TypeScript and integration document: Prettier                                                  | Passed                                                                                           |
| Local API `docker compose up -d --no-deps --build api`                                                          | API rebuilt and started; other services left running                                             |

Browser verification used isolated headless Chrome contexts through installed Playwright:

1. Six consecutive portal page loads with simulated 429/500/503 profile failures retained the stored login.
2. A definitive 401 still cleared the invalid login and redirected to sign-in.
3. Live local portal → Autocall start → portal PKCE handoff succeeded; the flow cookie was HttpOnly, SameSite=Lax and restricted to `/autocall-db`.
4. A real existing local development administrator completed login, code issuance, private exchange and dashboard loading. The test routed portal API traffic directly to the local backend instead of the public tunnel and did not print credentials.
5. Six consecutive authenticated Autocall dashboard refreshes succeeded.
6. Read-only schema and integration checks confirmed the local Autocall identity column already exists and the service secrets match.

The local browser scripts are in ignored `.deployment/verify-refresh.mjs` and `.deployment/verify-live-sso.mjs`; they require the local services described in the integration guide. Unit regression tests are checked into the relevant repositories.

## Migrations and deployment

No new migrations were created or applied for this fix. The existing local Autocall migration was verified as present. The local API was restarted; no production server was changed. Production rollout still requires the previously documented HTTPS settings and integration deployment procedure. The heavy frontend's changes passed unit tests, lint, type checking and build; its live user handoff was not exercised in this run.
