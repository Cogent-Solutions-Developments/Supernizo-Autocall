#!/usr/bin/env bash
set -Eeuo pipefail

original_command="${SSH_ORIGINAL_COMMAND:-}"

if [[ "$original_command" =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
  exec /usr/bin/bash /home/deploy/app/autocall/scripts/deploy-production.sh \
    "${BASH_REMATCH[1]}"
fi

printf 'This SSH key may only deploy an exact main-branch commit.\n' >&2
exit 1
