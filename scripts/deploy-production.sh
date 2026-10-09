#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s COMMIT_SHA APP_IMAGE@DIGEST MIGRATOR_IMAGE@DIGEST\n' "$0"
}

[[ $# -eq 3 ]] || {
  usage >&2
  exit 2
}

release_sha="$1"
app_image="$2"
migrator_image="$3"

app_image_pattern='^ghcr\.io/cogent-solutions-developments/supernizo-autocall-app@sha256:[0-9a-f]{64}$'
migrator_image_pattern='^ghcr\.io/cogent-solutions-developments/supernizo-autocall-migrator@sha256:[0-9a-f]{64}$'

[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || {
  printf 'Commit SHA must contain 40 lowercase hexadecimal characters.\n' >&2
  exit 1
}
[[ "$app_image" =~ $app_image_pattern ]] || {
  printf 'Application image must be the approved GHCR repository pinned by sha256 digest.\n' >&2
  exit 1
}
[[ "$migrator_image" =~ $migrator_image_pattern ]] || {
  printf 'Migrator image must be the approved GHCR repository pinned by sha256 digest.\n' >&2
  exit 1
}

deploy_root=/home/deploy/app/autocall
production_branch=hetzner-prod
env_file="${deploy_root}/.env.production"
state_dir="${deploy_root}/.deployment"
lock_file="${state_dir}/deploy.lock"
commit_state_file="${state_dir}/current-commit"
image_state_file="${state_dir}/current-images.env"

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

umask 077
mkdir -p "$state_dir"
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

git fetch --prune origin \
  "refs/heads/${production_branch}:refs/remotes/origin/${production_branch}"
git cat-file -e "${release_sha}^{commit}"
git merge-base --is-ancestor "$release_sha" "origin/${production_branch}" || {
  printf 'Requested commit is not contained in origin/%s.\n' "$production_branch" >&2
  exit 1
}

previous_app_image=""
previous_migrator_image=""
if [[ -f "$image_state_file" ]]; then
  while IFS='=' read -r name value; do
    case "$name" in
      APP_IMAGE) previous_app_image="$value" ;;
      MIGRATOR_IMAGE) previous_migrator_image="$value" ;;
    esac
  done <"$image_state_file"
fi

git checkout --detach "$release_sha"
bash ./scripts/validate-production-env.sh "$env_file"

export APP_IMAGE="$app_image"
export MIGRATOR_IMAGE="$migrator_image"
compose=(docker compose --env-file "$env_file" --file docker-compose.production.yml)

"${compose[@]}" config --quiet
docker pull "$app_image"
docker pull "$migrator_image"
"${compose[@]}" pull postgres

app_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$app_image")"
migrator_revision="$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$migrator_image")"
[[ "$app_revision" == "$release_sha" ]] || {
  printf 'Application image revision label does not match the requested commit.\n' >&2
  exit 1
}
[[ "$migrator_revision" == "$release_sha" ]] || {
  printf 'Migrator image revision label does not match the requested commit.\n' >&2
  exit 1
}

"${compose[@]}" up -d --no-build postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --no-build --remove-orphans app postgres

healthy=false
for _ in {1..60}; do
  if curl --fail --silent --show-error \
    http://127.0.0.1:3200/autocall-db/api/health/ready >/dev/null; then
    healthy=true
    break
  fi
  sleep 2
done

if [[ "$healthy" != true ]]; then
  printf 'New application did not become healthy.\n' >&2
  if [[ "$previous_app_image" =~ $app_image_pattern ]] \
    && [[ "$previous_migrator_image" =~ $migrator_image_pattern ]]; then
    printf 'Restoring the previous application image; database migrations are not reversed.\n' >&2
    docker image inspect "$previous_app_image" >/dev/null 2>&1 \
      || docker pull "$previous_app_image"
    export APP_IMAGE="$previous_app_image"
    export MIGRATOR_IMAGE="$previous_migrator_image"
    docker compose --env-file "$env_file" --file docker-compose.production.yml \
      up -d --no-build app postgres
  else
    "${compose[@]}" stop app || true
  fi
  exit 1
fi

images_state_tmp="${image_state_file}.tmp.$$"
commit_state_tmp="${commit_state_file}.tmp.$$"
printf 'APP_IMAGE=%s\nMIGRATOR_IMAGE=%s\n' "$app_image" "$migrator_image" >"$images_state_tmp"
printf '%s\n' "$release_sha" >"$commit_state_tmp"
chmod 0600 "$images_state_tmp" "$commit_state_tmp"
mv -f "$images_state_tmp" "$image_state_file"
mv -f "$commit_state_tmp" "$commit_state_file"

"${compose[@]}" ps
printf 'Deployment completed: %s\nApplication image: %s\nMigrator image: %s\n' \
  "$release_sha" "$app_image" "$migrator_image"
