# Hetzner production deployment through GHCR

This runbook deploys the complete Supernizo Autocall application and its private PostgreSQL database on the existing Hetzner server. The checkout is `/home/deploy/app/autocall`, and the public application URL is `https://api.infrastructuresg.com/autocall-db`.

`/autocall-db` is an HTTPS route to the Next.js application. It is not a PostgreSQL URL. The application connects to PostgreSQL privately at `postgres:5432` on an internal Docker network; users and the Internet never connect to the database directly. The existing leadgen `location /` and the separate `Supernizo-Autocall-Database` repository remain unchanged.

## 1. Final architecture

- GitHub Actions tests the repository, builds the `runner` and `migrator` Docker targets, publishes both private images to GHCR, and attaches BuildKit SBOM/provenance records.
- Images are tagged for humans, but deployment passes immutable `@sha256:...` digests.
- A restricted SSH key can submit only an exact 40-character `main` commit plus the two approved GHCR repository digests.
- Hetzner verifies the commit belongs to `origin/main`, pulls the images, verifies each OCI revision label matches the commit, applies Prisma migrations, and starts the app.
- `app` is bound only to host loopback `127.0.0.1:3200`.
- PostgreSQL has a named persistent volume and no published host port.
- Nginx keeps TLS and proxies `/autocall-db/*` to `127.0.0.1:3200`.
- Upstash Redis/Realtime and LiveKit remain external providers.

This reuses the current server and has no additional software licence cost. It still consumes the existing Hetzner server, GHCR, provider, storage, and backup quotas.

## 2. Repository and GitHub preparation

Merge these production files into `main` only after review. In GitHub repository **Settings → Actions → General**:

1. Allow GitHub Actions for the repository.
2. Keep the default `GITHUB_TOKEN` permission read-only; the publish job explicitly requests only `contents: read` and `packages: write`.
3. Require pull requests and status checks for `main`.

Create a GitHub environment named `production` and allow deployment only from `main`. Add required reviewers when the repository plan supports protection rules for private repositories. On a plan without that feature, make branch protection and successful quality checks mandatory because a successful `main` workflow will deploy automatically. Later, add these environment secrets:

| Secret                    | Exact purpose                                    |
| ------------------------- | ------------------------------------------------ |
| `HETZNER_HOST`            | Public IP or DNS name used by SSH                |
| `HETZNER_USER`            | `deploy`                                         |
| `HETZNER_SSH_PRIVATE_KEY` | Dedicated Actions-to-Hetzner private Ed25519 key |
| `HETZNER_SSH_HOST_KEY`    | Verified `known_hosts` line for `HETZNER_HOST`   |

Do not create a GHCR write PAT for Actions. The workflow publishes with its short-lived repository `GITHUB_TOKEN`. Do not put application, PostgreSQL, Upstash, or LiveKit secrets in GitHub Actions.

The workflow uses BuildKit's GHCR-attached SBOM and provenance because GitHub's separate artifact-attestation service requires Enterprise Cloud for a private repository. This keeps the deployment compatible with Free/Team allowances.

The workflow publishes these private packages:

```text
ghcr.io/cogent-solutions-developments/supernizo-autocall-app
ghcr.io/cogent-solutions-developments/supernizo-autocall-migrator
```

## 3. Prepare Ubuntu and the deploy account

Keep `api.infrastructuresg.com` pointed at the existing server. In Hetzner Firewall and the host firewall:

- allow TCP 80 and 443 from the Internet;
- allow TCP 22 from administrator addresses and the deployment runner path;
- do not expose TCP 3000, 3200, 5432, or 6432.

The lead-generation monitoring stack already binds Loki to `127.0.0.1:3100`, so Autocall deliberately uses `127.0.0.1:3200`. Confirm that this port is free on the real host before installing Nginx:

```sh
sudo ss -lntp | grep ':3200 ' || true
```

No output means the port is currently free. If another service is shown, stop here and choose one different loopback port consistently in `.env.production`, `docker-compose.production.yml`, the deployment health check, the validator, and the Nginx snippet.

GitHub-hosted runner addresses change. If TCP 22 cannot be dynamically allow-listed, leave it reachable but enforce SSH keys, the forced command in section 8, disabled password login, and normal SSH rate limiting. Do not weaken SSH authentication to make CI work.

Install prerequisites from the server console. If current Docker Engine and Compose v2 are already installed, verify them and skip the Docker repository installation.

