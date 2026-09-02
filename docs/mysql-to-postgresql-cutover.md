# MySQL to PostgreSQL data cutover

The PostgreSQL baseline migration creates a clean schema; it does not copy records from the former third-party MySQL service. Follow this separate cutover only when existing MySQL data must be retained.

## Safety rules

- Keep MySQL and a verified restorable backup unchanged until PostgreSQL validation and the rollback window are complete.
- Rehearse export, transformation, import, and reconciliation using disposable databases first.
- Do not copy MySQL’s `_prisma_migrations` table. PostgreSQL owns its committed baseline history.
- Preserve application IDs and foreign keys. Explicitly transform JSON, enums, booleans, timestamp precision, nulls, and quoted Prisma identifiers.
- Never place credentials or data dumps in this repository, container images, or workflow logs.

## Rehearsal

1. Take a consistent MySQL backup and record row counts for every application table.
2. Start a disposable PostgreSQL 17 database and apply the committed baseline with `DATABASE_URL=... pnpm prisma:deploy`.
3. Export MySQL application tables in a format that preserves UTF-8, milliseconds, nulls, JSON, and string IDs.
4. Transform and import in foreign-key order without renaming Prisma’s quoted identifiers.
5. Compare row counts and run orphan, enum, JSON, unique-constraint, timestamp, and representative query checks.
6. Run `pnpm test:db` and authenticated dashboard, tracking, chat, and call smoke tests.
7. Record exact commands, durations, mappings, and corrected failures before touching production.

If the source contains substantial data, create a separate reviewed migration utility with automated reconciliation. A generic schema converter is not sufficient evidence of a correct data migration.

## Production cutover

1. Verify final MySQL and PostgreSQL backup/restore procedures.
2. Put the old application into maintenance or read-only mode so no new MySQL writes occur.
3. Capture final MySQL counts and a final consistent export.
4. Let the Hetzner deployment apply the PostgreSQL baseline to the private Compose database.
5. Import the transformed application data without `_prisma_migrations`.
6. Repeat all reconciliation checks; do not enable traffic if any unexplained difference remains.
7. Deploy the PostgreSQL-compatible application through the protected GitHub production environment.
8. Verify authenticated reads/writes, tracking, chat, calls, Redis, PostgreSQL, application logs, and backups.
9. Enable Nginx traffic only after the acceptance checks pass.

## Rollback

Before PostgreSQL accepts new writes, leave it isolated and return traffic to the unchanged MySQL application. After PostgreSQL accepts writes, rollback requires reconciling those writes into MySQL or accepting a controlled data-loss window. Decide and rehearse that policy before production cutover.
