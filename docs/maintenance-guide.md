# Autocall maintenance guide

Use this guide **after the first successful deployment**. It explains how to look after the existing application, not how to install it again.

**Do not run every section from top to bottom.** Complete section 1 whenever you connect, then choose the task you need. Stop at any unexpected error; do not continue to the next command blindly.

For a new server, use the [first-time deployment guide](hetzner-deployment.md). You do not need new SSH keys, a new database, or a new repository for normal maintenance.

## Quick reference

| Item                            | This project's setting                               |
| ------------------------------- | ---------------------------------------------------- |
| Application                     | <https://api.infrastructuresg.com/autocall-db>       |
| Login                           | <https://api.infrastructuresg.com/autocall-db/login> |
| Production branch               | `hetzner-prod`                                       |
| Deployment workflow             | `Test and deploy to Hetzner`                         |
| Server account                  | `deploy`                                             |
| Server directory                | `/home/deploy/app/autocall`                          |
| Application container service   | `app`                                                |
| Database container service      | `postgres`                                           |
| Migration/admin tool service    | `migrate` (runs when requested, then exits)          |
| Private application port        | `127.0.0.1:3200`                                     |
| PostgreSQL data volume          | `supernizo-autocall-postgres-data`                   |
| Production secrets              | `/home/deploy/app/autocall/.env.production`          |
| Last successful release records | `/home/deploy/app/autocall/.deployment/`             |
| Database backup directory       | `/home/deploy/app/autocall/backups/postgres/`        |

Nginx sends `/autocall-db/...` to Autocall. Other routes still belong to the existing leadgen service. PostgreSQL is private; `/autocall-db` is an application URL, not a database connection URL. Redis/realtime still uses Upstash, and calls still use LiveKit.

Words used below:

- **Container:** a running service, such as the app or PostgreSQL.
- **Image:** the packaged version used to create a container. GHCR is GitHub's storage for those images.
- **Commit SHA:** the unique identifier for a version of the source code. An image **digest** identifies the exact packaged image; they are different identifiers.
- **Migration:** a developer-reviewed update to the database's structure. It is not a backup or an administrator account.
- **Rollback:** return to an earlier application version. **Restore:** recover database contents from a backup.
- **Readiness check:** a small request that checks whether the app can answer and query its database.

### Choose your task

