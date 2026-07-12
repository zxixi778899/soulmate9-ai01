#!/usr/bin/env bash
# Paste whole script into model-downloader terminal. Set token first.
set -euo pipefail
export CIVITAI_API_TOKEN="${CIVITAI_API_TOKEN:-PASTE_YOUR_CIVITAI_TOKEN_HERE}"
ROOT=""
for d in /runpod-volume /workspace /workspace/runpod-volume; do [[ -d "$d" ]] && ROOT="$d" && break; done
ROOT="${ROOT:-$(pwd)/soulmate-models-local}"
LORA="$ROOT/models/loras"; mkdir -p "$LORA"; cd "$LORA"
dl() {
  local name="$1" url="$2"
  if [[ -f "$name" ]]; then echo "skip $name"; return 0; fi
  echo "download $name ..."
  if [[ -n "${CIVITAI_API_TOKEN}" && "${CIVITAI_API_TOKEN}" != PASTE_YOUR_CIVITAI_TOKEN_HERE ]]; then
    curl -L --fail --retry 5 -H "Authorization: Bearer ${CIVITAI_API_TOKEN}" -o "${name}.part" "$url"
  else
    curl -L --fail --retry 5 -o "${name}.part" "$url"
  fi
  local b; b=$(stat -c%s "${name}.part" 2>/dev/null || wc -c < "${name}.part" | tr -d ' ')
  if [[ "$b" -lt 1000000 ]]; then echo "FAIL small $name ($b)"; rm -f "${name}.part"; return 1; fi
  mv -f "${name}.part" "$name"; echo "ok $name"
}
dl flux_style_photoreal_v1.safetensors https://civitai.com/api/download/models/1084957
dl flux_style_hyperreal_aidma_v1.safetensors https://civitai.com/api/download/models/980278
dl flux_detail_skin_v1.safetensors https://civitai.com/api/download/models/827325
dl flux_detail_skin_nplastic_v1.safetensors https://civitai.com/api/download/models/1301668
dl flux_detail_hands_v1.safetensors https://civitai.com/api/download/models/1003317
dl flux_detail_upgrader_v1.safetensors https://civitai.com/api/download/models/984672
dl flux_body_curvy_v1.safetensors https://civitai.com/api/download/models/1668530
dl flux_body_pear_v1.safetensors https://civitai.com/api/download/models/1276427
dl flux_outfit_lingerie_v1.safetensors https://civitai.com/api/download/models/869894
dl flux_outfit_bunny_v1.safetensors https://civitai.com/api/download/models/817758
dl flux_outfit_maid_v1.safetensors https://civitai.com/api/download/models/1588611
dl flux_outfit_bikini_v1.safetensors https://civitai.com/api/download/models/1184191
dl flux_outfit_latex_v1.safetensors https://civitai.com/api/download/models/734230
dl flux_outfit_school_v1.safetensors https://civitai.com/api/download/models/2163726
dl flux_pose_nsfw_dynamic_v1.safetensors https://civitai.com/api/download/models/746602
dl flux_face_ahegao_v1.safetensors https://civitai.com/api/download/models/1477302
dl flux_style_cinematic_v1.safetensors https://civitai.com/api/download/models/953083
echo DONE
ls -lh *.safetensors 2>/dev/null || ls -lah
