#!/usr/bin/env bash
# Extra gender / style LoRAs — male / trans / femboy / anime / 3D / NSFW.
# Run inside the pod that mounts the ComfyUI network volume:
#   LORA_DIR=/workspace/models/loras CIVITAI_TOKEN=xxx bash download-extra.sh
set -u

TOKEN="${CIVITAI_TOKEN:-}"
DIR="${LORA_DIR:-/runpod-volume/models/loras}"
mkdir -p "$DIR" && cd "$DIR" || exit 1

if [ -z "$TOKEN" ]; then
  echo "缺少 CIVITAI_TOKEN（export CIVITAI_TOKEN=xxx）"
  exit 1
fi

dl() {
  local n="$1" u="$2"
  if [ -s "$n" ]; then
    echo "SKIP $n"
    return 0
  fi
  if curl -sL --fail --retry 2 -H "Authorization: Bearer $TOKEN" -o "$n" "$u"; then
    echo "OK $n ($(du -h "$n" | cut -f1))"
  else
    echo "FAIL $n"
  fi
}

# ── Male ───────────────────────────────────────────────────────
dl flux_male_masc_v1.safetensors https://civitai.com/api/download/models/1967998
dl flux_male_muscle_v1.safetensors https://civitai.com/api/download/models/820334
# ── Transgender / femboy ───────────────────────────────────────
dl realistic-mtf-trans.safetensors https://civitai.com/api/download/models/1027537
dl flux_femboy_v1.safetensors https://civitai.com/api/download/models/1747185
# ── Anime / 3D style ───────────────────────────────────────────
dl rdanimefluxv1rapid.safetensors https://civitai.com/api/download/models/863817
dl flux_3d_render_v1.safetensors https://civitai.com/api/download/models/828678
# ── General NSFW ───────────────────────────────────────────────
dl flux_lewd_v1.safetensors https://civitai.com/api/download/models/1020932

echo "extra done; loras total: $(ls ./*.safetensors 2>/dev/null | wc -l)"