- [1. Connect and prepare your terminal](#1-connect-and-prepare-your-terminal)
- [2. Check whether the application is healthy](#2-check-whether-the-application-is-healthy)
- [3. Deploy a code change through GitHub and GHCR](#3-deploy-a-code-change-through-github-and-ghcr)
- [4. Read logs and collect an error](#4-read-logs-and-collect-an-error)
- [5. Restart the application safely](#5-restart-the-application-safely)
- [6. Change Upstash, LiveKit, or application settings](#6-change-upstash-livekit-or-application-settings)
- [7. Create or reset a production administrator](#7-create-or-reset-a-production-administrator)
- [8. Create and check database backups](#8-create-and-check-database-backups)
- [9. Keep a backup away from this server](#9-keep-a-backup-away-from-this-server)
- [10. Practise restoring without replacing production](#10-practise-restoring-without-replacing-production)
- [11. Recover production data during an incident](#11-recover-production-data-during-an-incident)
- [12. Roll back a faulty application release](#12-roll-back-a-faulty-application-release)
- [13. Renew credentials without mixing up the keys](#13-renew-credentials-without-mixing-up-the-keys)
- [14. Check Nginx and HTTPS certificates](#14-check-nginx-and-https-certificates)
- [15. Troubleshoot common failures](#15-troubleshoot-common-failures)
- [16. Maintenance schedule and handover checklist](#16-maintenance-schedule-and-handover-checklist)

## 1. Connect and prepare your terminal

### 1.1 Connect from your computer

Open **Windows PowerShell**. Replace `REPLACE_WITH_HETZNER_HOST` with the server IP/hostname already used for this deployment:

```powershell
ssh deploy@REPLACE_WITH_HETZNER_HOST
```

Use your normal administrator SSH access. Do not use the restricted GitHub Actions key for interactive maintenance. If a verified host unexpectedly changes its SSH fingerprint, stop and confirm the change with the server owner; do not bypass the warning.

After login, your prompt should look similar to `deploy@ubuntu-16gb-nbg1-2:~$`.

**All `bash` blocks below run on Hetzner, not in Windows PowerShell.** Copy only the command block, not the prompt or the expected output. For commands split across lines, copy the entire block, including each `\`.

### 1.2 Check your account and files

```bash
whoami
cd /home/deploy/app/autocall
pwd
test -s .env.production && echo 'Production settings file exists'
test -s .deployment/current-images.env && echo 'Deployed image records exist'
```

Expected: account `deploy`, the exact directory above, and both success messages. If a file is missing, stop. Do not make up image digests or rerun the first-time secret generator.

### 1.3 Create a short command for this terminal session

Paste this whole block once after each SSH login:

```bash
unset APP_IMAGE MIGRATOR_IMAGE

ac() {
  docker compose \
    --project-directory /home/deploy/app/autocall \
    --env-file /home/deploy/app/autocall/.env.production \
    --env-file /home/deploy/app/autocall/.deployment/current-images.env \
    -f /home/deploy/app/autocall/docker-compose.production.yml \
    "$@"
}

ac config --quiet
```

`ac` is just a shortcut for this project's exact Docker Compose command. It does not install or start anything. `unset` removes old image overrides from this shell, including any example digests copied earlier.

Expected: `ac config --quiet` returns without an error. Do not omit `--quiet`; the full configuration can reveal passwords. If `ac: command not found` appears later, repeat this subsection in that terminal.

## 2. Check whether the application is healthy

### 2.1 Check the containers

```bash
ac ps
```

Expected: `app` and `postgres` are running and become `healthy`. The app port should be `127.0.0.1:3200->3000/tcp`. PostgreSQL must not show a mapping such as `0.0.0.0:5432->5432/tcp`; a plain `5432/tcp` entry is not a published host port.

It is normal not to see a running `migrate` container.

### 2.2 Check the private and public URLs

```bash
curl --fail --show-error --max-time 15 \
  http://127.0.0.1:3200/autocall-db/api/health/ready

curl --fail --show-error --max-time 15 \
  https://api.infrastructuresg.com/autocall-db/api/health/ready
```

Expected from both: `{"database":true,"ready":true}`. The output may appear on the same line as the next terminal prompt; that is harmless.

- Private fails: investigate `app` and `postgres` logs.
- Private succeeds but public fails: investigate Nginx, DNS, HTTPS, and the shared host.
- Both succeed: the app can answer requests and query PostgreSQL. This does **not** prove Redis, login, all SQL queries, or LiveKit calls work.

### 2.3 Check the actual user flow

1. Open the login URL in your browser and sign in.
2. Open the dashboard and check the site list.
3. Visit an authorized test website containing the tracker; confirm it appears online.
4. Send a test chat message in both directions.
5. Ask a consenting test visitor to accept one test call; check audio/video permission and end the call.
6. Confirm the existing leadgen application still works.

Use an approved test site/visitor; do not call a real visitor just to test maintenance.

## 3. Deploy a code change through GitHub and GHCR

The normal path is: **reviewed pull request → `hetzner-prod` → GitHub Actions → GHCR images → Hetzner**. Do not build images or edit application source on the server.

### 3.1 Before merging

1. Ask the developer which feature branch contains the change.
2. Check that another release or maintenance operation is not already running.
3. Read the change description. If it includes a database migration, have the developer confirm compatibility with the previous app version.
4. Create a fresh backup using section 8. The deployment script does **not** create a pre-deployment backup automatically.
5. Tell active users if the release could interrupt their calls or dashboard connection.

### 3.2 Merge the reviewed change

In the [GitHub repository](https://github.com/Cogent-Solutions-Developments/Supernizo-Autocall):

1. Open **Pull requests → New pull request**.
2. Set **base** to `hetzner-prod`.
3. Set **compare** to the developer's feature branch, for example `feat/prod-config`.
4. Create the pull request, or open the existing one if already created.
5. Wait for the **Quality checks** job to pass. A pull-request run checks code but does not publish/deploy it.
6. Have the pull request reviewed and merge it. If there are conflicts or failed checks, return it to the developer; do not bypass them.

### 3.3 Wait for the deployment, not just the build

Open [Actions](https://github.com/Cogent-Solutions-Developments/Supernizo-Autocall/actions), then the new **Test and deploy to Hetzner** run for the `hetzner-prod` push.

Wait for all three jobs:

1. **Quality checks** — checks the code, migrations, tests, and build.
2. **Publish immutable GHCR images** — publishes app and migrator images.
3. **Deploy GHCR images and PostgreSQL stack** — installs those exact images on Hetzner.

The website is not updated just because publishing succeeded. A red deployment job must be investigated. This setup uses repository-level Actions secrets, not GitHub Environments or environment approvals.

### 3.4 Confirm the running version

On Hetzner, with `ac` defined:

```bash
cat /home/deploy/app/autocall/.deployment/current-commit
cat /home/deploy/app/autocall/.deployment/current-images.env

AUTOCALL_CONTAINER_ID="$(ac ps -q app)"
if [ -n "$AUTOCALL_CONTAINER_ID" ]; then
  docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$AUTOCALL_CONTAINER_ID"
fi
unset AUTOCALL_CONTAINER_ID
```

The commit record and running container revision should match the full commit SHA of the successful GitHub deployment. The image records should contain real `@sha256:` references. These particular fields are not secrets.

`git log` alone is not proof of the running version: the script can check out new files and fail before replacing the app. Release records update only after a successful readiness check.

Finish with section 2 and fresh logs from section 4.

### 3.5 Retry a failed release

1. Open the failed Actions run and expand the first failing step.
2. Fix the stated problem using section 15; do not repeatedly retry without reading the error.
3. If there have been no newer production changes, rerun that release from GitHub.
4. If `hetzner-prod` has moved forward, run the workflow for the current `hetzner-prod` branch instead. An old rerun can deploy an older commit.
5. When **Run workflow** is available, choose branch **`hetzner-prod`**, not `main` or the feature branch. GitHub requires the manually triggered workflow to exist on the default branch for manual dispatch to be available; ask the repository maintainer if the button is absent. See [GitHub's manual workflow instructions](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## 4. Read logs and collect an error

### 4.1 Recent application errors

```bash
ac logs --timestamps --since=10m --tail=100 app
```

To watch new output while you reproduce the problem:

```bash
ac logs --timestamps --since=1m --tail=30 --follow app
```

Press **Ctrl+C** to stop watching logs. This does not stop the app. A normal container startup banner is not an error. Logs without a time filter can show old failures that have already been fixed.

### 4.2 Database errors

```bash
ac logs --timestamps --since=10m --tail=100 postgres
```

### 4.3 Find a request ID

If a failed response includes `requestId`, use that exact value:

```bash
read -r -p 'Paste the request ID: ' AUTOCALL_REQUEST_ID
ac logs --since=30m app | grep -F -- "$AUTOCALL_REQUEST_ID"
unset AUTOCALL_REQUEST_ID
```

Send the developer the time/timezone, failing URL, HTTP status, request ID, relevant error line, and deployed commit. Review logs before sharing; redact personal data and secrets. Never send `.env.production`, a full `docker inspect`, cookies, authorization headers, private keys, or tokens.

## 5. Restart the application safely

### 5.1 Restart without changing code or settings

Save the relevant logs first. Warn active users, then run:

```bash
ac restart app
ac ps
```

Wait for health to return and repeat section 2. This restarts only Autocall's app; it does not reset PostgreSQL. Calls/realtime connections may be interrupted.

### 5.2 Start an existing stopped stack

Only use this when the existing database volume is known to be intact:

```bash
docker volume inspect supernizo-autocall-postgres-data --format '{{.Name}}'
```

If the volume is missing, stop and follow incident recovery. Do not accidentally initialize a new empty production database.

If it exists and these are the intended last-successful images:

```bash
ac up -d --no-build postgres app
ac ps
```

This does not deploy new source code or manually run migrations.

### 5.3 Know the difference

- **Code change:** use GitHub Actions, section 3.
- **Settings/credential change:** recreate `app`, section 6.
- **Temporary app problem with no changes:** restart `app`, this section.

`restart` does not load changed environment settings. See the [Docker restart documentation](https://docs.docker.com/reference/cli/docker/compose/restart/).

Never run `docker compose down -v`, `docker volume prune`, or `docker system prune --volumes` here. Do not restart Docker, reboot the server, or stop shared Nginx as a routine Autocall fix; those affect leadgen too.

## 6. Change Upstash, LiveKit, or application settings

Do this when a provider credential changes, not for a SQL syntax or missing URL-prefix error.

### 6.1 Back up the settings privately

Make sure no deployment is running. On Hetzner:

```bash
cd /home/deploy/app/autocall
umask 077
install -d -m 0700 backups/config
AUTOCALL_ENV_BACKUP="/home/deploy/app/autocall/backups/config/env-production-$(date -u +%Y%m%dT%H%M%SZ)"
cp --no-clobber .env.production "$AUTOCALL_ENV_BACKUP"
chmod 0600 "$AUTOCALL_ENV_BACKUP"
```

This private copy contains secrets. Keep it protected and out of Git; old copies also need a controlled retention policy. It is not part of the automatic PostgreSQL backup.

### 6.2 Edit only the required values

```bash
nano /home/deploy/app/autocall/.env.production
```

1. For Upstash, copy the REST URL and REST token from the **same intended database** in the provider dashboard. Do not use a `redis://` connection URL or a read-only token for this app.
2. For LiveKit, update the `wss://` URL, API key, and secret together for the intended project.
3. Keep one `KEY=value` per line, without surrounding quotes or spaces; the repository validator expects this format.
4. Do not add `NEXT_PUBLIC_` to secrets.
5. Keep `APP_URL=https://api.infrastructuresg.com/autocall-db` and `APP_HOST_PORT=3200` unchanged.
6. Do not change `POSTGRES_PASSWORD`, `POSTGRES_DB`, or `POSTGRES_USER` as part of a provider-token update.
7. Save with **Ctrl+O**, press **Enter**, then exit with **Ctrl+X**.

### 6.3 Validate and recreate only the app

```bash
chmod 0600 /home/deploy/app/autocall/.env.production
bash /home/deploy/app/autocall/scripts/validate-production-env.sh \
  /home/deploy/app/autocall/.env.production
ac config --quiet
```

Expected: `Production environment validation passed.` and no Compose error. Stop if validation fails.

Warn active users, then run:

```bash
ac up -d --no-build --no-deps --force-recreate app
ac ps
```

This recreates `app` using its recorded GHCR image and new settings, without recreating PostgreSQL. See [Docker Compose up](https://docs.docker.com/reference/cli/docker/compose/up/). A new GHCR build is unnecessary for a runtime secret change.

### 6.4 Test Upstash without printing its credentials

```bash
ac exec -T app node <<'NODE'
async function main() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis settings are missing');
  const response = await fetch(url.replace(/\/+$/, '') + '/ping', {
    headers: { Authorization: 'Bearer ' + token },
    signal: AbortSignal.timeout(10000),
  });
  console.log('HTTP status:', response.status);
  if (!response.ok) {
    process.exitCode = 1;
    return;
  }
  const body = await response.json();
  console.log(body.result === 'PONG' ? 'Redis ping passed' : 'Unexpected Redis response');
  if (body.result !== 'PONG') process.exitCode = 1;
}
main().catch((error) => {
  console.error('Redis ping failed; cause:', error.cause?.code ?? error.name);
  process.exitCode = 1;
});
NODE
```

Expected: HTTP `200` and `Redis ping passed`. A ping tests connectivity, not the complete write/realtime flow; finish with tracking, chat, and call checks in section 2.

Do not revoke the previous provider credential until the replacement works, unless the old credential is compromised. If you moved to a different Redis database, check every other application that shared the old one before deleting anything.

### 6.5 Undo a mistaken provider/settings edit

Only do this if the old credentials are still valid and were not compromised. In the same terminal as step 6.1:

```bash
if [ -s "${AUTOCALL_ENV_BACKUP:-}" ]; then
  cp "$AUTOCALL_ENV_BACKUP" /home/deploy/app/autocall/.env.production &&
    chmod 0600 /home/deploy/app/autocall/.env.production &&
    bash /home/deploy/app/autocall/scripts/validate-production-env.sh \
      /home/deploy/app/autocall/.env.production &&
    ac config --quiet &&
    ac up -d --no-build --no-deps --force-recreate app
else
  printf 'No recorded settings backup in this terminal; nothing was changed.\n'
fi
```

Repeat the checks in section 2 and the provider test. If you opened a new terminal, ask the maintainer to identify the correct protected backup; do not guess which copy is the original. Never use this shortcut to undo a database password change.

## 7. Create or reset a production administrator

Only do this with the account owner's approval. The same command creates a new admin or replaces the password of an existing user with that email. It also grants the `ADMIN` role and updates the display name; do not use it for an ordinary agent's password reset.

1. Confirm PostgreSQL is healthy with `ac ps`.
2. Use the already-deployed migrator image; do not install pnpm on Hetzner or run the demo seed.
3. Paste the following block, then answer the prompts:

```bash
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -p 'Admin display name: ' ADMIN_DISPLAY_NAME
read -r -s -p 'New admin password (at least 16 characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_DISPLAY_NAME ADMIN_PASSWORD

ac run --rm \
  -e ADMIN_EMAIL -e ADMIN_DISPLAY_NAME -e ADMIN_PASSWORD \
  migrate ./node_modules/.bin/tsx prisma/provision-admin.ts

unset ADMIN_EMAIL ADMIN_DISPLAY_NAME ADMIN_PASSWORD
```

4. Password typing is deliberately invisible. Expected result: `Administrator provisioned: ...`.
5. Open the full `/autocall-db/login` URL and sign in with those credentials.
6. Store the credentials in the approved password manager, not a chat or source file.

Changing a password is not a guarantee that previously issued login sessions are revoked. If the account was compromised, involve the maintainer for session invalidation and review; changing `AUTH_SECRET` signs everyone out and is a separate maintenance decision.

## 8. Create and check database backups

### 8.1 Make a backup now

On Hetzner as `deploy`:

```bash
bash /home/deploy/app/autocall/scripts/backup-postgres.sh
ls -lht /home/deploy/app/autocall/backups/postgres
```

Expected: `PostgreSQL backup created: ...` plus a nonempty `.dump` file and matching `.dump.sha256` file. The filename contains the UTC backup time.

Check the checksums:

```bash
sha256sum --check /home/deploy/app/autocall/backups/postgres/*.sha256
```

Expected: `OK` for each file. A checksum detects changed/corrupted bytes; it does not prove the database can be restored. Complete section 10 periodically.

The script removes old dump/checksum files according to its default 14-day retention setting. Do not keep your only long-term recovery copy in this cleanup directory.

### 8.2 Check whether daily backups are installed

```bash
systemctl list-timers --all supernizo-autocall-backup.timer
sudo systemctl status supernizo-autocall-backup.timer --no-pager
sudo journalctl -u supernizo-autocall-backup.service --since='2 days ago' --no-pager
```

The repository schedule is daily at **02:30 UTC**, with up to 10 minutes of random delay: normally **08:00–08:10 Sri Lanka time**. A missed run can execute after the server comes back online.

Check a recent successful log and a fresh backup file, not only whether the timer is active. The one-shot backup service may show `inactive (dead)` after a successful run; that alone is not a failure.

### 8.3 Enable daily backups only if not already configured

```bash
sudo install -o root -g root -m 0644 \
  /home/deploy/app/autocall/ops/systemd/supernizo-autocall-backup.service \
  /etc/systemd/system/supernizo-autocall-backup.service
sudo install -o root -g root -m 0644 \
  /home/deploy/app/autocall/ops/systemd/supernizo-autocall-backup.timer \
  /etc/systemd/system/supernizo-autocall-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now supernizo-autocall-backup.timer
sudo systemctl start supernizo-autocall-backup.service
```

Repeat 8.2. Deployment does not install/update these root-owned systemd files automatically. If their repository definitions change, have the administrator review and reinstall them.

## 9. Keep a backup away from this server

A backup on the same disk is lost if the server/disk is lost. This repository does not automatically upload backups or provide point-in-time recovery. A daily-only backup can lose roughly a day of later writes, or more if backups failed.

1. On Hetzner, record the filename and hash of the specific successful backup:

   ```bash
   ls -lht /home/deploy/app/autocall/backups/postgres
   ```

2. Open a **second Windows PowerShell window**. Keep your server session open. Download that file to an approved, encrypted, access-controlled backup folder:

   ```powershell
   $autocallServer = Read-Host 'Hetzner SSH host or IP'
   $autocallBackupName = Read-Host 'Exact backup filename only, ending in .dump'
   $autocallBackupFolder = Read-Host 'Existing secure local backup folder'
   scp "deploy@${autocallServer}:/home/deploy/app/autocall/backups/postgres/${autocallBackupName}" "$autocallBackupFolder/"
   scp "deploy@${autocallServer}:/home/deploy/app/autocall/backups/postgres/${autocallBackupName}.sha256" "$autocallBackupFolder/"
   Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $autocallBackupFolder $autocallBackupName)
   Get-Content -LiteralPath (Join-Path $autocallBackupFolder "$autocallBackupName.sha256")
   ```

3. Compare the hexadecimal hashes; letter case does not matter. The checksum file records the original server path, so checking it automatically at a different path needs adjustment. Compare hashes rather than assuming the absolute path works on Windows.
4. Confirm the file is accessible to the responsible backup owner, and record its time and location.
5. Keep protected recovery copies of production settings and required server configuration separately. Database dumps do not include `.env.production`, SSH keys, Nginx configuration, all PostgreSQL roles, Upstash data, or LiveKit account settings.

SSH encrypts the transfer, not the stored `.dump` file. Dumps contain sensitive application data and password hashes. Never email them, commit them, publish them in GHCR, or copy them to an unprotected shared folder. Arrange an independent automated backup destination with the owner if manual copies cannot meet the recovery requirement.

## 10. Practise restoring without replacing production

This procedure creates a **separate test database** inside Autocall's PostgreSQL instance. It does not replace `autocall_prod`. It still uses server disk/CPU, so schedule it off-peak and check available space. This is a restore test, not a complete second-server disaster rehearsal.

Only restore trusted backups from this application. A database dump can contain executable database commands; see the [PostgreSQL restore documentation](https://www.postgresql.org/docs/17/app-pgrestore.html).

### 10.1 Select and validate one backup

```bash
df -h
ls -lht /home/deploy/app/autocall/backups/postgres
read -r -p 'Full path of the trusted .dump file to test: ' AUTOCALL_BACKUP
test -s "$AUTOCALL_BACKUP" && sha256sum --check "${AUTOCALL_BACKUP}.sha256"
```

Stop unless the intended file is nonempty, its corresponding checksum reports `OK`, and there is enough space for another uncompressed database. A compressed dump's file size is not the database's required disk size.

To see the current application's database size without reading its contents:

```bash
ac exec -T --user postgres postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;"'
```

Leave additional space for restore work and normal application growth. The restored backup's size can differ from the current database.

### 10.2 Create a separate empty database

```bash
AUTOCALL_RESTORE_DB="autocall_restore_check_$(date -u +%Y%m%d%H%M%S)"
printf 'Test database: %s\n' "$AUTOCALL_RESTORE_DB"

ac exec -T --user postgres postgres sh -c \
  'exec createdb --username "$POSTGRES_USER" --maintenance-db postgres --template template0 "$1"' \
  sh "$AUTOCALL_RESTORE_DB"
```

Keep this terminal open. Do not change the test name to `autocall_prod`.

### 10.3 Restore into the test database

```bash
ac exec -T --user postgres postgres sh -c \
  'exec pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$1"' \
  sh "$AUTOCALL_RESTORE_DB" < "$AUTOCALL_BACKUP"
```

Expected: command completes without error; silence can mean success. On failure, stop and save the error. Do not treat a partially attempted restore as a valid recovery copy.

### 10.4 Check restored tables

```bash
ac exec -T --user postgres postgres sh -c \
  'exec psql --username "$POSTGRES_USER" --dbname "$1" --set=ON_ERROR_STOP=1' \
  sh "$AUTOCALL_RESTORE_DB" <<'SQL'
SELECT count(*) AS users FROM "User";
SELECT count(*) AS sites FROM "Site";
SELECT count(*) AS calls FROM "Call";
SQL
```

Compare counts with what was expected when the backup was taken. Record the backup filename, test database name, date, and result. Counts are a basic check; the developer should also verify important relationships and schema compatibility before a real recovery.

### 10.5 Remove only the disposable test database

After recording a successful result, this optional cleanup permanently removes **only the test copy**, not the backup archive. Check the printed name and type it exactly when prompted:

```bash
printf 'Test copy to delete: %s\n' "$AUTOCALL_RESTORE_DB"
read -r -p 'Type that exact test database name to delete it: ' AUTOCALL_CONFIRM
if [[ "$AUTOCALL_RESTORE_DB" =~ ^autocall_restore_check_[0-9]{14}$ ]] \
  && [[ "$AUTOCALL_CONFIRM" == "$AUTOCALL_RESTORE_DB" ]]; then
  ac exec -T --user postgres postgres sh -c \
    'exec dropdb --username "$POSTGRES_USER" --maintenance-db postgres "$1"' \
    sh "$AUTOCALL_RESTORE_DB"
else
  printf 'Nothing was deleted.\n'
fi
unset AUTOCALL_CONFIRM AUTOCALL_RESTORE_DB AUTOCALL_BACKUP
```

Do not substitute a production database name or add a force flag. The archive remains available to recreate the test copy.

## 11. Recover production data during an incident

**Do not restore production just because a page returns 500.** The SQL-backtick, wrong-URL, and provider-credential errors in section 15 do not require a database restore.

Replacing live data is not routine maintenance: it can discard every change since the selected backup. The application owner must approve the recovery time and data loss, and a database maintainer must supervise the cutover.

Use this ordered recovery checklist:

1. Pause releases by coordinating with the repository maintainers. Make sure no Actions deployment is running or queued.
2. Record the incident time, running image/commit, database health, and relevant logs. Preserve the current volume; do not delete or reinitialize it.
3. Have the owner select the last known-good backup and explicitly approve the loss of later writes. Find its independent copy and checksum.
4. Restore it to a separate database using section 10, or to an isolated replacement PostgreSQL server if the original host/disk failed. Verify the restored data before touching the live database.
5. Have the developer match the restored schema to an approved app/migrator release. An older backup may lack newer migrations. Do not automatically run the demo seed or reset migration history.
6. Announce downtime. On a surviving host, stop only the Autocall app with `ac stop app`; stop the Autocall backup timer temporarily with `sudo systemctl stop supernizo-autocall-backup.timer` if configured. Confirm any in-progress backup has finished. Leave shared leadgen/Nginx alone.
7. If the current database is readable, make a fresh safety backup with section 8 before replacing anything. Keep it outside the normal retention cleanup location.
8. The database maintainer performs the approved replacement/rename or replacement-server cutover, preserving the old database/volume for investigation. The target, retained copy, role/password mapping, compatible release, and reverse procedure must be written down first. There is intentionally no blind overwrite command in this beginner guide.
9. On the original, intact Compose setup, start the approved app image after the maintainer confirms the schema and settings: `ac up -d --no-build --no-deps app`. On a replacement host, complete the first-time deployment/recovery setup first; do not start the app against an empty database.
10. Complete all checks in section 2, not just the readiness endpoint. Only then reopen the service to users.
11. Re-enable the backup timer if it was previously configured: `sudo systemctl start supernizo-autocall-backup.timer`. Create, copy off-server, and test a new backup.
12. Record exactly which data period was lost, what was recovered, and what action will prevent a repeat.

This repository currently provides database dumps and application-image rollback, not an automated full-server disaster-recovery system. If the server owner or a valid backup is unavailable, escalate instead of improvising destructive commands.

## 12. Roll back a faulty application release

Application rollback and database restore are different operations.

1. Save logs and note the last successful release from section 3.4.
2. Ask the developer whether the previous code can run against the current database schema.
3. In GitHub, have the developer create a revert pull request targeting `hetzner-prod`. The original merged PR may offer a **Revert** button; if it does not or it conflicts, let the developer prepare the revert locally.
4. Run the normal review/check/merge process from section 3.
5. Wait for the complete GHCR publish/deploy workflow, then verify section 2.

The deployment script attempts to restore the previous app image if a newly started app fails its readiness check and previous image records exist. It does not undo migrations, restore a database backup, or catch every functional error. A call endpoint can fail even when readiness succeeds. Inspect the actual running image after any failed deployment.

Do not manually replace digest records, force-push production, use random older image tags, or rerun an old workflow as a shortcut for an unreviewed rollback.

## 13. Renew credentials without mixing up the keys

### 13.1 Know which credential does which job

| Credential                    | Direction/purpose                                   | Where it belongs                                                                                  |
| ----------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Your administrator SSH key    | You → Hetzner terminal                              | Your trusted computer; public key authorized on Hetzner                                           |
| GitHub repository deploy key  | Hetzner → read source from GitHub                   | Private key on Hetzner; public key in GitHub **Deploy keys**                                      |
| Actions deployment SSH key    | GitHub Actions → restricted Hetzner deployment      | Private key in repository secret `HETZNER_SSH_PRIVATE_KEY`; restricted public-key line on Hetzner |
| Pinned SSH host key           | Verify that Actions reached the real Hetzner server | Repository secret `HETZNER_SSH_HOST_KEY`                                                          |
| GHCR pull token               | Hetzner → download private images                   | `deploy` user's Docker login; token needs `read:packages`                                         |
| `GITHUB_TOKEN`                | Actions → publish images                            | Automatically supplied to the workflow by GitHub                                                  |
| App/database/provider secrets | App → authentication, PostgreSQL, Upstash, LiveKit  | Protected server `.env.production`                                                                |

Do not create all these again for a normal deployment. Put only the four configured connection secrets (`HETZNER_HOST`, `HETZNER_USER`, `HETZNER_SSH_PRIVATE_KEY`, `HETZNER_SSH_HOST_KEY`) in repository Actions secrets. Do not create GitHub Environment secrets for this workflow.

### 13.2 Renew the GHCR pull token before expiry

1. Sign in to the authorized GitHub machine account.
2. Create a replacement classic PAT with `read:packages`, an expiry, and access to both private packages. Authorize organization SSO if required. Do not add write/delete permissions. See [GitHub Container registry authentication](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).
3. On Hetzner as `deploy`, replace the Docker login without putting the token in command history:

   ```bash
   read -r -p 'GitHub machine account username: ' GHCR_USERNAME
   read -r -s -p 'New read:packages token: ' GHCR_TOKEN
   printf '\n'
   printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
   unset GHCR_TOKEN GHCR_USERNAME
   chmod 0700 /home/deploy/.docker
   chmod 0600 /home/deploy/.docker/config.json
   ```

4. Expected: `Login Succeeded`. Then test access to both recorded images:

   ```bash
   ac pull app migrate
   ```

5. Pulling does not restart the running app. Once both pulls succeed, revoke the old token and record the replacement's expiry.

Never paste `/home/deploy/.docker/config.json` into support chat; it contains a reusable credential.

### 13.3 Rotate SSH keys only when required

1. Identify the direction in the table above and use the corresponding steps in the [deployment guide](hetzner-deployment.md).
2. Generate the replacement with a **new filename**, so you do not overwrite a working private key.
3. Add the new public key while keeping the current working key. For Actions access, preserve the `restrict,command=...github-deploy-command.sh` restriction.
4. Update the matching private key/secret and test the correct operation: repository fetch for the source key, approved deployment for the Actions key.
5. Only after a successful test, remove the old exact public-key line and revoke old access. Never replace the whole `authorized_keys` file or remove other administrators' keys.
6. For an SSH host-key change, verify the new fingerprint through the trusted Hetzner console before updating the pinned value. Never disable host-key verification.

### 13.4 Database password or signing-secret changes

- Upstash/LiveKit changes: section 6.
- `AUTH_SECRET`: changing it invalidates current login sessions; notify users and follow section 6 to recreate the app.
- `TRACKING_IP_HASH_SECRET`: changing it breaks correlation with previous IP hashes; have the privacy/abuse owner approve it.
- PostgreSQL credentials: schedule a controlled operation with the database maintainer. Editing `POSTGRES_PASSWORD` in `.env.production` alone does not change the password of an already initialized database. The maintainer must update the actual PostgreSQL role, update the protected settings consistently, recreate the appropriate containers, and verify app/migrator/backup access. Do not delete the volume to make the new password take effect.

If a secret was exposed in Git or logs, rotate/revoke it promptly. Removing a file or rewriting history does not make the old secret safe. Check other applications using the same credential before a planned rotation; coordinate immediately if it is compromised.

## 14. Check Nginx and HTTPS certificates

### 14.1 Check Nginx without changing it

```bash
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

Expected: configuration test succeeds and Nginx is active. Log locations can differ on a customized host; ask the shared-server owner if this file does not exist. Redact visitor data before sharing logs.

### 14.2 If a reviewed Autocall Nginx snippet changes

The repository deployment does not automatically replace root-owned Nginx configuration. Coordinate with the leadgen/server owner first.

1. Confirm the repository checkout contains the approved release, and preserve the current snippet:

   ```bash
   AUTOCALL_NGINX_BACKUP="/etc/nginx/snippets/supernizo-autocall.conf.before-$(date -u +%Y%m%dT%H%M%SZ)"
   sudo cp --no-clobber /etc/nginx/snippets/supernizo-autocall.conf "$AUTOCALL_NGINX_BACKUP"
   ```

2. Install the reviewed replacement:

   ```bash
   sudo install -o root -g root -m 0644 \
     /home/deploy/app/autocall/ops/nginx/autocall.location.conf \
     /etc/nginx/snippets/supernizo-autocall.conf
   sudo nginx -t
   ```

3. If validation fails, **do not reload**. Restore the saved snippet and test again:

   ```bash
   sudo cp "$AUTOCALL_NGINX_BACKUP" /etc/nginx/snippets/supernizo-autocall.conf
   sudo nginx -t
   ```

4. Only after a successful test, reload:

   ```bash
   sudo systemctl reload nginx
   ```

5. Verify both Autocall and leadgen. Keep the original `location /` and one include for the Autocall snippet. Do not add a trailing slash to the Autocall `proxy_pass` or expose PostgreSQL to solve a route problem.

### 14.3 Check certificate renewal

```bash
sudo certbot certificates
systemctl list-timers --all | grep -i certbot
```

Confirm the certificate covers `api.infrastructuresg.com` and is not close to expiry. Timer names vary by installation; an absent timer requires checking the existing cron/snap renewal setup with the server owner, not installing a second renewal system blindly.

With the shared-server owner's approval, test renewal for the exact certificate name listed by `certbot certificates`:

```bash
read -r -p 'Exact certificate name from certbot certificates: ' AUTOCALL_CERT_NAME
sudo certbot renew --cert-name "$AUTOCALL_CERT_NAME" --dry-run
unset AUTOCALL_CERT_NAME
```

Expected: renewal simulation succeeds. A dry run does not replace the live certificate, but can use the configured authenticator and hooks. Do not stop Nginx or repeatedly force-renew the certificate. See [Certbot's renewal guidance](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

## 15. Troubleshoot common failures

Always collect fresh logs and verify the **running image**, not just the repository branch, before changing anything.

| What you see                                                         | What to check first                                                    | Correct next action                                                                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `42601`, `P2010`, syntax error near a backtick                       | Old MySQL-style raw query in the running release                       | Deploy the reviewed PostgreSQL query fix through section 3. No database reset, seed, or password change is needed.                        |
| Browser request goes to `/api/...` instead of `/autocall-db/api/...` | Missing application prefix or old browser bundle                       | Deploy the prefix fix, confirm its running SHA, then reload the browser. Do not redirect all root `/api` traffic away from leadgen.       |
| `/autocall-db/...` returns `401`                                     | Logged-out/expired session or missing application permissions          | Sign in through the full login URL and check permissions. Correctly prefixed `401` does not automatically mean a routing bug.             |
| `fetch failed` in tracking/realtime                                  | Upstash URL, network/DNS/TLS, and fresh error context                  | Use section 6.4. A fetch failure alone does not prove the token is wrong.                                                                 |
| Upstash ping returns `401`/`403`                                     | URL/token pairing, token validity, and permissions                     | Update the intended provider credentials and recreate `app` using section 6.                                                              |
| Calls ring but media does not connect                                | LiveKit settings, browser permissions, provider connectivity           | Follow the [media testing guide](livekit-media-testing.md); check both participants' browser console/network.                             |
| Public URL returns `502` while private readiness works               | Nginx route/upstream and shared-host logs                              | Follow section 14.                                                                                                                        |
| Private readiness returns `503`                                      | PostgreSQL health, app database connection, disk space                 | Read both container logs. Do not rerun seeds or delete the volume.                                                                        |
| GHCR pull says `unauthorized` or `denied`                            | Machine account access, token expiry, package permissions              | Section 13.2; the app and migrator are separate private packages.                                                                         |
| Actions SSH says `Permission denied (publickey)`                     | Dedicated Actions private key and its restricted authorized public key | Check section 13.1/13.3. A GitHub repository Deploy key does not authorize Actions to SSH into Hetzner.                                   |
| SSH host verification fails                                          | Host/IP matches the pinned line; possible host-key change              | Verify through the server console before changing the pinned key.                                                                         |
| Deployment says tracked files have local changes                     | Someone edited source/config in the server checkout                    | Run `git status --short` and ask the maintainer to preserve/reconcile the changes. Do not use `git reset --hard`.                         |
| Deployment says another deployment is running                        | Current Actions run and deployment process                             | Wait for the active operation. Do not delete lock files or kill processes blindly.                                                        |
| Database migration job fails                                         | First migration error in Actions or migrator output                    | Stop and have the developer prepare a migration recovery plan. Do not run `migrate reset`, `db push`, or mark migrations applied blindly. |
| Edited `.env.production` but behavior is unchanged                   | App container was only restarted                                       | Revalidate and force-recreate only `app`, section 6.                                                                                      |
| Missing `.deployment/current-images.env`                             | No successful deployment record or lost state                          | Restore verified deployment records with the maintainer or rerun the approved release. Never enter example `aaaa...`/`bbbb...` digests.   |
| No recent backup                                                     | Timer status, backup service logs, free space                          | Section 8; a timer can be active even when its last job failed.                                                                           |

For resource pressure, collect these read-only checks:

```bash
df -h
df -i
free -h
docker system df
docker stats --no-stream
```

These describe the shared host, not only Autocall. Investigate sustained usage and growth before removing anything. Keep previous release images needed for recovery; ask the owner to approve exact cleanup targets instead of running broad Docker prune commands.

## 16. Maintenance schedule and handover checklist

### Every working day

1. Run the two readiness checks and check `ac ps`.
2. Confirm the last daily backup completed and has an independent copy according to the team's recovery requirement.
3. Check new app errors and unusual disk usage.

### Before and after every release

1. Before: approved PR, no overlapping maintenance, fresh backup, schema-compatibility confirmation, user notice if needed.
2. After: all three Actions jobs succeeded, running revision matches, section 2 user-flow checks pass, no new relevant errors.
3. Record the deployed commit, time/timezone, operator, test result, and backup filename. Never record secret values.

### Weekly

1. Check backup timer history and an off-server copy.
2. Review disk/inode usage, memory, and container health.
3. Check upcoming GHCR token expiry and changes to privileged access.

### Monthly and after material database changes

1. Perform the separate-database restore test in section 10 and record the result.
2. Review HTTPS renewal health and provider quotas/billing limits.
3. Review repository/SSH/package access and remove only confirmed obsolete access.
4. Plan security updates with the shared-server owner. OS/Docker restarts can interrupt leadgen. Application/library/PostgreSQL-image updates require reviewed changes and the normal GHCR workflow; never switch a PostgreSQL major image version against the existing volume without a tested upgrade plan.
5. Check that the designated recovery owner can access the protected backups/settings and knows where this guide is.

### When handing over a problem

Send the maintainer:

- What you attempted and what the user saw.
- Exact URL, timestamp/timezone, HTTP status, and request ID if present.
- Successful deployment SHA, actual running image revision, and the Actions run link.
- Relevant redacted logs and which checks passed/failed.
- Last verified backup time and location, without attaching the backup itself.
- Every maintenance action already performed.

**Never include passwords, tokens, private keys, cookies, full environment files, or database dumps in the handover message.**
