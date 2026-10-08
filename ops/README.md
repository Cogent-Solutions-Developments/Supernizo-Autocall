# Operations

Run commands from the repository root. Docker assets live in `ops/docker`, operational shell scripts in `ops/scripts`, and host configuration in `ops/nginx` and `ops/systemd`. The build context remains the repository root. Production environment and deployment state remain at their existing root locations.

See [the deployment guide](../docs/hetzner-deployment.md) for setup, backup and restore.

## Existing host migration

Before the first automated deployment of this layout, update the restricted SSH command in the deploy user's `authorized_keys` from `/home/deploy/app/autocall/scripts/github-deploy-command.sh` to `/home/deploy/app/autocall/ops/scripts/github-deploy-command.sh` and ensure the checkout already contains that file. Coordinate this checkout update through the existing host administration procedure; the old deployment script cannot deploy across the directory move because it reloads paths after checking out the release. Reinstall the updated `ops/systemd/supernizo-autocall-backup.service` and run `systemctl daemon-reload` through the host administration procedure. Keep the timer schedule and database volume unchanged. Update any external cron jobs or manual commands that use the previous script or Compose paths.

No host settings are changed by organizing this local repository.
