#!/usr/bin/env bash
# Provision the FLUX identity models on an attached RunPod network volume.
# Custom nodes are intentionally installed by runpod/comfyui-worker/Dockerfile.
set -euo pipefail

find_volume_root() {
  for candidate in /runpod-volume /workspace /workspace/runpod-volume; do
    if [ -d "$candidate/models" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  printf '%s\n' /workspace
}

ROOT="${VOLUME_ROOT:-$(find_volume_root)}"
IP_DIR="$ROOT/models/ipadapter-flux"
SIGLIP_DIR="$ROOT/models/clip_vision/siglip-so400m-patch14-384"
IP_FILE="$IP_DIR/ip-adapter.bin"
IP_PART="$IP_FILE.part"

mkdir -p "$IP_DIR" "$SIGLIP_DIR"

if [ "$(stat -c%s "$IP_FILE" 2>/dev/null || printf 0)" -lt 5000000000 ]; then
  echo "Downloading FLUX IP-Adapter (about 5.3 GB)..."
  wget -c -O "$IP_PART" \
    "https://huggingface.co/InstantX/FLUX.1-dev-IP-Adapter/resolve/main/ip-adapter.bin?download=true"
  test "$(stat -c%s "$IP_PART")" -ge 5000000000
  mv "$IP_PART" "$IP_FILE"
else
  echo "FLUX IP-Adapter already present."
fi

if [ "$(stat -c%s "$SIGLIP_DIR/model.safetensors" 2>/dev/null || printf 0)" -lt 3000000000 ]; then
  if ! command -v hf >/dev/null 2>&1; then
    python -m pip install --no-cache-dir "huggingface_hub[cli]"
  fi
  echo "Downloading SigLIP vision encoder (about 3.5 GB)..."
  hf download google/siglip-so400m-patch14-384 --local-dir "$SIGLIP_DIR"
else
  echo "SigLIP already present."
fi

test "$(stat -c%s "$IP_FILE")" -ge 5000000000
test "$(stat -c%s "$SIGLIP_DIR/model.safetensors")" -ge 3000000000

echo
echo "FLUX identity models ready:"
ls -lh "$IP_FILE" "$SIGLIP_DIR/model.safetensors"
echo
echo "Build runpod/comfyui-worker/Dockerfile and use that image for the endpoint."
echo "Network-volume custom_nodes are not loaded by the official serverless worker."
