# Supernizo directory bridge

## Ownership and behavior

Supernizo owns identity, global SSO role and permission to use Autocall. Autocall owns event/site memberships, calls, chat, visitors and analytics. The existing immutable `User.supernizoId` links the systems; the local `User.id` never changes. The Autocall assignment screen lists only eligible Supernizo agents and cannot create or edit user accounts, names or roles. Historical local records remain retained but cannot be converted into SSO accounts by matching email/name.

Supernizo changes create a minimal directory projection and an outbox row in the **same PostgreSQL transaction**, using triggers on `auth_users` and `auth_user_department_assignments`. This covers application updates, bulk updates, cascades and TRUNCATE. Updates to session token versions alone do not generate directory events. Unrelated assignments are preserved. The directory revision is independent of `token_version`.

Eligible users are imported before first login. Revocation, disable and deletion retain identity/history and site memberships, but users become unavailable for assignment. Re-grant restores the same identity and memberships; current SSO token-version rules still require fresh authentication. The ordinary SSO introspection check remains authoritative for protected actions even during synchronization lag. Established SSE streams/media retain their existing lifecycle.

## Wire protocol

Receiver: `POST /autocall-db/api/internal/integrations/supernizo/users/sync`.

```json
{
  "eventId": "a057c46a-5d34-4087-b423-a8c91487242c",
  "schemaVersion": 1,
  "subject": "393f2151-91d9-44c1-bdbe-af370203402c",
  "directoryRevision": "12",
  "changedAt": "2026-09-08T10:00:00.000Z",
  "user": {
    "displayName": "Priya",
    "role": "AGENT",
    "eligibility": "ELIGIBLE"
  }
}
```

Revisions are positive signed-64-bit integers encoded as decimal strings to avoid JavaScript precision loss. Eligibility is `ELIGIBLE`, `REVOKED`, `DISABLED` or `DELETED`. No credentials, private profile fields or site memberships are transmitted.

Headers:

- `Content-Type: application/json`
- `X-Supernizo-Timestamp`: Unix seconds
- `X-Supernizo-Signature`: lowercase hex HMAC-SHA256

The signed bytes are `timestamp + "\n" + method + "\n" + URL pathname + "\n" + exact UTF-8 body`. Maximum clock skew is 300 seconds. The receiver caps the streamed body at 16 KiB. The event ID and payload digest detect replay/reuse. Timestamps are freshly signed on every delivery attempt; old pending events can therefore still be delivered.

Supernizo also provides signed POST endpoints `/api/auth/autocall/directory/user` and `/api/auth/autocall/directory/page`. User requests contain `{ "subject": "uuid" }`; page requests contain `{ "cursor": null, "limit": 100 }` (maximum 250). Only these exact paths bypass bearer middleware; both require the dedicated HMAC credential. User lookups explicitly track previously known Autocall identities, including users revoked/deleted before the first migration.

## Concurrency, recovery and reconciliation

Source triggers serialize projection updates per identity. Autocall serializes event IDs and user IDs with transaction-scoped PostgreSQL advisory locks; SSO and assignment writes share the user lock. Receipt, profile, revision and audit writes commit together. A reused event ID with different data or an equal revision with different source state returns 409. Older revisions are acknowledged without restoring stale access. Equal-revision reconciliation repairs local name/role drift. Site memberships are never written by the synchronization service.

Celery Beat wakes delivery every five seconds and reconciliation every minute. Delivery claims up to 25 records with `FOR UPDATE SKIP LOCKED` and five-minute leases. HTTP timeout is five seconds per record. Failure uses exponential backoff with jitter, capped at roughly one hour. Invalid payload/conflict responses or 20 unsuccessful attempts mark a record `FAILED`; the operator can replay it. Network requests never run inside the source user transaction. Worker restarts, broker loss and overlapping tasks cannot lose committed outbox records.

Reconciliation processes 250 directory records per task with a durable UUID cursor. A completed pass schedules the next pass after 15 minutes. Each row carries its own revision and deletion tombstones are retained, so concurrent live changes cannot be overwritten by older scans. This is a convergent keyset scan, not a point-in-time snapshot: records inserted behind the cursor are delivered by the outbox and encountered on the next full pass. Never infer deletion from absence or an incomplete scan.

Delivered source events and destination inbox receipts are retained for 30 days, with bounded cleanup batches. Pending/failed records and per-user revisions/tombstones are retained. Treat a lost source projection/revision database as a coordinated recovery event; never reset revisions on a live destination.

Delivery latency depends on the existing default Celery worker queue, network and database load. Five seconds is a dispatch interval, not a latency SLA. Monitor queue age; provision worker capacity or a dedicated queue if measured demand requires it.

## Rollout

