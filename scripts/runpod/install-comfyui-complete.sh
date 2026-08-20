# SoulMate AI - ComfyUI Node and Model Installation Script
# 完整的模型安装脚本

#!/bin/bash
set -ex

COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"
RUNPOD_VOLUME="/runpod-volume"
MODELS_DIR="$RUNPOD_VOLUME/models"

echo "🚀 Starting SoulMate AI ComfyUI Setup..."

# ============================================
# 1. Install Core Nodes
# ============================================
echo "📦 Installing Core ComfyUI Nodes..."

cd "$CUSTOM_NODES" || mkdir -p "$CUSTOM_NODES"

# IP-Adapter Flux (Already installed via Dockerfile)
if [ ! -d "$CUSTOM_NODES/comfyui-ipadapter-flux" ]; then
  git clone --depth 1 https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git
  python -m pip install transformers==4.45.0 huggingface-hub<1.0 --quiet
fi

# ControlNet
if [ ! -d "$CUSTOM_NODES/sd-webui-controlnet" ]; then
  git clone --branch v2 --depth 1 https://github.com/Mikubill/sd-webui-controlnet.git
fi

# ADetailer
if [ ! -d "$CUSTOM_NODES/ComfyUI-ADetailer" ]; then
  git clone --depth 1 https://github.com/Gourieff/ComfyUI-ADetailer.git
fi

# KJNodes (Utility nodes)
if [ ! -d "$CUSTOM_NODES/ComfyUI-KJNodes" ]; then
  git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git
fi

# Flex Lora Manager
if [ ! -d "$CUSTOM_NODES/ComfyUI-Flex-Lora-Manager" ]; then
  git clone --depth 1 https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager.git
fi

# ============================================
# 2. Install Python Dependencies
# ============================================
echo "🐍 Installing Python Dependencies..."

python -m pip install --no-cache-dir \
  ultralytics==8.3.0 \
  opencv-python-headless==4.8.0.74 \
  torch-sampler==1.0.3 \
  einops==0.7.0 \
  numpy>=1.24,<2.0 \
  Pillow==10.2.0 \
  --quiet

# ============================================
# 3. Create Directory Structure
# ============================================
echo "📁 Creating Model Directories..."

mkdir -p "$MODELS_DIR/ipadapter-flux"
mkdir -p "$MODELS_DIR/clip_vision/siglip-so400m-patch14-384"
mkdir -p "$MODELS_DIR/controlnet/preprocessors"
mkdir -p "$MODELS_DIR/adetailer/checkpoints"
mkdir -p "$MODELS_DIR/upscale/models"
mkdir -p "$MODELS_DIR/checkpoints"

# ============================================
# 4. Symlink Model Directories
# ============================================
echo "🔗 Setting up symlinks..."

# IP-Adapter
ln -sfn "$MODELS_DIR/ipadapter-flux" "$COMFYUI_PATH/models/ipadapter-flux"
ln -sfn "$MODELS_DIR/clip_vision/siglip-so400m-patch14-384" \
  "$COMFYUI_PATH/models/clip_vision/siglip-so400m-patch14-384"

# ControlNet Preprocessors
ln -sfn "$MODELS_DIR/controlnet/preprocessors" \
  "$COMFYUI_PATH/models/controlnet/preprocessors"

# ADetailer Checkpoints  
ln -sfn "$MODELS_DIR/adetailer/checkpoints" \
  "$COMFYUI_PATH/models/adetailer/checkpoints"

# Upscaler Models
ln -sfn "$MODELS_DIR/upscale/models" \
  "$COMFYUI_PATH/models/upscale/models"

# ============================================
# 5. Download OpenPose Preprocessor
# ============================================
echo "📥 Downloading ControlNet Preprocessors..."

cd "$MODELS_DIR/controlnet/preprocessors"

# Download from official DWPose repository
wget --quiet --show-progress \
  https://huggingface.co/IDEA-Research/DWPose/resolve/main/yolov8l-pose.yaml \
  -O openpose-yolov8l.yaml

