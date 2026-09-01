#!/usr/bin/env bash
set -Eeuo pipefail

deploy_root=/home/deploy/app/autocall
env_file="${deploy_root}/.env.production"
image_state_file="${deploy_root}/.deployment/current-images.env"
backup_root="${deploy_root}/backups/postgres"
lock_file="${deploy_root}/.deployment/backup.lock"
retention_days="${BACKUP_RETENTION_DAYS:-14}"

[[ "$(id -un)" == deploy ]] || {
  printf 'Backup must run as the deploy user.\n' >&2
  exit 1
}
[[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || {
  printf 'BACKUP_RETENTION_DAYS must be a positive integer.\n' >&2
  exit 1
}

cd "$deploy_root"
bash ./scripts/validate-production-env.sh "$env_file" >/dev/null
[[ -r "$image_state_file" ]] || {
  printf 'Deployment image state is missing: %s\n' "$image_state_file" >&2
  exit 1
}

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-env.sh
source "${script_directory}/production-env.sh"
load_production_environment "$env_file"

mkdir -p "$backup_root" "${deploy_root}/.deployment"
chmod 0700 "$backup_root"
exec 9>"$lock_file"
flock -n 9 || {
  printf 'Another database backup is already running.\n' >&2
  exit 1
}

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_file="${backup_root}/${POSTGRES_DB:-autocall_prod}-${timestamp}.dump"
compose=(
  docker compose
  --env-file "$env_file"
  --env-file "$image_state_file"
  --file docker-compose.production.yml
)

umask 077
"${compose[@]}" exec -T --user postgres postgres \
  pg_dump --format=custom --no-owner --no-privileges \
    --username "${POSTGRES_USER:-autocall}" \
    --dbname "${POSTGRES_DB:-autocall_prod}" >"$backup_file"

[[ -s "$backup_file" ]] || {
  rm -f "$backup_file"
  printf 'PostgreSQL backup is empty.\n' >&2
  exit 1
}

sha256sum "$backup_file" >"${backup_file}.sha256"
find "$backup_root" -type f \
  \( -name '*.dump' -o -name '*.dump.sha256' \) \
  -mtime "+${retention_days}" -delete

printf 'PostgreSQL backup created: %s\n' "$backup_file"
