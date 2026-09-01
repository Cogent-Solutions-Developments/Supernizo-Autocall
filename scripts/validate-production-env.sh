#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s [ENV_FILE]\n' "$0"
}

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

env_file="${1:-.env.production}"
[[ -f "$env_file" && -r "$env_file" && -s "$env_file" ]] || {
  printf 'Production environment file is missing or empty: %s\n' "$env_file" >&2
  exit 1
}

mode="$(stat -c '%a' "$env_file")"
(( (8#${mode} & 8#077) == 0 )) || {
  printf 'Production environment file must not be group/world accessible (mode %s).\n' "$mode" >&2
  exit 1
}

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./production-env.sh
source "${script_directory}/production-env.sh"
load_production_environment "$env_file"

required=(
  APP_URL
  AUTH_SECRET
  LIVEKIT_API_KEY
  LIVEKIT_API_SECRET
  LIVEKIT_URL
  POSTGRES_PASSWORD
  TRACKING_IP_HASH_SECRET
  UPSTASH_REDIS_REST_TOKEN
  UPSTASH_REDIS_REST_URL
)

for variable in "${required[@]}"; do
  value="${!variable:-}"
  [[ -n "$value" && "$value" != *replace-with* ]] || {
    printf 'Missing production value: %s\n' "$variable" >&2
    exit 1
  }
done

[[ "$APP_URL" == 'https://api.infrastructuresg.com/autocall-db' ]] || {
  printf 'APP_URL must be https://api.infrastructuresg.com/autocall-db\n' >&2
  exit 1
}
[[ "$POSTGRES_PASSWORD" =~ ^[0-9a-f]{64}$ ]] || {
  printf 'POSTGRES_PASSWORD must be 64 lowercase hexadecimal characters.\n' >&2
  exit 1
}
[[ "${POSTGRES_USER:-autocall}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || {
  printf 'POSTGRES_USER must be a safe lowercase PostgreSQL identifier.\n' >&2
  exit 1
}
[[ "${POSTGRES_DB:-autocall_prod}" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || {
  printf 'POSTGRES_DB must be a safe lowercase PostgreSQL identifier.\n' >&2
  exit 1
}
(( ${#AUTH_SECRET} >= 32 )) || {
  printf 'AUTH_SECRET must contain at least 32 characters.\n' >&2
  exit 1
}
(( ${#TRACKING_IP_HASH_SECRET} >= 32 )) || {
  printf 'TRACKING_IP_HASH_SECRET must contain at least 32 characters.\n' >&2
  exit 1
}
[[ "$LIVEKIT_URL" == wss://* ]] || {
  printf 'LIVEKIT_URL must use wss:// in production.\n' >&2
  exit 1
}
[[ "$UPSTASH_REDIS_REST_URL" == https://* ]] || {
  printf 'UPSTASH_REDIS_REST_URL must use https:// in production.\n' >&2
  exit 1
}
[[ "${APP_HOST_PORT:-3100}" == 3100 ]] || {
  printf 'APP_HOST_PORT must remain 3100 to match the Nginx upstream.\n' >&2
  exit 1
}
[[ "${CALL_RING_TIMEOUT_SECONDS:-30}" =~ ^[0-9]+$ ]] \
  && (( ${CALL_RING_TIMEOUT_SECONDS:-30} >= 10 && ${CALL_RING_TIMEOUT_SECONDS:-30} <= 120 )) || {
  printf 'CALL_RING_TIMEOUT_SECONDS must be between 10 and 120.\n' >&2
  exit 1
}
[[ "${CALL_CONNECTION_TIMEOUT_SECONDS:-90}" =~ ^[0-9]+$ ]] \
  && (( ${CALL_CONNECTION_TIMEOUT_SECONDS:-90} >= 30 && ${CALL_CONNECTION_TIMEOUT_SECONDS:-90} <= 300 )) || {
  printf 'CALL_CONNECTION_TIMEOUT_SECONDS must be between 30 and 300.\n' >&2
  exit 1
}

printf 'Production environment validation passed.\n'