wget --quiet --show-progress \
  https://huggingface.co/IDEA-Research/DWPose/resolve/main/dw-oss.zip \
  -O dw-oss.zip

unzip -q dw-oss.zip && rm dw-oss.zip

# Copy YAML files
cp dw-oss/*.yaml ./ 2>/dev/null || true

echo "✅ OpenPose preprocessors ready"

# ============================================
# 6. Download ADetailer Checkpoints
# ============================================
echo "📥 Downloading ADetailer Checkpoints..."

cd "$MODELS_DIR/adetailer/checkpoints"

# Face detection models
wget --quiet --show-progress \
  https://huggingface.co/bottomkeys/yolov8n-face/resolve/main/model.pt \
  -O yolov8n-face.pt

wget --quiet --show-progress \
  https://huggingface.co/bottomkeys/yolov8m-face/resolve/main/model.pt \
  -O yolov8m-face.pt

# Hand detection models
wget --quiet --show-progress \
  https://huggingface.co/bottomkeys/yolov8n-hand/resolve/main/model.pt \
  -O yolov8n-hand.pt

echo "✅ ADetailer checkpoints downloaded ($(du -sh . | cut -f1))"

# ============================================
# 7. Download Upscaler Models
# ============================================
echo "📥 Downloading Upscaler Models..."

cd "$MODELS_DIR/upscale/models"

# RealESRGAN models
wget --quiet --show-progress \
  https://github.com/xinntao/RealESRGAN/releases/download/v0.2.1/RealESRGAN_x4plus.pth \
  -O RealESRGAN_x4plus.pth 2>/dev/null || \
  wget --quiet --show-progress \
  https://huggingface.co/xinntao/realesrgan-x4/resolve/main/RealESRGAN_x4plus.pth \
  -O RealESRGAN_x4plus.pth

# ESRGAN
wget --quiet --show-progress \
  https://github.com/xinntao/ESRGAN/releases/download/v0.1.0/ESRGAN_x4.pth \
  -O ESRGAN_x4.pth

# UltraSharp (Anime/AI Art)
wget --quiet --show-progress \
  https://huggingface.co/ultimatheist/ultrasharp-upscalers/resolve/main/4x-UltraSharp.pth \
  -O 4x-UltraSharp.pth

echo "✅ Upscaler models downloaded ($(du -sh . | cut -f1))"

# ============================================
# 8. Download SigLIP IP-Adapter Model
# ============================================
echo "📥 Downloading SigLIP Vision Encoder..."

cd "$MODELS_DIR/clip_vision/siglip-so400m-patch14-384"

if [ ! -f "siglip-so400m-patch14-384.tar.gz" ]; then
  wget --quiet --show-progress \
    https://huggingface.co/Shakker-Labs/IP-Adapter-Flux-siglip/resolve/main/siglip-so400m-patch14-384.tar.gz \
    -O siglip-so400m-patch14-384.tar.gz
  
  tar -xzf siglip-so400m-patch14-384.tar.gz
  rm siglip-so400m-patch14-384.tar.gz
fi

echo "✅ SigLIP model installed"

# ============================================
# 9. Cleanup
# ============================================
echo "🧹 Cleaning up temporary files..."

# Remove downloads directory cache
rm -rf /tmp/* 2>/dev/null || true

# Purpip cache
python -m pip cache purge 2>/dev/null || true

# ============================================
# Done!
# ============================================
echo ""
echo "✨ ✅ All components installed successfully!"
echo ""
echo "Installed:"
echo "  🎭 IP-Adapter Flux (with SigLIP)"
echo "  🎭 SD WebUI ControlNet v2 (with OpenPose)"
echo "  🔍 ComfyUI-ADetailer (Face + Hand detectors)"
echo "  🖼 Upscaling (RealESRGAN, ESRGAN, UltraSharp)"
echo "  🛠 Utility nodes (KJNodes, Flex Lora)"
echo ""
echo "Total model size: $(du -sh $MODELS_DIR | cut -f1)"
echo ""
echo "You can now start ComfyUI!"
echo ""
