#!/usr/bin/env bash
set -Eeuo pipefail

original_command="${SSH_ORIGINAL_COMMAND:-}"
app_image_pattern='ghcr\.io/cogent-solutions-developments/supernizo-autocall-app@sha256:[0-9a-f]{64}'
migrator_image_pattern='ghcr\.io/cogent-solutions-developments/supernizo-autocall-migrator@sha256:[0-9a-f]{64}'

if [[ "$original_command" =~ ^deploy\ ([0-9a-f]{40})\ (${app_image_pattern})\ (${migrator_image_pattern})$ ]]; then
  exec /usr/bin/bash /home/deploy/app/autocall/scripts/deploy-production.sh \
    "${BASH_REMATCH[1]}" \
    "${BASH_REMATCH[2]}" \
    "${BASH_REMATCH[3]}"
fi

printf 'This SSH key may only deploy an exact hetzner-prod commit with approved GHCR digests.\n' >&2
exit 1
