#!/usr/bin/env bash
set -euo pipefail

state=/workspace/model-manifests
mkdir -p "$state"

# SSH sessions sanitize container variables. Recover only the Pod-scoped
# shutdown credentials from init so the watchdog can stop this Pod.
if [[ -r /proc/1/environ ]]; then
  while IFS= read -r -d '' item; do
    case "$item" in
      RUNPOD_POD_ID=*|RUNPOD_API_KEY=*) export "$item" ;;
    esac
  done < /proc/1/environ
fi
: "${RUNPOD_POD_ID:?RUNPOD_POD_ID unavailable}"
: "${RUNPOD_API_KEY:?RUNPOD_API_KEY unavailable}"

# Independent cost/attack-surface guard. It stops this temporary installer Pod
# even if a download stalls or the main script fails.
nohup bash -lc 'sleep 2700; runpodctl pod stop "$RUNPOD_POD_ID"' \
  >"$state/sdxl-watchdog.log" 2>&1 &
echo "$!" > "$state/sdxl-watchdog.pid"

set +e
bash /workspace/download-sdxl-production-bundle.sh \
  >"$state/sdxl-production.log" 2>&1
rc=$?
set -e
printf 'exit_code=%s\n' "$rc" >> "$state/sdxl-production.status"

if [[ "$rc" -eq 0 ]]; then
  runpodctl pod stop "$RUNPOD_POD_ID"
fi
exit "$rc"
