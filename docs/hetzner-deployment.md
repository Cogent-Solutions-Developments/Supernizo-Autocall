# Hetzner production deployment

This runbook deploys the whole Supernizo Autocall repository and PostgreSQL on the existing Hetzner server. The checkout is `/home/deploy/app/autocall`, and the public application is `https://api.infrastructuresg.com/autocall-db`. The existing leadgen stack and its `location /` remain unchanged. The separate `Supernizo-Autocall-Database` repository is not used, deleted, or modified.

## 1. Resulting services

- `postgres`: private PostgreSQL 17.11 with the named `supernizo-autocall-postgres-data` volume and no published port.
- `migrate`: one-shot image that applies committed Prisma migrations before each app rollout.
- `app`: standalone Next.js server, published only as `127.0.0.1:3100` on the host.
- Existing host Nginx: keeps TLS and maps `/autocall-db/*` to the app.
- Upstash Redis/Realtime and LiveKit remain external application providers.

This reuses the current server, so no additional Hetzner VM or managed database is required. It is not literally cost-free: it consumes the existing server’s CPU, memory, disk, and backup capacity.

## 2. Prepare DNS, firewall, and operating system

Keep `api.infrastructuresg.com` pointed at the existing Hetzner server. In Hetzner Firewall and the host firewall, allow only:

- TCP 80 and 443 from the Internet.
- TCP 22 only from trusted administrator networks and GitHub Actions, according to the SSH policy you already use.
- No public rule for TCP 3000, 3100, 5432, or 6432.

The host needs Git, curl, `flock`, Docker Engine, and Docker Compose v2. Confirm them:

```sh
git --version
curl --version
flock --version
docker version
docker compose version
```

Use the existing unprivileged `deploy` account. Add it to the Docker group only if it is not already allowed to run Docker:

```sh
sudo usermod -aG docker deploy
```

Log out and back in after changing group membership. Docker group membership is effectively root-level host access, so the deployment SSH key must be dedicated and protected.

## 3. Give the server read-only GitHub access

If the repository is private, create a dedicated SSH key as `deploy` and add only its public key as a read-only deploy key on `Cogent-Solutions-Developments/Supernizo-Autocall`:

```sh
sudo -iu deploy
ssh-keygen -t ed25519 -f ~/.ssh/supernizo-autocall-github -C supernizo-autocall-hetzner
ssh-keyscan -t ed25519 github.com >> ~/.ssh/known_hosts
chmod 600 ~/.ssh/known_hosts
```

Add this host entry to `/home/deploy/.ssh/config`:

```sshconfig
Host github-supernizo-autocall
    HostName github.com
    User git
    IdentityFile ~/.ssh/supernizo-autocall-github
    IdentitiesOnly yes
```

Clone exactly into the production location:

```sh
mkdir -p /home/deploy/app
git clone git@github-supernizo-autocall:Cogent-Solutions-Developments/Supernizo-Autocall.git /home/deploy/app/autocall
cd /home/deploy/app/autocall
git remote -v
```

Never edit tracked files in this production checkout; the deployment script refuses a dirty tracked worktree.

## 4. Create production configuration

```sh
cd /home/deploy/app/autocall
cp .env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32
openssl rand -base64 48
openssl rand -base64 48
```

Use the first value as `POSTGRES_PASSWORD`, and the other independent values as `AUTH_SECRET` and `TRACKING_IP_HASH_SECRET`. Edit `.env.production` and add the production Upstash and LiveKit values. Keep:

```dotenv
APP_HOST_PORT=3100
APP_URL=https://api.infrastructuresg.com/autocall-db
```

Do not place `DATABASE_URL` in this file; Compose builds the internal URL from the protected PostgreSQL values. Validate the final file:

```sh
bash scripts/validate-production-env.sh .env.production
docker compose --env-file .env.production -f docker-compose.production.yml config --quiet
```

## 5. Configure Nginx

Open the existing `api.infrastructuresg.com` TLS server block shown in `/etc/nginx/sites-available/leadgen`. Copy both locations from `ops/nginx/autocall.location.conf` inside its first `server { ... }` block. Keep the existing leadgen `location /` exactly as it is.

The `proxy_pass` must have no trailing slash. This preserves `/autocall-db`, which is compiled as the Next.js `basePath`.

```sh
sudo nginx -t
sudo systemctl reload nginx
```

On the first setup, Nginx can be reloaded before the app starts; `/autocall-db` will return a temporary upstream error until the first deployment succeeds, while leadgen remains on `location /`.

## 6. Configure GitHub Actions secrets

In the application GitHub repository, create an environment named `production`, protect it with the required reviewers/branch policy, and add these environment secrets:

