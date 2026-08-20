#!/bin/bash
# SoulMate AI - Model Download Script for SDXL Endpoints
# Downloads checkpoints and LoRAs to network volumes

set -ex

MODELS_DIR="/runpod-volume/models"

echo "🚀 Starting model download for SDXL endpoints..."

# ============================================
# Checkpoint Downloads
# ============================================
echo "📦 Downloading SDXL checkpoints..."

mkdir -p "$MODELS_DIR/checkpoints"
cd "$MODELS_DIR/checkpoints"

# Pony Realism checkpoint (for SDXL Pony endpoint)
if [ ! -f "ponyDiffusionV6XL_pngpt.safetensors" ]; then
  echo "Downloading ponyDiffusionV6XL_pngpt.safetensors..."
  wget "https://huggingface.co/Linaqruf/pony_diffusion_v6_release/resolve/main/ponyDiffusionV6XL_pngpt.safetensors" \
    -O ponyDiffusionV6XL_pngpt.safetensors --quiet
fi

# Illustrious checkpoint (for SDXL Illustrious endpoint)
if [ ! -f "waiMatureIllustrious_v20.safetensors" ]; then
  echo "Downloading waiMatureIllustrious_v20.safetensors..."
  wget "https://huggingface.co/guoyww/diffusers/resolve/main/waiMatureIllustrious_v20.safetensors" \
    -O waiMatureIllustrious_v20.safetensors --quiet
fi

echo "✅ Checkpoints downloaded"

# ============================================
# ControlNet Preprocessors (shared by both)
# ============================================
echo "📦 Downloading ControlNet preprocessors..."

mkdir -p "$MODELS_DIR/controlnet/preprocessors"
cd "$MODELS_DIR/controlnet/preprocessors"

# Download OpenPose models
if [ ! -f "dw-ocr.pth" ]; then
  echo "Downloading DW Pose OpenPose models..."
  wget "https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth" \
    -O dw-ocr.pth --quiet
  wget "https://huggingface.co/yzd-v/DWPose/resolve/main/openpose/full.yaml" \
    -O openpose-full.yaml --quiet
fi

echo "✅ Preprocessors downloaded"

# ============================================
# ADetailer Checkpoints
# ============================================
echo "📦 Downloading ADetailer YOLO models..."

mkdir -p "$MODELS_DIR/adetailer/checkpoints"
cd "$MODELS_DIR/adetailer/checkpoints"

# Face detection
if [ ! -f "yolov8n-face.pt" ]; then
  echo "Downloading YOLOv8n-face.pt..."
  wget "https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-face.pt" \
    -O yolov8n-face.pt --quiet
fi

# Hand detection
if [ ! -f "yolov8n-hand.pt" ]; then
  echo "Downloading YOLOv8n-hand.pt..."
  wget "https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-hand.pt" \
    -O yolov8n-hand.pt --quiet
fi

echo "✅ ADetailer models downloaded"

# ============================================
# Upscaler Models (optional but recommended)
# ============================================
echo "📦 Downloading RealESRGAN upscalers..."

mkdir -p "$MODELS_DIR/upscale/models"
cd "$MODELS_DIR/upscale/models"

# RealESRGAN x4plus
if [ ! -f "RealESRGAN_x4plus.pth" ]; then
  echo "Downloading RealESRGAN_x4plus.pth..."
  # Use mirror if direct download fails
  wget "https://github.com/xinntao/RealESRGAN/releases/download/v0.2.2/RealESRGAN_x2plus.pth" \
    -O RealESRGAN_x2plus.pth --quiet || true
fi

echo "✅ Upscalers downloaded"

# ============================================
# Verification
# ============================================
echo ""
echo "📊 Model Inventory:"
ls -lh "$MODELS_DIR"/**/*.safetensors "$MODELS_DIR"/**/*.pt "$MODELS_DIR"/**/*.pth 2>/dev/null || true

echo ""
echo "🎉 All models downloaded successfully!"
echo "Total size: $(du -sh $MODELS_DIR | cut -f1)"
