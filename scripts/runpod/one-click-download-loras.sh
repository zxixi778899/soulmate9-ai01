#!/usr/bin/env bash
# Soulmate9 one-click FLUX LoRA download -> models/loras/
# export CIVITAI_API_TOKEN=YOUR_TOKEN
# bash one-click-download-loras.sh
# bash one-click-download-loras.sh --tier A
set -euo pipefail
TIER="all"; VOLUME_ROOT=""; FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tier) TIER="$2"; shift 2 ;;
    --all) TIER="all"; shift ;;
    --root) VOLUME_ROOT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done
if [[ -z "$VOLUME_ROOT" ]]; then
  for d in /runpod-volume /workspace /workspace/runpod-volume; do
    [[ -d "$d" ]] && VOLUME_ROOT="$d" && break
  done
fi
VOLUME_ROOT="${VOLUME_ROOT:-$(pwd)/soulmate-models-local}"
LORA_DIR="$VOLUME_ROOT/models/loras"
mkdir -p "$LORA_DIR"
rows=(
"flux_style_photoreal_v1.safetensors|https://civitai.com/api/download/models/1084957|A"
"flux_style_hyperreal_aidma_v1.safetensors|https://civitai.com/api/download/models/980278|A"
"flux_detail_skin_v1.safetensors|https://civitai.com/api/download/models/827325|A"
"flux_detail_skin_nplastic_v1.safetensors|https://civitai.com/api/download/models/1301668|A"
"flux_detail_hands_v1.safetensors|https://civitai.com/api/download/models/1003317|A"
"flux_detail_upgrader_v1.safetensors|https://civitai.com/api/download/models/984672|A"
"flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/1668530|B"
"flux_body_pear_v1.safetensors|https://civitai.com/api/download/models/1276427|B"
"flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894|C"
"flux_outfit_bunny_v1.safetensors|https://civitai.com/api/download/models/817758|C"
"flux_outfit_maid_v1.safetensors|https://civitai.com/api/download/models/1588611|C"
"flux_outfit_bikini_v1.safetensors|https://civitai.com/api/download/models/1184191|C"
"flux_outfit_latex_v1.safetensors|https://civitai.com/api/download/models/734230|C"
"flux_outfit_school_v1.safetensors|https://civitai.com/api/download/models/2163726|C"
"flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/746602|D"
"flux_face_ahegao_v1.safetensors|https://civitai.com/api/download/models/1477302|D"
"flux_style_cinematic_v1.safetensors|https://civitai.com/api/download/models/953083|E"
)
want_tier() {
  local t="$1"
  [[ "$TIER" == "all" ]] && return 0
  local up; up=$(echo "$TIER" | tr '[:lower:]' '[:upper:]')
  [[ ",$up," == *",$t,"* ]]
}
ok=0; fail=0
echo "root=$VOLUME_ROOT tier=$TIER token=${CIVITAI_API_TOKEN:+yes}"
: > "$LORA_DIR/lora-urls.recommended.txt"
for row in "${rows[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  want_tier "$tier" || continue
  echo "$name|$url" >> "$LORA_DIR/lora-urls.recommended.txt"
  dest="$LORA_DIR/$name"
  if [[ -f "$dest" && "$FORCE" -eq 0 ]]; then echo "skip $name"; ok=$((ok+1)); continue; fi
  echo "dl $name"
  tmp="${dest}.part"; rm -f "$tmp"
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    curl -L --fail --retry 5 --retry-delay 2 -H "Authorization: Bearer ${CIVITAI_API_TOKEN}" -o "$tmp" "$url" || { rm -f "$tmp"; echo FAIL $name; fail=$((fail+1)); continue; }
  else
    curl -L --fail --retry 5 --retry-delay 2 -o "$tmp" "$url" || { rm -f "$tmp"; echo FAIL $name; fail=$((fail+1)); continue; }
  fi
  bytes=$(stat -c%s "$tmp" 2>/dev/null || wc -c < "$tmp" | tr -d ' ')
  if [[ "${bytes:-0}" -lt 1000000 ]]; then echo "FAIL small $name ($bytes)"; rm -f "$tmp"; fail=$((fail+1)); continue; fi
  mv -f "$tmp" "$dest"; echo "ok $name"; ok=$((ok+1))
done
echo "done ok=$ok fail=$fail"
ls -lh "$LORA_DIR"/*.safetensors 2>/dev/null || ls -lah "$LORA_DIR"
