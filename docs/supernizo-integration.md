# Supernizo access integration

All four repositories use `feat/imp/supernizo-autocall-access`. The Autocall branch starts from `hetzner-prod`; the other three start from their local `main`. Nothing has been deployed to production and no production migration has been applied.

## User journey and authority

1. The user completes Supernizo's existing password/MFA flow.
2. Navigation shows Autocall to active employees with the `autocall` secondary assignment and to Supernizo `super_admin_user` accounts. Client accounts cannot receive access.
3. Autocall `/autocall-db/sso/start` stores a random state and PKCE verifier in a Secure, HttpOnly, SameSite=Lax cookie restricted to `/autocall-db`, then redirects to the configured light or heavy portal `/autocall` route.
4. The portal uses its existing bearer session to request a 60-second single-use code from `/api/auth/autocall/authorize`. The verifier and Supernizo bearer token are never forwarded through the browser URL. The code is bound to the S256 challenge.
5. Autocall checks the browser cookie and state, exchanges the code using a dedicated server secret, and creates its own encrypted session. Redis atomically consumes each code across backend workers.
6. Each protected Autocall request checks the original account, activity, token version, assignment and parent-session expiry through the private backend. Unavailable authorization fails closed. React request caching deduplicates checks during the same server render without caching permissions between requests.
7. Supernizo administrators receive Autocall `ADMIN`; other authorized staff receive `AGENT`. Existing event/site memberships still control agent visibility. Existing tracker, chat, calling, media and analytics behavior is unchanged.

Local Autocall password sign-in accepts only local administrators. SSO identities cannot use this route, even if a password is added. Old local agent sessions are rejected. A separate, scoped Autocall session cookie avoids collisions with other applications hosted on the same domain. Its introduction signs existing local administrators out once during rollout.

Signing out through the updated Supernizo navigation invalidates the account's token version, revoking future authenticated requests from its Supernizo and Autocall sessions across devices. If the logout request fails, the UI reports failure and retains the local session so the user can retry. Autocall's own sign-out ends its local session; the parent Supernizo login remains available. Assignment changes also rotate the account token version, requiring that user to sign in again and preventing revoke/re-grant from reviving old sessions.

Already established SSE streams and LiveKit calls retain their existing lifecycle; this access-only change does not force-disconnect active media or rewrite realtime delivery. New subscriptions and protected actions require fresh authorization. Verify the deployed stream timeout and existing LiveKit token lifetime against your revocation requirements.

## Roles and identity provisioning

The primary `auth_users.role` stays unchanged. Secondary access uses the exact `auth_user_department_assignments` table/column shape from `feat/imp/dep-delegate-sales`, including a unique `(user_id, department)` and `assigned_by_user_id`. This implementation adds the `autocall` value without deleting or replacing `delegate_sales` or any other assignment.

Human Supernizo super-administrators assign/revoke access in the light frontend's existing User & Role Management cards. CEO users and service API keys cannot assign Autocall access. The heavy frontend retains its existing supported login roles; it does not introduce a separate administrator-management workspace. Assigned heavy users, including CEO and business-workspace users, receive navigation in their existing dock.

On first handoff, Autocall provisions a User by the immutable Supernizo UUID in the new unique `User.supernizoId` column. No automatic email-based account linking occurs. The internal email is `<uuid>@supernizo.invalid`, and the display name comes from Supernizo. Existing local users are untouched. An Autocall administrator must assign the new agent to the appropriate sites using the existing access-management screen. Until then the agent has no event access. Supernizo administrators have the existing global administrator access.

When combining with `feat/imp/dep-delegate-sales`, retain its `AuthUserDepartmentAssignmentRepository.replace_for_user` and department pipeline authorization, plus this feature's Autocall routes/service. Resolve the shared repository/response-helper additions by keeping one implementation of `departmentAssignments`. Do not let the delegate department editor replace/delete `autocall` records when updating its own assignment: either preserve unedited departments or teach that editor the full assignment set. The SQL migration is idempotent if the other branch's table already exists.

## Configuration

| Repository     | Variable                           | Meaning                                                                                        |
| -------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| Backend        | `AUTOCALL_PUBLIC_URL`              | Exact canonical HTTPS URL ending in `/autocall-db`                                             |
| Backend        | `AUTOCALL_CLIENT_SECRET`           | Dedicated random secret of at least 32 characters; never reuse RUN_TOKEN or login signing keys |
| Backend        | `AUTOCALL_REDIS_URL`               | Optional shared Redis URL; defaults to existing `REDIS_URL`                                    |
| Both frontends | `AUTOCALL_PUBLIC_URL`              | Same canonical HTTPS Autocall URL; read server-side at runtime                                 |
| Autocall       | `SUPERNIZO_BACKEND_URL`            | HTTPS backend base URL before `/api`, reachable from the Autocall server                       |
| Autocall       | `SUPERNIZO_LIGHT_URL`              | Canonical light frontend base URL                                                              |
| Autocall       | `SUPERNIZO_HEAVY_URL`              | Canonical heavy frontend base URL                                                              |
| Autocall       | `SUPERNIZO_AUTOCALL_CLIENT_SECRET` | Same secret as backend `AUTOCALL_CLIENT_SECRET`                                                |

