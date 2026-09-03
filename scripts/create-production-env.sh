#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  printf 'Usage: %s [OUTPUT_FILE]\n' "$0"
}

if (( $# > 1 )); then
  usage >&2
  exit 2
fi

output_file="${1:-.env.production}"
[[ ! -e "$output_file" ]] || {
  printf 'Refusing to overwrite existing production configuration: %s\n' "$output_file" >&2
  exit 1
}

for command in openssl tr; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'Required command is unavailable: %s\n' "$command" >&2
    exit 1
  }
done

read -r -p 'Production Upstash Redis REST URL (https://...): ' upstash_url
read -r -s -p 'Production Upstash Redis REST token: ' upstash_token
printf '\n'
read -r -p 'Production LiveKit URL (wss://...): ' livekit_url
read -r -s -p 'Production LiveKit API key: ' livekit_api_key
printf '\n'
read -r -s -p 'Production LiveKit API secret: ' livekit_api_secret
printf '\n'

for value in \
  "$upstash_url" \
  "$upstash_token" \
  "$livekit_url" \
  "$livekit_api_key" \
  "$livekit_api_secret"; do
  [[ -n "$value" && "$value" != *[[:space:]]* ]] || {
    printf 'Provider values must be non-empty and may not contain whitespace.\n' >&2
    exit 1
  }
done

postgres_password="$(openssl rand -hex 32)"
auth_secret="$(openssl rand -base64 48 | tr -d '\r\n')"
tracking_secret="$(openssl rand -base64 48 | tr -d '\r\n')"

umask 077
(
  set -o noclobber
  {
    printf 'APP_HOST_PORT=3200\n'
    printf 'APP_URL=https://api.infrastructuresg.com/autocall-db\n'
    printf '\n'
    printf 'POSTGRES_DB=autocall_prod\n'
    printf 'POSTGRES_USER=autocall\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
    printf '\n'
    printf 'AUTH_SECRET=%s\n' "$auth_secret"
    printf 'TRACKING_IP_HASH_SECRET=%s\n' "$tracking_secret"
    printf '\n'
    printf 'UPSTASH_REDIS_REST_URL=%s\n' "$upstash_url"
    printf 'UPSTASH_REDIS_REST_TOKEN=%s\n' "$upstash_token"
    printf '\n'
    printf 'LIVEKIT_URL=%s\n' "$livekit_url"
    printf 'LIVEKIT_API_KEY=%s\n' "$livekit_api_key"
    printf 'LIVEKIT_API_SECRET=%s\n' "$livekit_api_secret"
    printf '\n'
    printf 'CALL_RING_TIMEOUT_SECONDS=30\n'
    printf 'CALL_CONNECTION_TIMEOUT_SECONDS=90\n'
  } >"$output_file"
)
chmod 0600 "$output_file"

script_directory="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash "${script_directory}/validate-production-env.sh" "$output_file"
printf 'Created protected production configuration: %s\n' "$output_file"
