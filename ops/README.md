# Operations

The working Hetzner deployment keeps its existing root `Dockerfile`,
`docker-compose.production.yml`, and `scripts/` entry points. The restricted SSH
command and the installed backup service continue using those paths. No server
configuration change is required for this release.

The same Docker assets and scripts are also organized under `ops/docker` and
`ops/scripts` for local development and future maintenance. Keep the deployment
entry points compatible until a separately approved host migration replaces them.

Nginx and systemd files remain under `ops/nginx` and `ops/systemd`. The backup
service definition retains `/home/deploy/app/autocall/scripts/backup-postgres.sh`.
The PostgreSQL volume, loopback port, environment file, and deployment state paths
are unchanged.

See [the deployment guide](../docs/hetzner-deployment.md) and
[the merge review](../docs/autoreply-hetzner-merge-review.md).