| Secret                    | Value                                                        |
| ------------------------- | ------------------------------------------------------------ |
| `HETZNER_HOST`            | Hetzner hostname or public IP                                |
| `HETZNER_USER`            | `deploy`                                                     |
| `HETZNER_SSH_PRIVATE_KEY` | Dedicated private key GitHub Actions uses to SSH to the host |
| `HETZNER_SSH_HOST_KEY`    | Exact `known_hosts` line for the Hetzner SSH host key        |

Generate the Actions-to-Hetzner key separately from the server-to-GitHub deploy key. Restrict its public key in `/home/deploy/.ssh/authorized_keys` so it can invoke only the reviewed deployment wrapper:

```text
restrict,command="/usr/bin/bash /home/deploy/app/autocall/scripts/github-deploy-command.sh" ssh-ed25519 REPLACE_WITH_ACTIONS_PUBLIC_KEY github-actions-autocall
```

Obtain and verify the host key out-of-band from a trusted administrator console before saving it; do not blindly trust an unverified `ssh-keyscan` result from CI. The forced command prevents this GitHub Actions key from opening an interactive shell or selecting an arbitrary host command. The server script independently verifies that the requested SHA belongs to `origin/main`.

No Vercel or GHCR secrets are needed. GitHub Actions does not receive application or database secrets.

## 7. First deployment

Merge the production configuration into `main` after review, then run `Test and deploy to Hetzner` from GitHub Actions. The workflow verifies the code against PostgreSQL, SSHes into Hetzner, and deploys the exact `main` commit. The host builds images locally; it does not pull an application image from GHCR.

For an authorized first manual deployment, use a full commit SHA that is already contained in `origin/main`:

```sh
cd /home/deploy/app/autocall
git fetch origin main
bash scripts/deploy-production.sh FULL_40_CHARACTER_MAIN_COMMIT_SHA
```

Verify both services:

```sh
docker compose --env-file .env.production -f docker-compose.production.yml ps
curl --fail http://127.0.0.1:3100/autocall-db/api/health/ready
curl --fail https://api.infrastructuresg.com/autocall-db/api/health/ready
```

## 8. Provision the first production administrator

The local demo seed is deliberately never run by deployment. After the first healthy deployment, enter credentials without placing the password in shell history:

```sh
cd /home/deploy/app/autocall
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (minimum 16 characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose --env-file .env.production -f docker-compose.production.yml \
  run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD migrate \
    ./node_modules/.bin/tsx prisma/provision-admin.ts
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Sign in at `https://api.infrastructuresg.com/autocall-db/login`, create the production site, and configure its exact allowed website origins.

## 9. Enable daily database backups

These zero-license-cost backups are stored on the same server. They protect against some logical mistakes but not server or disk loss; copy encrypted backups to a separate location for disaster recovery.

```sh
sudo cp ops/systemd/supernizo-autocall-backup.service /etc/systemd/system/
sudo cp ops/systemd/supernizo-autocall-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now supernizo-autocall-backup.timer
sudo systemctl start supernizo-autocall-backup.service
sudo systemctl status supernizo-autocall-backup.service
```

Backups default to 14-day retention under `/home/deploy/app/autocall/backups/postgres`. Check timer and backup output regularly:

```sh
systemctl list-timers supernizo-autocall-backup.timer
ls -lh /home/deploy/app/autocall/backups/postgres
sha256sum --check /home/deploy/app/autocall/backups/postgres/*.sha256
```

Test restore on a separate PostgreSQL database before launch and after material schema changes. A restore replaces data and is intentionally not automated by the deployment script.

## 10. Operations and rollback

```sh
cd /home/deploy/app/autocall
docker compose --env-file .env.production -f docker-compose.production.yml ps
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 app
docker compose --env-file .env.production -f docker-compose.production.yml logs --tail=200 postgres
docker stats
df -h
```

The deployment script restores the preceding app image when the new app fails readiness and that image still exists. It does not reverse a database migration. Schema migrations must therefore be backward-compatible with the previous application during the rollout window. To redeploy an older application commit manually, the SHA must still be in `origin/main`; first assess its compatibility with all already-applied migrations.

Never run `docker compose down -v` in production: `-v` deletes the PostgreSQL volume. Do not run the local demo seed against production.

## 11. Acceptance checklist

- Leadgen still works through the existing `/` Nginx route.
- `/autocall-db` redirects to `/autocall-db/` and loads successfully over HTTPS.
- `/autocall-db/api/health/ready` returns HTTP 200 publicly and through loopback.
- PostgreSQL has no host/public port (`docker compose ps` shows no `0.0.0.0:5432`).
- Admin login, site creation, dashboard reads/writes, tracker bootstrap, chat, SSE reconnect, and a visitor-accepted LiveKit call work.
- GitHub Actions can deploy a reviewed `main` commit and rejects failures before deployment.
- A database backup exists, its checksum verifies, and a restore rehearsal has succeeded.
- Real secrets exist only in `/home/deploy/app/autocall/.env.production` with mode `0600` and the relevant external provider consoles.
