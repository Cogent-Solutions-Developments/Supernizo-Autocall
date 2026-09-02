#!/usr/bin/env bash

production_environment_keys=(
  APP_HOST_PORT
  APP_URL
  AUTH_SECRET
  CALL_CONNECTION_TIMEOUT_SECONDS
  CALL_RING_TIMEOUT_SECONDS
  LIVEKIT_API_KEY
  LIVEKIT_API_SECRET
  LIVEKIT_URL
  POSTGRES_DB
  POSTGRES_PASSWORD
  POSTGRES_USER
  TRACKING_IP_HASH_SECRET
  UPSTASH_REDIS_REST_TOKEN
  UPSTASH_REDIS_REST_URL
)

load_production_environment() {
  local env_file="$1"
  local key line value
  local -A allowed=()
  local -A loaded=()

  for key in "${production_environment_keys[@]}"; do
    allowed["$key"]=1
  done

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" == \#* ]] && continue

    [[ "$line" == *=* ]] || {
      printf 'Invalid production environment line; expected KEY=VALUE.\n' >&2
      return 1
    }

    key="${line%%=*}"
    value="${line#*=}"
    [[ -n "${allowed[$key]:-}" ]] || {
      printf 'Unknown production environment variable: %s\n' "$key" >&2
      return 1
    }
    [[ -z "${loaded[$key]:-}" ]] || {
      printf 'Duplicate production environment variable: %s\n' "$key" >&2
      return 1
    }
    [[ "$value" != *[[:space:]]* ]] || {
      printf 'Production value may not contain whitespace: %s\n' "$key" >&2
      return 1
    }

    printf -v "$key" '%s' "$value"
    export "$key"
    loaded["$key"]=1
  done <"$env_file"
}
