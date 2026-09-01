#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s COMMIT_SHA\n' "$0"
}

[[ $# -eq 1 ]] || {
  usage >&2
  exit 2
}

release_sha="$1"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Commit SHA must contain 40 lowercase hexadecimal characters.\n' >&2
  exit 1
}

deploy_root=/home/deploy/app/autocall
env_file="${deploy_root}/.env.production"
lock_file="${deploy_root}/.deployment/deploy.lock"
state_file="${deploy_root}/.deployment/current-commit"

for command in curl docker flock git; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command" >&2
    exit 1
  }
done

[[ "$(id -un)" == deploy ]] || {
  printf 'Deployment must run as the deploy user.\n' >&2
  exit 1
}
[[ -d "${deploy_root}/.git" ]] || {
  printf 'Deployment checkout is missing: %s\n' "$deploy_root" >&2
  exit 1
}

mkdir -p "${deploy_root}/.deployment"
exec 9>"$lock_file"
flock -n 9 || {
  printf 'Another deployment is already running.\n' >&2
  exit 1
}

cd "$deploy_root"
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || {
  printf 'Tracked files in the production checkout have local changes.\n' >&2
  exit 1
}

git fetch --prune origin main
git cat-file -e "${release_sha}^{commit}"
git merge-base --is-ancestor "$release_sha" origin/main || {
  printf 'Requested commit is not contained in origin/main.\n' >&2
  exit 1
}

previous_sha=""
[[ -f "$state_file" ]] && previous_sha="$(<"$state_file")"

git checkout --detach "$release_sha"
bash ./scripts/validate-production-env.sh "$env_file"

export APP_IMAGE="supernizo-autocall-app:${release_sha}"
export MIGRATOR_IMAGE="supernizo-autocall-migrator:${release_sha}"
compose=(docker compose --env-file "$env_file" --file docker-compose.production.yml)

"${compose[@]}" config --quiet
"${compose[@]}" build app migrate
"${compose[@]}" up -d postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --no-build --remove-orphans app postgres

healthy=false
for _ in {1..60}; do
  if curl --fail --silent --show-error \
    http://127.0.0.1:3100/autocall-db/api/health/ready >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  printf 'New application did not become healthy.\n' >&2
  if [[ "$previous_sha" =~ ^[0-9a-f]{40}$ ]] \
    && docker image inspect "supernizo-autocall-app:${previous_sha}" >/dev/null 2>&1; then
    printf 'Restoring the previous application image; database migrations are not reversed.\n' >&2
    export APP_IMAGE="supernizo-autocall-app:${previous_sha}"
    export MIGRATOR_IMAGE="supernizo-autocall-migrator:${previous_sha}"
    docker compose --env-file "$env_file" --file docker-compose.production.yml \
      up -d --no-build app postgres
  fi
  exit 1
fi

printf '%s\n' "$release_sha" >"$state_file"
chmod 0600 "$state_file"
"${compose[@]}" ps
printf 'Deployment completed: %s\n' "$release_sha"
