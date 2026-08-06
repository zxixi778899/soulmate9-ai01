#!/usr/bin/env bash
# SoulMate essential LoRA downloader (cd1 + cd2, 15 files)
# Run inside the RunPod pod that mounts /runpod-volume.
#
#   CIVITAI_TOKEN=xxx bash scripts/runpod/download-essential.sh
#
# Downloads to ${LORA_DIR:-/runpod-volume/models/loras}, verifies count and
# writes soulmate-lora-inventory.env (RUNPOD_INSTALLED_LORAS_FLUX/PONY/ILLUSTRIOUS).
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

# ── cd1: FLUX (11) ─────────────────────────────────────────────
dl flux_style_photoreal_v1.safetensors https://civitai.com/api/download/models/1084957
dl flux_detail_skin_v1.safetensors https://civitai.com/api/download/models/827325
dl flux_detail_skin_nplastic_v1.safetensors https://civitai.com/api/download/models/1301668
dl flux_detail_hands_v1.safetensors https://civitai.com/api/download/models/1003317
dl flux_body_curvy_v1.safetensors https://civitai.com/api/download/models/1668530
dl flux_body_pear_v1.safetensors https://civitai.com/api/download/models/1276427
dl flux_pose_nsfw_dynamic_v1.safetensors https://civitai.com/api/download/models/746602
dl flux_outfit_lingerie_v1.safetensors https://civitai.com/api/download/models/869894
dl flux_outfit_bikini_v1.safetensors https://civitai.com/api/download/models/1184191
dl flux_outfit_latex_v1.safetensors https://civitai.com/api/download/models/734230
dl flux_style_cinematic_v1.safetensors https://civitai.com/api/download/models/953083
# ── cd2: Pony / Illustrious (4) ────────────────────────────────
dl pony_detailifier_v5.safetensors https://civitai.com/api/download/models/624633
dl AddMicroDetails_Illustrious_v6.safetensors https://civitai.com/api/download/models/2832991
dl StS-Illustrious-Detail-Slider-v1.0.safetensors https://civitai.com/api/download/models/1122976
dl BackgroundDetailerV3-000004.safetensors https://civitai.com/api/download/models/726791

echo "总数: $(ls ./*.safetensors 2>/dev/null | wc -l)"

# ── Runtime inventory (env) ────────────────────────────────────
join_csv() { local IFS=,; echo "$*"; }
FLUX_LIST=$(ls ./flux_*.safetensors 2>/dev/null | sed 's#^\./##' | sort)
PONY_LIST=$(ls ./pony_*.safetensors ./BackgroundDetailer*.safetensors 2>/dev/null | sed 's#^\./##' | sort)
ILLUS_LIST=$(ls ./AddMicroDetails*.safetensors ./StS-*.safetensors 2>/dev/null | sed 's#^\./##' | sort)
cat > "$DIR/soulmate-lora-inventory.env" <<EOF
RUNPOD_INSTALLED_LORAS_FLUX=$(join_csv $FLUX_LIST)
RUNPOD_INSTALLED_LORAS_PONY=$(join_csv $PONY_LIST)
RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS=$(join_csv $ILLUS_LIST)
EOF
echo "inventory -> $DIR/soulmate-lora-inventory.env"
cat "$DIR/soulmate-lora-inventory.env"