The production Compose environment now forwards the four Autocall SSO variables. Keep the existing `APP_URL`, `NEXTAUTH_URL` and `/autocall-db` reverse-proxy configuration. Use canonical hosts directly to avoid the heavy frontend's existing www redirect. No secret belongs in a `NEXT_PUBLIC_*` variable. HTTPS is required even for the backend exchange; use a VPC-resolved TLS hostname for private, low-latency traffic.

## Deployment and operational checks

1. Back up both databases. Apply backend `migrations/20260907_add_autocall_access.sql` using the existing SQL migration procedure. Do this before starting the new backend because login/user listing now loads secondary assignments.
2. Configure backend settings, deploy the backend, and verify the original login/MFA flow. Missing/wrong client secrets must return 401; no broad service token is accepted on the exchange/introspection endpoints.
3. Apply Autocall `prisma/migrations/20260907000000_supernizo_identity/migration.sql` with `pnpm prisma:deploy`. Set the four SSO variables and deploy Autocall.
4. Configure and deploy both frontends. Grant a test employee Autocall access, sign that employee in again, open Autocall once to provision the identity, and verify that all active events are available without assignment.
5. Verify both portals, a Supernizo administrator, a local Autocall administrator, an eligible agent with no memberships, an inactive account and a client account. Verify that eligible agents can access every active event while administrator APIs and inactive events remain forbidden. Verify expired/replayed codes, wrong state and logout/revocation in a second tab.
6. At the reverse proxy, redact query strings for `/autocall-db/sso/*` and `/autocall`, never log request bodies or `Authorization`/`X-Autocall-Secret` values on the auth endpoints, and set `Referrer-Policy: no-referrer`. Disable caching for these routes and `/api/auth/autocall/*`. Restrict exchange/introspection to Autocall's VPC egress addresses where possible, retaining the client-secret checks.
7. For availability across instances, use a shared durable Redis primary/managed failover service, PostgreSQL availability appropriate to the service SLA, identical secrets on all replicas, synchronized clocks, and at least two application replicas behind health checks. No sticky sessions are required. Single-use guarantees apply to atomic operations on the shared Redis primary; assess Redis persistence/failover guarantees for the deployment. Do not use an in-memory ticket store.

Redis ticket issuance is limited to ten per account per minute; local administrator password attempts use a shared Redis account bucket. Backend Redis connection/read timeouts are two seconds and Autocall exchange/introspection has a four-second timeout. Healthy routing takes a small number of redirects plus a VPC exchange. This code does not claim an availability or latency SLA without deployment measurements. Backend/Redis outages deny new access; local administrator login remains independent of the Supernizo backend but uses Autocall's existing Redis in production.

Rollback frontends first (they now call the backend logout endpoint), then Autocall and backend. Both schema changes are additive; leave their columns/table in place during rollback. Reverting to old Autocall code re-enables its old direct-agent login policy, so prefer fixing forward or disabling external access during rollback.

## References

The handoff uses [RFC 7636 S256 PKCE](https://www.rfc-editor.org/rfc/rfc7636) and the installed [NextAuth credentials provider](https://next-auth.js.org/configuration/providers/credentials). Next.js Route Handler/cookie behavior was checked against the locally installed Next.js documentation.

## Local development and refresh recovery

Use distinct local ports: light frontend `3000`, Autocall `3001`, heavy frontend `3002`, backend `8000`.

- Both frontends: `AUTOCALL_PUBLIC_URL=http://localhost:3001/autocall-db`.
- Backend: the same `AUTOCALL_PUBLIC_URL`, plus `AUTOCALL_ALLOW_LOCAL_HTTP=true` and a non-production `ENV`.
- Autocall: `APP_URL=http://localhost:3001/autocall-db`, `SUPERNIZO_BACKEND_URL=http://127.0.0.1:8000`, `SUPERNIZO_LIGHT_URL=http://localhost:3000`, and `SUPERNIZO_HEAVY_URL=http://localhost:3002`.
- Keep backend `AUTOCALL_CLIENT_SECRET` and Autocall `SUPERNIZO_AUTOCALL_CLIENT_SECRET` identical. Store them only in ignored local environment files.
- Run Next.js with `next dev`; do not set `NODE_ENV` in `.env.local`. Restart development servers after changing settings if they have not reloaded them. Set Autocall's dev port to `3001` and heavy's to `3002` when starting them.
- The backend Docker image copies source files. After local source/settings changes, run `docker compose up -d --no-deps --build api` from the backend repository. Editing its `.env` alone does not change an existing container's environment.

HTTP is allowed only for loopback hosts (`localhost`, `127.0.0.1`, IPv6 loopback) in Next.js development mode; the backend additionally requires the explicit local flag. Production continues to require HTTPS, including the private exchange. The local HTTP flow cookie stays HttpOnly, SameSite=Lax and scoped to `/autocall-db`; HTTPS uses Secure cookies.

Reload validation retains the stored Supernizo session on network failures, rate limits, forbidden resources and server errors. Only a 401 for the current login clears it; delayed failures from an earlier login are ignored. Concurrent profile lookups share an in-flight request, and stale responses cannot overwrite a newer login. Autocall denies protected requests when upstream authorization is unavailable but propagates a temporary service error instead of redirecting that session to sign-in. Expired/revoked sessions still require authentication.
