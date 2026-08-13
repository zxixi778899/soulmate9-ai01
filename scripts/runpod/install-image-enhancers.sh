#!/usr/bin/env bash
set -euo pipefail

# Run from the ComfyUI installation directory on the RunPod worker.
COMFY_ROOT="${COMFY_ROOT:-/workspace/ComfyUI}"
PYTHON_BIN="${PYTHON_BIN:-python}"
mkdir -p "$COMFY_ROOT/custom_nodes" "$COMFY_ROOT/models/controlnet" "$COMFY_ROOT/models/upscale_models" "$COMFY_ROOT/models/ultralytics/bbox"

clone_or_update() {
  local repo="$1" dir="$2"
  if [[ -d "$COMFY_ROOT/custom_nodes/$dir/.git" ]]; then
    git -C "$COMFY_ROOT/custom_nodes/$dir" pull --ff-only
  else
    git clone --depth 1 "https://github.com/$repo.git" "$COMFY_ROOT/custom_nodes/$dir"
  fi
  if [[ -f "$COMFY_ROOT/custom_nodes/$dir/requirements.txt" ]]; then
    "$PYTHON_BIN" -m pip install -r "$COMFY_ROOT/custom_nodes/$dir/requirements.txt"
  fi
}

clone_or_update XLabs-AI/x-flux-comfyui x-flux-comfyui
clone_or_update Fannovel16/comfyui_controlnet_aux comfyui_controlnet_aux
clone_or_update ltdrdata/ComfyUI-Impact-Pack ComfyUI-Impact-Pack

curl -L --fail --retry 3 -o "$COMFY_ROOT/models/controlnet/flux-depth-controlnet.safetensors" \
  "https://huggingface.co/XLabs-AI/flux-controlnet-collections/resolve/main/flux-depth-controlnet.safetensors"
curl -L --fail --retry 3 -o "$COMFY_ROOT/models/upscale_models/4x-UltraSharp.pth" \
  "https://huggingface.co/fofr/comfyui/resolve/main/upscale_models/4x-UltraSharp.pth"

cat <<'EOF'
Installed ControlNet (XLabs depth), Impact-Pack detailer nodes, and 4x-UltraSharp.
Set RUNPOD_CONTROLNET_READY=true, RUNPOD_ADETAILER_READY=true, RUNPOD_UPSCALE_READY=true
and restart ComfyUI before enabling the corresponding UI switches.
EOF