```sh
sudo apt-get update
sudo apt-get install --yes ca-certificates curl git openssl util-linux

sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${UBUNTU_CODENAME:-$VERSION_CODENAME} stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install --yes docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Create the unprivileged account if it does not already exist, then prepare its directories:

```sh
sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
sudo install -d -o deploy -g deploy -m 0750 /home/deploy/app
```

Do not run `adduser` again if `deploy` already exists. Log out and back in after changing group membership, then verify:

```sh
sudo -iu deploy
git --version
curl --version
flock --version
docker version
docker compose version
```

Docker group membership is effectively root-equivalent. The `deploy` account and every key that can reach it must be treated as privileged.

## 4. Give Hetzner read-only access to the source repository

The server still needs the reviewed Compose, migration, validation, backup, and deployment files from `main`. This key is separate from the Actions-to-Hetzner key.

Run as `deploy`:

```sh
install -d -m 0700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/supernizo-autocall-github -C supernizo-autocall-hetzner -N ''
cat ~/.ssh/supernizo-autocall-github.pub
```

In the application repository, open **Settings → Deploy keys → Add deploy key**, paste that public key, name it `Hetzner production read-only`, and leave **Allow write access** unchecked.

Verify GitHub's current SSH host fingerprint from GitHub's published fingerprint page before trusting it. Then add the verified host key and SSH alias:

```sh
ssh-keyscan -t ed25519 github.com >>~/.ssh/known_hosts
chmod 0600 ~/.ssh/known_hosts
```

Create `/home/deploy/.ssh/config` with mode `0600`:

```sshconfig
Host github-supernizo-autocall
    HostName github.com
    User git
    IdentityFile ~/.ssh/supernizo-autocall-github
    IdentitiesOnly yes
```

Clone exactly once:

```sh
chmod 0600 ~/.ssh/config
git clone git@github-supernizo-autocall:Cogent-Solutions-Developments/Supernizo-Autocall.git /home/deploy/app/autocall
cd /home/deploy/app/autocall
git remote -v
git status --short
```

Never edit tracked files in this checkout. The deployment script refuses a dirty tracked worktree.

## 5. Create the least-privilege GHCR pull credential

Keep both GHCR packages private. For server pulls, use a dedicated GitHub machine account rather than a developer's personal token.

1. Give the machine account read access to the private application repository or packages.
2. In that account, open **Settings → Developer settings → Personal access tokens → Tokens (classic)**.
3. Generate a token named `supernizo-autocall-hetzner-pull` with an expiration and only `read:packages`.
4. If the organization enforces SAML SSO, authorize the token for `Cogent-Solutions-Developments`.
5. Do not grant `write:packages`, `delete:packages`, or repository write access.

Log in once as `deploy`. The token is read silently and does not enter shell history:

```sh
read -r -p 'GitHub machine username: ' GHCR_USERNAME
read -r -s -p 'GHCR read:packages token: ' GHCR_TOKEN
printf '\n'
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin
unset GHCR_TOKEN GHCR_USERNAME
chmod 0700 ~/.docker
chmod 0600 ~/.docker/config.json
```

Docker stores this credential reversibly in `/home/deploy/.docker/config.json`; file permissions and deploy-account access are therefore security boundaries. Never put this PAT in `.env.production` or GitHub Actions.

The first workflow publish creates the packages. In each package's **Package settings**, confirm it is linked to this repository, Actions access is inherited/granted, visibility is private, and the machine account has read access.

## 6. Create production secrets only on Hetzner

Obtain production Upstash Redis REST and LiveKit credentials from their provider consoles. Then run the protected initializer as `deploy`:

```sh
cd /home/deploy/app/autocall
bash scripts/create-production-env.sh .env.production
stat -c '%a %U:%G %n' .env.production
```

It generates three independent random values locally:

- a 64-character hexadecimal PostgreSQL password;
- an Auth.js signing secret;
- a separate tracking IP hash secret.

It prompts silently for provider tokens, writes `.env.production` with mode `0600`, and runs the allow-list validator. It deliberately does not write `DATABASE_URL`: Compose builds the private URL from the PostgreSQL values.

To configure an existing file manually instead, copy `.env.production.example`, replace every placeholder, set mode `0600`, and run:

```sh
bash scripts/validate-production-env.sh .env.production
```

Never commit, print, upload, or paste `.env.production` into a GitHub issue or Actions secret.

## 7. Configure Nginx without changing leadgen

Install the reviewed route as a root-owned Nginx snippet:

```sh
sudo install -o root -g root -m 0644 \
  /home/deploy/app/autocall/ops/nginx/autocall.location.conf \
  /etc/nginx/snippets/supernizo-autocall.conf
