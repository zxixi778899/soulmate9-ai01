#!/usr/bin/env bash
# SDXL bundle installer runner for a disposable RunPod on-demand pod.
#
# Bootstrapped by a ONE-LINE dockerArgs (multi-line heredoc dockerArgs are
# never executed by RunPod), so this file lives in the public repo and is
# fetched at runtime. All secrets arrive via pod env vars:
#   CIVITAI_API_TOKEN / SB_URL / SB_KEY / RUNPOD_API_KEY
#
# Flow: install curl if missing -> boot beacon -> Civitai speed test ->
# download bundle (idempotent, resumable) with 60s progress beacons ->
# final report to Supabase site_settings -> podStop self-stop.
# Beacons write site_settings keys _sdxl_bundle_progress / _sdxl_bundle_report.
set -uo pipefail

echo "runner-start $(date -u +%FT%TZ)"
export DEBIAN_FRONTEND=noninteractive
if ! command -v curl >/dev/null 2>&1; then
  apt-get update -y >/dev/null 2>&1 || true
  apt-get install -y --no-install-recommends curl ca-certificates >/dev/null 2>&1 || true
fi

S=/workspace/model-manifests
mkdir -p "$S"

post() {
  curl -s -o /dev/null -w "%{http_code}" -X POST "$SB_URL/rest/v1/site_settings" \
    -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
    -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
    --data-binary @"$1"
}

beacon() {
  printf '{"key":"_sdxl_bundle_progress","value":%s}' "$1" > /tmp/p.json
  local code
  code=$(post /tmp/p.json)
  echo "beacon_http=$code $1"
}

beacon '{"phase":"boot","curl":"'"$(command -v curl || echo MISSING)"'","host":"'"${HOSTNAME:-unknown}"'"}'

DL_URL="https://raw.githubusercontent.com/zxixi778899/soulmate9-ai01/main/scripts/runpod/download-sdxl-matrix-bundle.sh"
curl -fsSL "$DL_URL" -o /tmp/dl.sh
fetchrc=$?
if [ $fetchrc -ne 0 ]; then
  beacon '{"phase":"script_fetch_failed","rc":'$fetchrc'}'
fi

SPD=$(curl -s -o /dev/null -w "%{speed_download}" -L --max-time 15 \
  -H "Authorization: Bearer $CIVITAI_API_TOKEN" \
  "https://civitai.com/api/download/models/914390" 2>/dev/null || echo 0)
SPDI=${SPD%.*}
beacon '{"phase":"speedtest","bytes_per_sec":'${SPDI:-0}'}'

rc=0
if [ $fetchrc -eq 0 ]; then
  sed -i "s|/workspace/ComfyUI/models|/workspace/models|" /tmp/dl.sh
  beacon '{"phase":"download_start"}'
  bash /tmp/dl.sh >"$S/bundle-run.log" 2>&1 &
  DLPID=$!
  while kill -0 "$DLPID" 2>/dev/null; do
    sleep 60
    INST=$(cat "$S/sdxl-matrix-installed.txt" 2>/dev/null | wc -l)
    TAIL=$(tail -c 500 "$S/bundle-run.log" 2>/dev/null | base64 -w0)
    beacon '{"phase":"downloading","installed":'${INST:-0}',"log_b64":"'$TAIL'"}'
  done
  wait "$DLPID"; rc=$?
fi

echo "exit_code=$rc" > "$S/bundle-run.status"
find /workspace/models -maxdepth 3 -type f \
  \( -name "*.safetensors" -o -name "*.bin" -o -name "*.pt" -o -name "*.pth" \) \
  2>/dev/null | sort > "$S/volume-inventory.txt"
INV=$(cat "$S/volume-inventory.txt" | wc -l)
B64=$( { echo "== exit_code=$rc files=$INV =="; tail -c 4000 "$S/bundle-run.log"; echo; \
  echo "== inventory =="; cat "$S/volume-inventory.txt"; } | base64 -w0 | head -c 300000 )
printf '{"key":"_sdxl_bundle_report","value":{"rc":%s,"files":%s,"report_b64":"%s"}}' \
  "$rc" "$INV" "$B64" > /tmp/report.json
code=$(post /tmp/report.json)
echo "final_report_http=$code rc=$rc files=$INV"

PID="${RUNPOD_POD_ID:-${HOSTNAME%%-*}}"
printf '{"query":"mutation { podStop(input: { podId: \\"%s\\" }) { id } }"}' "$PID" > /tmp/stop.json
curl -s -H "Content-Type: application/json" --data @/tmp/stop.json \
  "https://api.runpod.io/graphql?api_key=$RUNPOD_API_KEY" || true
echo "installer-done $(date -u +%FT%TZ)"
