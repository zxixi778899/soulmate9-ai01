#!/usr/bin/env bash
set -euo pipefail

value="${CIVITAI_API_TOKEN:-}"
if [[ -z "$value" ]]; then
  echo missing
  exit 22
fi
if [[ "$value" == *RUNPOD_SECRET* ]]; then
  echo placeholder
  exit 23
fi
echo resolved
