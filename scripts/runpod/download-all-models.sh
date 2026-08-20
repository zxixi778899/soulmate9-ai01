#!/bin/bash
# SoulMate AI - Model Download Scripts
# 用于 RunPod 网络卷中的模型下载

set -ex

echo "🚀 Starting model download for SoulMate AI..."

# ============================================
# CONTROLNET PREPROCESSORS
# ============================================
mkdir -p /runpod-volume/models/controlnet/preprocessors
PREPROCESSOR_DIR="/runpod-volume/models/controlnet/preprocessors"

echo "📦 Downloading ControlNet preprocessors..."

cd "$PREPROCESSOR_DIR" || exit 1

# OpenPose models (DW Pose)
echo "Downloading OpenPose models..."
wget https://huggingface.co/yzd-v/DWPose/resolve/main/openpose/full.yaml \
  -O openpose-full.yaml --quiet

wget https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth \
  -O dw-ocr.pth --quiet

echo "✅ OpenPose models downloaded"

# ============================================
# ADETAILER CHECKPOINTS
# ============================================
mkdir -p /runpod-volume/models/adetailer/checkpoints
CHECKPOINT_DIR="/runpod-volume/models/adetailer/checkpoints"

echo "📦 Downloading ADetailer checkpoints..."

cd "$CHECKPOINT_DIR" || exit 1

# Face detection models
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-face.pt \
  -O yolov8n-face.pt --quiet

wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8m-face.pt \
  -O yolov8m-face.pt --quiet

# Hand detection models  
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8n-hand.pt \
  -O yolov8n-hand.pt --quiet

wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8m-hand.pt \
  -O yolov8m-hand.pt --quiet

echo "✅ ADetailer checkpoints downloaded"

# ============================================
# UPSCALER MODELS
# ============================================
mkdir -p /runpod-volume/models/upscale/models
UPSCALE_DIR="/runpod-volume/models/upscale/models"

echo "📦 Downloading upscaler models..."

cd "$UPSCALE_DIR" || exit 1

# RealESRGAN models
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.1/RealESRGAN_x4plus.pth \
  -O RealESRGAN_x4plus.pth --quiet

wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.2/RealESRGAN_x2plus.pth \
  -O RealESRGAN_x2plus.pth --quiet

# ESRGAN
wget https://github.com/xinntao/ESRGAN/releases/download/v0.1.0/ESRGAN_x4.pth \
  -O ESRGAN_x4.pth --quiet

# UltraSharp (for anime/art)
wget https://huggingface.co/ultimatheist/ultrasharp-upscalers/resolve/main/4x-UltraSharp.pth \
  -O 4x-UltraSharp.pth --quiet

# BSRGAN (fast)
wget https://github.com/csz-o/BSRGAN/releases/download/v1.0/BSRGANx4.pth \
  -O BSRGAN_x4.pth --quiet

echo "✅ Upscaler models downloaded"

# ============================================
# IP-ADAPTER MODELS (if not present in base image)
# ============================================
mkdir -p /runpod-volume/models/ipadapter-flux
IPADAPTER_DIR="/runpod-volume/models/ipadapter-flux"

echo "📦 Checking IP-Adapter models..."

cd "$IPADAPTER_DIR" || exit 1

# SigLIP vision encoder (for IP-Adapter Flux)
if [ ! -f "siglip-so400m-patch14-384.tar.gz" ]; then
  wget https://huggingface.co/Shakker-Labs/IP-Adapter-Flux-siglip/resolve/main/siglip-so400m-patch14-384.tar.gz \
    -O siglip-so400m-patch14-384.tar.gz --quiet
  
  tar -xzf siglip-so400m-patch14-384.tar.gz
  
  rm siglip-so400m-patch14-384.tar.gz
fi

echo "✅ IP-Adapter models verified"

# ============================================
# Done!
# ============================================
echo ""
echo "✨ All models downloaded successfully!"
echo ""
echo "Installed models:"
echo "  🎭 ControlNet Preprocessors: $PREPROCESSOR_DIR"
echo "  🔍 ADetailer Checkpoints: $CHECKPOINT_DIR"
echo "  🔍 Upscaler Models: $UPSCALE_DIR"
echo "  👤 IP-Adapter Models: $IPADAPTER_DIR"
echo ""
echo "Custom nodes are linked automatically at runtime."
echo ""