```

Edit `/etc/nginx/sites-available/leadgen`. Inside the existing TLS `server { ... }` for `api.infrastructuresg.com`, add this line next to the existing locations:

```nginx
include /etc/nginx/snippets/supernizo-autocall.conf;
```

Keep the existing leadgen `location /` unchanged. There must be only one exact `/autocall-db` location and one `^~ /autocall-db/` location. Validate and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

Before the first app deployment, `/autocall-db` may return a temporary upstream error; leadgen continues through `location /`.

## 8. Create the restricted Actions-to-Hetzner SSH key

On a trusted administrator workstation, create a dedicated key with no passphrase because GitHub Actions must use it non-interactively:

```sh
ssh-keygen -t ed25519 -f ./supernizo-autocall-actions -C github-actions-autocall -N ''
```

On Hetzner, append exactly one restricted line to `/home/deploy/.ssh/authorized_keys`, replacing the key body with `supernizo-autocall-actions.pub`:

```text
restrict,command="/usr/bin/bash /home/deploy/app/autocall/scripts/github-deploy-command.sh" ssh-ed25519 REPLACE_WITH_ACTIONS_PUBLIC_KEY github-actions-autocall
```

Then enforce ownership and permissions:

```sh
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 0600 /home/deploy/.ssh/authorized_keys
```

Put the complete private key, including header and footer, into the `production` environment secret `HETZNER_SSH_PRIVATE_KEY`. Delete the workstation copies after the secret and server public key are confirmed.

Get the SSH host key from a trusted path. On the server console:

```sh
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub -E sha256
```

On the trusted workstation:

```sh
ssh-keyscan -t ed25519 REPLACE_WITH_HETZNER_HOST >./hetzner_known_hosts
ssh-keygen -lf ./hetzner_known_hosts -E sha256
```

Compare the SHA256 fingerprints exactly. Only after they match, save the single line from `hetzner_known_hosts` as `HETZNER_SSH_HOST_KEY`. Set `HETZNER_HOST` to the same hostname/IP present on that line and `HETZNER_USER` to `deploy`.

The forced command rejects interactive shells, arbitrary commands, tags, foreign image repositories, mutable image references, and malformed digests.

## 9. First GHCR publish and deployment

Use one of these safe first-run orders:

- With environment reviewers: configure secrets, merge the reviewed code to `main`, let quality/publish finish, keep deployment waiting for approval, confirm package access and complete the server setup, then approve.
- Without private-repository environment reviewers: push the reviewed `feat/prod-config` branch first, clone/check out that branch on Hetzner only to perform sections 4–8, give the machine account repository read access, configure all GitHub secrets, then merge to protected `main`. The successful `main` workflow publishes and deploys automatically.

For the second option, the temporary server checkout commands before the merge are:

```sh
cd /home/deploy/app/autocall
git fetch origin feat/prod-config
git checkout --detach origin/feat/prod-config
```

The OCI source label links new packages to this repository, so they normally inherit its read permissions. If organization policy disables automatic inheritance, the first pull fails safely: grant the machine account read access in both new package settings and rerun the workflow manually from `main`.

The first production deployment replaces the temporary checkout with the exact `main` commit. Do not approve or merge until the server can authenticate to GHCR and the restricted Actions SSH key is installed.

The workflow passes references shaped like:

```text
ghcr.io/cogent-solutions-developments/supernizo-autocall-app@sha256:<64 hex characters>
ghcr.io/cogent-solutions-developments/supernizo-autocall-migrator@sha256:<64 hex characters>
```

The host never runs `docker compose build`. It pulls those exact digests, verifies their OCI revision labels against `GITHUB_SHA`, starts PostgreSQL, runs `prisma migrate deploy`, and only then replaces the app.

After success, verify as `deploy`:

```sh
cd /home/deploy/app/autocall
docker compose \
  --env-file .env.production \
  --env-file .deployment/current-images.env \
  -f docker-compose.production.yml ps
