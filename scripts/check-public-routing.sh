#!/usr/bin/env bash
set -euo pipefail

# Test through the public TLS proxy, not just the container health endpoint.
base_url="${1:-https://api.infrastructuresg.com/autocall-db}"
base_url="${base_url%/}"

for path in '' '/' '/login' '/api/health/ready'; do
  if ! status="$(curl --fail --silent --show-error --location --max-redirs 3 \
    --connect-timeout 10 --max-time 30 --output /dev/null \
    --write-out '%{http_code}' "${base_url}${path}")"; then
    printf 'Public Autocall routing failed for %s (HTTP %s). Check Nginx redirects and upstream availability.\n' \
      "${path:-/ (canonical root)}" "$status" >&2
    exit 1
  fi
  if [[ "$status" != 200 ]]; then
    printf 'Expected HTTP 200 for public Autocall route %s; received %s.\n' "$path" "$status" >&2
    exit 1
  fi
done

printf 'Public Autocall root, trailing-slash root, login, and readiness routes passed.\n'
