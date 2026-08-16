#!/usr/bin/env bash
# SoulMate9 SDXL-Pro worker entrypoint wrapper.
#
# Links network-volume model directories that the official worker's
# extra_model_paths.yaml does NOT map (ultralytics for Impact-Pack's
# UltralyticsDetectorProvider, ipadapter for IPAdapter_plus FaceID),
# then hands over to the official /start.sh untouched.
set -u

VOL_MODELS="/runpod-volume/models"

link_vol_dir() {
  local vol_sub="$1" link_path="$2"
  if [ -d "$VOL_MODELS/$vol_sub" ]; then
    # Replace an empty build-time dir with a symlink to the volume dir.
    if [ -e "$link_path" ] && [ ! -L "$link_path" ]; then
      if [ -z "$(ls -A "$link_path" 2>/dev/null)" ]; then
        rmdir "$link_path" 2>/dev/null || true
      else
        echo "sdxl-pro: $link_path not empty, leaving untouched"
        return 0
      fi
    fi
    ln -sfn "$VOL_MODELS/$vol_sub" "$link_path"
    echo "sdxl-pro: linked $link_path -> $VOL_MODELS/$vol_sub"
  else
    echo "sdxl-pro: volume dir $VOL_MODELS/$vol_sub missing, skip link"
  fi
}

mkdir -p /comfyui/models
link_vol_dir ultralytics /comfyui/models/ultralytics
link_vol_dir ipadapter /comfyui/models/ipadapter
link_vol_dir insightface /comfyui/models/insightface

# IPAdapter_plus loads the FaceID Plus V2 lora from the "loras" folder, but
# the bundle installer stores it next to the ipadapter model. Bridge it with a
# symlink so IPAdapterUnifiedLoader(preset=FACEID PLUS V2) finds it.
FACEID_LORA="$VOL_MODELS/ipadapter/ip-adapter-faceid-plusv2_sdxl_lora.safetensors"
if [ -f "$FACEID_LORA" ]; then
  mkdir -p /comfyui/models/loras
  ln -sfn "$FACEID_LORA" /comfyui/models/loras/ip-adapter-faceid-plusv2_sdxl_lora.safetensors
  echo "sdxl-pro: linked faceid lora into /comfyui/models/loras"
fi

exec /start.sh