cat .deployment/current-commit
cat .deployment/current-images.env
curl --fail http://127.0.0.1:3200/autocall-db/api/health/ready
curl --fail https://api.infrastructuresg.com/autocall-db/api/health/ready
```

The two state files contain only a commit and public image digests, not credentials.

## 10. Provision the first production administrator

The demo seed is never run by deployment. Enter the first administrator without putting its password in shell history:

```sh
cd /home/deploy/app/autocall
read -r -p 'Admin email: ' ADMIN_EMAIL
read -r -s -p 'Admin password (minimum 16 characters): ' ADMIN_PASSWORD
printf '\n'
export ADMIN_EMAIL ADMIN_PASSWORD
docker compose \
  --env-file .env.production \
  --env-file .deployment/current-images.env \
  -f docker-compose.production.yml \
  run --rm -e ADMIN_EMAIL -e ADMIN_PASSWORD migrate \
  ./node_modules/.bin/tsx prisma/provision-admin.ts
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Sign in at `https://api.infrastructuresg.com/autocall-db/login`, create the production site, and configure exact allowed website origins.

## 11. Enable and test PostgreSQL backups

```sh
sudo cp /home/deploy/app/autocall/ops/systemd/supernizo-autocall-backup.service /etc/systemd/system/
sudo cp /home/deploy/app/autocall/ops/systemd/supernizo-autocall-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now supernizo-autocall-backup.timer
sudo systemctl start supernizo-autocall-backup.service
sudo systemctl status supernizo-autocall-backup.service
```

Backups default to 14-day retention under `/home/deploy/app/autocall/backups/postgres`:

```sh
systemctl list-timers supernizo-autocall-backup.timer
ls -lh /home/deploy/app/autocall/backups/postgres
sha256sum --check /home/deploy/app/autocall/backups/postgres/*.sha256
```

Same-server backups do not protect against server or disk loss. Copy encrypted backups to independent storage and rehearse a restore into a separate database before launch and after material schema changes.

## 12. Normal operations and rollback

```sh
cd /home/deploy/app/autocall
docker compose \
  --env-file .env.production \
  --env-file .deployment/current-images.env \
  -f docker-compose.production.yml logs --tail=200 app
docker compose \
  --env-file .env.production \
  --env-file .deployment/current-images.env \
  -f docker-compose.production.yml logs --tail=200 postgres
docker stats
df -h
```

If a newly started app fails readiness, the script pulls/restores the preceding app digest when recorded. It never reverses an applied database migration. Every migration must remain backward-compatible with the preceding app during the rollout window. For a planned rollback, revert the application change on `main` and deploy a newly reviewed workflow run after confirming schema compatibility.

Never run `docker compose down -v` in production; `-v` deletes the PostgreSQL volume. Never run the demo seed against production. Do not run unaudited cleanup commands that could delete the previous image needed for rollback.

## 13. Credential rotation and incident response

- Rotate the GHCR pull PAT before expiry: create a new `read:packages` token, repeat `docker login`, test a private pull, then revoke the old token.
- Rotate the Actions SSH key by adding the new restricted public key, replacing `HETZNER_SSH_PRIVATE_KEY`, testing deployment, then removing the old line.
- Rotate `AUTH_SECRET` knowing that existing sessions will be invalidated.
- Rotate Upstash and LiveKit credentials in their consoles and update `.env.production` locally.
- Change the PostgreSQL password in PostgreSQL and `.env.production` as one controlled maintenance operation; verify the app before revoking the old access path.
- Changing `TRACKING_IP_HASH_SECRET` intentionally breaks correlation with previous one-way IP hashes.

If any credential was ever committed, deleting the working-tree file is not sufficient. Purge it from every affected remote branch/tag and fork, invalidate caches/artifacts where applicable, and rotate every exposed credential. Treat rotation—not history rewriting alone—as the recovery boundary.

## 14. Acceptance checklist

- Leadgen still works through the existing `/` route.
- `/autocall-db` redirects to `/autocall-db/` and loads over HTTPS.
- Loopback and public readiness endpoints return HTTP 200.
- `docker compose ps` shows app only on `127.0.0.1:3200` and no PostgreSQL host port.
- Both deployed image values use the approved GHCR repositories with `@sha256:` digests.
- GitHub packages are private and the Hetzner account has pull-only access.
- The workflow attached BuildKit SBOM/provenance records to both GHCR images.
- Admin login, site CRUD, tracker origin validation, chat, SSE reconnect, and a visitor-accepted LiveKit call work.
- A backup checksum passes and an independent restore rehearsal succeeds.

Official references: [GitHub publishing Docker images](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images), [GitHub package permissions](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages), [GitHub artifact-attestation availability](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations), [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/), and [Docker Build attestations](https://docs.docker.com/build/ci/github-actions/attestations/).