1. Back up both databases. Keep both directory enable flags false while deploying schema and code.
2. Deploy Supernizo code and run its normal `python -m tools.run_schema_migration` / Compose `schema_migrate` job. With local Compose builds, run `docker compose --profile maintenance run --build --rm schema_migrate` so the image includes the current migration files. A plain `run` can reuse an older image and fail with `ModuleNotFoundError`. It now applies `migrations/20260908_autocall_directory.sql` once, guarded by a migration lock and ledger. Existing eligible users are captured atomically with trigger installation. Applying the SQL directly is also idempotent.
3. Apply Autocall `prisma/migrations/20260908000000_supernizo_directory/migration.sql` using `pnpm prisma:deploy`, then deploy Autocall. Never run schema reset against application data.
4. Set a dedicated random secret of at least 32 characters on both sides: Supernizo `AUTOCALL_DIRECTORY_SYNC_SECRET`, Autocall `SUPERNIZO_DIRECTORY_SYNC_SECRET`. Do not reuse the SSO secret. Keep it out of browser variables and logs.
5. Enable receiver `SUPERNIZO_DIRECTORY_SYNC_ENABLED=true`, then source `AUTOCALL_DIRECTORY_SYNC_ENABLED=true`. Restart/redeploy Autocall and the Supernizo API, default worker and Beat services so all load the same settings. Source delivery uses the existing `AUTOCALL_PUBLIC_URL`; Autocall lookup uses `SUPERNIZO_BACKEND_URL`. Production requires canonical HTTPS URLs. Preserve the user's local port choices (Heavy 3000, Autocall 3001). For a Supernizo worker running in local Docker, set `AUTOCALL_PUBLIC_URL=http://host.docker.internal:3001/autocall-db` and `AUTOCALL_ALLOW_LOCAL_HTTP=true`; that address is accepted only outside production.
6. Run `pnpm directory:reconcile` from Autocall to refresh every existing SSO-linked identity, including pre-bridge revocations. This command requires the runtime environment/secrets; for local HTTP loopback also set `NODE_ENV=development`. It preserves memberships and is safe to rerun after interruption.
7. Verify eligible Supernizo agents appear in the assignment selector, then assign an event. Verify revoked users cannot receive assignments, the assignment endpoint rejects name/role payloads, and unrelated event/call/chat records are unchanged.

For local Compose deployment, rebuild/recreate the application services as well: `docker compose up -d --build api worker beat`. Rebuilding the maintenance image alone does not update the running API or workers. Use the deployment pipeline's image rollout instead when deploying prebuilt production images.

Local development uses Heavy at `http://localhost:3000` and Autocall at `http://localhost:3001/autocall-db`. A browser on the host uses `localhost`; a Supernizo Docker worker uses `host.docker.internal` to reach the same Autocall process. Autocall's `pnpm dev` command explicitly selects port 3001. If Next.js reports another dev server already running for the same directory, use that server or stop it with Ctrl+C in its original terminal before restarting; launching another instance will fail.

The assignment API accepts only an event-ID list for a Supernizo-managed agent. User creation and changes to names or roles are handled in Supernizo. An assignment save fetches fresh source eligibility and checks the latest local revision under lock. A revocation concurrent with the final network/database boundary may race the metadata save; it still cannot authorize protected use because every such action introspects Supernizo. This bridge does not claim a distributed transaction across both systems.

Restrict signed integration endpoints to the peer service's egress at the reverse proxy/firewall where possible, retain HMAC authentication, apply request/body/time limits, and disable proxy caching. Do not rewrite the signed API pathname between sender and receiver. Rate-limit malformed/unauthenticated traffic at ingress without dropping legitimate retries.

## Operations

From Supernizo (or its API container):

```sh
python scripts/autocall_directory.py status
python scripts/autocall_directory.py reconcile
python scripts/autocall_directory.py replay --event-id EVENT_UUID
```

Monitor pending count/oldest event, any FAILED rows, and reconciliation `last_completed_at`. Alert on any permanent failure, pending age over an agreed threshold (start at 60 seconds), or a reconciliation pass overdue for the measured directory size. Logs contain event IDs and bounded failure codes, not credentials/payloads. Autocall displays each user's last sync time and eligibility; the audit log records applied source revisions and local site-assignment changes.

For a wrong credential or target URL, correct configuration, restart affected processes, and replay failed IDs or schedule a complete reconciliation. For 409 conflicts, investigate event/revision reuse before replaying; never manually increment destination revisions. Secret rotation is coordinated on both sides; in-flight requests retry using the current key.

Rollback: pause source delivery/receiver synchronization, retain tables/outbox/tombstones, and keep current SSO authorization. Do not roll back to pre-SSO code or re-enable local user creation. Directory-backed event assignments remain blocked until the source is available. Re-enable and reconcile to recover; no identity/site data deletion is required.

## Verification

Use a disposable database named `bridge_test`. The tests explicitly reject other database names for destructive fixture cleanup.

- Autocall: set `BRIDGE_TEST_DATABASE_URL`, apply its Prisma migrations to that database, then run `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`.
- Supernizo: set `BRIDGE_TEST_DATABASE_URL` and run `pytest tests/test_autocall_directory.py tests/test_autocall_directory_postgres_integration.py tests/test_autocall_access.py`. Auth/RBAC/profile/bootstrap regressions are also required.
- CI provisions the isolated database and runs these PostgreSQL tests in both repositories. Full receiver/worker HTTP and browser verification should be repeated in staging with the deployed proxy paths before enabling production delivery.
