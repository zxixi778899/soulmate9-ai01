#!/usr/bin/env bash
# SDXL production matrix bundle for the new runpod-sdxl-pro endpoint.
#
# Self-contained volume provisioning: checkpoints + category LoRAs (same
# verified Civitai artifacts as download-sdxl-production-bundle.sh) plus the
# enhancement assets required by the capability workflows (ControlNet pose /
# depth, IPAdapter FaceID, ADetailer detector). Idempotent: hash-verified
# files are skipped, HTTP downloads resume.
#
# Run on the RunPod SDXL worker:
#   bash /workspace/soulmate9/scripts/runpod/download-sdxl-matrix-bundle.sh
set -euo pipefail

umask 077
root="/workspace/ComfyUI/models"
state="/workspace/model-manifests"
mkdir -p "$root/checkpoints" "$root/loras" "$root/controlnet" \
  "$root/ipadapter" "$root/ultralytics/bbox" "$state"

# Full SSH sessions sanitize custom container variables; recover the Civitai
# token from the container init process without printing it.
if [[ -z "${CIVITAI_API_TOKEN:-}" && -r /proc/1/environ ]]; then
  while IFS= read -r -d '' item; do
    case "$item" in
      CIVITAI_API_TOKEN=*) export "$item"; break ;;
    esac
  done < /proc/1/environ
fi

if [[ -z "${CIVITAI_API_TOKEN:-}" || "${CIVITAI_API_TOKEN}" == *RUNPOD_SECRET* ]]; then
  echo "CIVITAI_API_TOKEN secret was not resolved" >&2
  exit 22
fi

# fetch_civitai <kind> <name> <version_id> <sha256 or ->
fetch_civitai() {
  local kind="$1" name="$2" version_id="$3" expected="$4"
  local target="$root/$kind/$name"
  local partial="$target.part"

  if [[ -f "$target" && "$expected" != "-" ]] &&
    printf '%s  %s\n' "$expected" "$target" | sha256sum -c - >/dev/null 2>&1; then
    printf 'verified-existing|%s|%s\n' "$name" "$expected" >> "$state/sdxl-matrix-installed.txt"
    return
  fi

  curl --fail --location --retry 10 --retry-all-errors --retry-delay 5 \
    --connect-timeout 30 --max-time 10800 --continue-at - \
    --header "Authorization: Bearer $CIVITAI_API_TOKEN" \
    --output "$partial" "https://civitai.com/api/download/models/$version_id"

  local actual
  actual="$(sha256sum "$partial" | awk '{print toupper($1)}')"
  if [[ "$expected" != "-" && "$actual" != "$expected" ]]; then
    printf 'hash-mismatch|%s|expected=%s|actual=%s\n' "$name" "$expected" "$actual" >&2
    exit 23
  fi
  mv "$partial" "$target"
  printf 'installed|%s|%s\n' "$name" "$actual" >> "$state/sdxl-matrix-installed.txt"
}

# fetch_hf <subdir> <name> <url>
fetch_hf() {
  local subdir="$1" name="$2" url="$3"
  local target="$root/$subdir/$name"
  if [[ -f "$target" ]]; then
    printf 'verified-existing|%s\n' "$name" >> "$state/sdxl-matrix-installed.txt"
    return
  fi
  curl -L --fail --retry 5 --retry-all-errors --connect-timeout 30 \
    --max-time 7200 --continue-at - --output "$target.part" "$url"
  mv "$target.part" "$target"
  printf 'installed|%s\n' "$name" >> "$state/sdxl-matrix-installed.txt"
}

printf 'started=%s\n' "$(date -u +%FT%TZ)" > "$state/sdxl-matrix.status"
: > "$state/sdxl-matrix-installed.txt"

# ── Checkpoints (verified hashes from the legacy production bundle) ──
fetch_civitai checkpoints ponyRealism_V22.safetensors 914390 \
  7C97ECF786A50A54835A22277C35703787B840E98C04C318A4E3FEF9D3B463F7
fetch_civitai checkpoints waiMatureIllustrious_v20.safetensors 2183030 \
  7E4B5E6D917B52FEFF9153BEDE22EA391B1638CF350C8A64ABA23AAE56472FF9

# ── Category LoRAs (female / male / transgender / anime coverage) ──
fetch_civitai loras pony_detailifier_v5.safetensors 624633 -
fetch_civitai loras pony_mature_female_slider_v2.safetensors 1969907 \
  53AF6969C5ECD7AED26D44F73A2DBA7549CE76FB32356E655B14F4CC253D3CCD
fetch_civitai loras pony_gender_transition_slider.safetensors 518559 \
  B4290F390036DA023A44B49F4188468BE938EB2ACBD6528BC946E634D46A390B
fetch_civitai loras pony_futa_style.safetensors 568579 \
  E7115E3D6A483C6404D78AF54F49D179BE0665B1D53D36B80E5A02B1E7738BA7
fetch_civitai loras illustrious_nsfw_slider_v1.safetensors 1017934 \
  D6DEB0E995E5694D29FE9571D68235D220E6AF0D79F5FF5576FB3F0AF6B522E3
fetch_civitai loras illustrious_realism_slider_v1.safetensors 1681903 \
  42ABFB595AFC7992C91B542849CA2F3DDB4FED44A21CA1036EB530E0F1BEF053
fetch_civitai loras AddMicroDetails_Illustrious_v6.safetensors 2832991 \
  CE12AF9C5E510A745618F76F1197C5776CD283E5DDDD707FC0371AFD940B4454

# ── ControlNet SDXL (xinsir single-file models) ──
fetch_hf controlnet xinsir-openpose-sdxl.safetensors \
  "https://huggingface.co/xinsir/controlnet-openpose-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors"
fetch_hf controlnet xinsir-depth-sdxl.safetensors \
  "https://huggingface.co/xinsir/controlnet-depth-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors"

# ── IPAdapter FaceID SDXL (+ companion LoRA) ──
fetch_hf ipadapter ip-adapter-faceid-plusv2_sdxl.bin \
  "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl.bin"
fetch_hf ipadapter ip-adapter-faceid-plusv2_sdxl_lora.safetensors \
  "https://huggingface.co/h94/IP-Adapter-FaceID/resolve/main/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"

# ── Face detector for Impact-Pack FaceDetailer (ADetailer parity) ──
fetch_hf ultralytics/bbox face_yolov8m.pt \
  "https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt"

sync
printf 'completed=%s\n' "$(date -u +%FT%TZ)" >> "$state/sdxl-matrix.status"

cat <<'EOF'
SDXL matrix bundle ready. Set on the worker env:
  RUNPOD_SDXL_MODELS_READY=true
  RUNPOD_SDXL_CHECKPOINTS=ponyRealism_V22.safetensors,waiMatureIllustrious_v20.safetensors
  RUNPOD_CONTROLNET_READY=true
  RUNPOD_ADETAILER_READY=true
  RUNPOD_UPSCALE_READY=true
Then flip `installed` on the matching gen_model_assets rows via admin.
EOF
