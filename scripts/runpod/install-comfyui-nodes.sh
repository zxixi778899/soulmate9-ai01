#!/bin/bash
# SoulMate AI ComfyUI 节点批量安装脚本
# 用于 RunPod Dockerfile 自动安装

set -ex

COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"
RUNPOD_VOLUME="/runpod-volume"

echo "🚀 Starting ComfyUI node installation for SoulMate AI..."

# 检查 Python 路径
if [ ! -d "/opt/venv" ]; then
  echo "❌ Error: /opt/venv not found. This should be from runpod/worker-comfyui base image."
  exit 1
fi

export PATH="/opt/venv/bin:$PATH"
export PIP_NO_INPUT=1

# ============================================
# 1. IP-Adapter Flux (Shakker Labs)
# ============================================
echo "📦 Installing ComfyUI-IPAdapter-Flux..."
if [ ! -d "$CUSTOM_NODES/comfyui-ipadapter-flux" ]; then
  git clone --depth 1 https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git \
    "$CUSTOM_NODES/comfyui-ipadapter-flux"
  
  python -m pip install --no-cache-dir \
    -r "$CUSTOM_NODES/comfyui-ipadapter-flux/requirements.txt"
  
  # 兼容补丁
  sed -i "s/self.flipped_img_txt = original_block.flipped_img_txt/self.flipped_img_txt = getattr(original_block, 'flipped_img_txt', False)/" \
    "$CUSTOM_NODES/comfyui-ipadapter-flux/flux/layers.py"
  
  sed -i 's/^    control=None,$/    control=None,\n    timestep_zero_index=None,/' \
    "$CUSTOM_NODES/comfyui-ipadapter-flux/utils.py"
fi

# ============================================
# 2. ControlNet & Preprocessors
# ============================================
echo "📦 Installing ControlNet nodes..."

# SD WebUI ControlNet
if [ ! -d "$CUSTOM_NODES/sd-webui-controlnet" ]; then
  git clone --branch v2 https://github.com/Mikubill/sd-webui-controlnet.git \
    "$CUSTOM_NODES/sd-webui-controlnet" || \
  git clone https://github.com/Mikubill/sd-webui-controlnet.git \
    "$CUSTOM_NODES/sd-webui-controlnet"
fi

# ControlNet 预处理器模型下载脚本
if [ ! -f "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh" ]; then
  mkdir -p "$RUNPOD_VOLUME/models/controlnet/preprocessors"
  
  cat > "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh" << 'EOF'
#!/bin/bash
# ControlNet 预处理器模型批量下载

PREPROCESSOR_DIR="$RUNPOD_VOLUME/models/controlnet/preprocessors"
mkdir -p "$PREPROCESSOR_DIR"

echo "Downloading OpenPose models..."
wget https://huggingface.co/yzd-v/DWPose/resolve/main/openpose/full.yaml \
  -O "$PREPROCESSOR_DIR/full.yaml" --quiet

wget https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth \
  -O "$PREPROCESSOR_DIR/model.pth" --quiet

echo "✅ OpenPose models downloaded"

echo "Installing ultralytics for YOLO..."
python -m pip install --no-cache-dir ultralytics==8.3.0 --quiet

echo "All preprocessors installed!"
EOF
  
  chmod +x "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh"
fi

# ============================================
# 3. ADetailer
# ============================================
echo "📦 Installing ADetailer..."

if [ ! -d "$CUSTOM_NODES/ComfyUI-ADetailer" ]; then
  git clone https://github.com/Gourieff/ComfyUI-ADetailer.git \
    "$CUSTOM_NODES/ComfyUI-ADetailer"
fi

# ADetailer 检测模型
if [ ! -f "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh" ]; then
  mkdir -p "$RUNPOD_VOLUME/models/adetailer/checkpoints"
  
  cat > "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh" << 'EOF'
#!/bin/bash
# ADetailer 检测模型下载

MODEL_DIR="$RUNPOD_VOLUME/models/adetailer/checkpoints"
mkdir -p "$MODEL_DIR"

echo "Downloading face detection models..."
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-face.pt \
  -O "$MODEL_DIR/yolov8n-face.pt" --quiet

wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8m-face.pt \
  -O "$MODEL_DIR/yolov8m-face.pt" --quiet

wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8l-face.pt \
  -O "$MODEL_DIR/yolov8l-face.pt" --quiet

echo "Downloading hand detection models..."
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8n-hand.pt \
  -O "$MODEL_DIR/yolov8n-hand.pt" --quiet

wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8m-hand.pt \
  -O "$MODEL_DIR/yolov8m-hand.pt" --quiet

echo "✅ ADetailer models downloaded"
EOF
  
  chmod +x "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh"
fi

# ============================================
# 4. Upscaler Models
# ============================================
echo "📦 Installing upscaler models..."

if [ ! -f "$RUNPOD_VOLUME/models/upscale/models.sh" ]; then
  mkdir -p "$RUNPOD_VOLUME/models/upscale/models"
  
  cat > "$RUNPOD_VOLUME/models/upscale/models.sh" << 'EOF'
#!/bin/bash
# Upscaler 模型批量下载

UPSCALE_DIR="$RUNPOD_VOLUME/models/upscale/models"
mkdir -p "$UPSCALE_DIR"

echo "Downloading RealESRGAN models..."
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.1/RealESRGAN_x4plus.pth \
  -O "$UPSCALE_DIR/RealESRGAN_x4plus.pth" --quiet

wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.2/RealESRGAN_x2plus.pth \
  -O "$UPSCALE_DIR/RealESRGAN_x2plus.pth" --quiet

echo "Downloading ESRGAN models..."
wget https://github.com/xinntao/ESRGAN/releases/download/v0.1.0/ESRGAN_x4.pth \
  -O "$UPSCALE_DIR/ESRGAN_x4.pth" --quiet

echo "Downloading 4x-UltraSharp..."
wget https://huggingface.co/ultimatheist/ultrasharp-upscalers/resolve/main/4x-UltraSharp.pth \
  -O "$UPSCALE_DIR/4x-UltraSharp.pth" --quiet

echo "✅ Upscaler models downloaded"
EOF
  
  chmod +x "$RUNPOD_VOLUME/models/upscale/models.sh"
fi

# ============================================
# 5. Flux Enhancement Nodes
# ============================================
echo "📦 Installing Flux enhancement nodes..."

# KJNodes (采样器优化、实用工具)
if [ ! -d "$CUSTOM_NODES/ComfyUI-KJNodes" ]; then
  git clone --depth 1 https://github.com/kijai/ComfyUI-KJNodes.git \
    "$CUSTOM_NODES/ComfyUI-KJNodes"
fi

# ImageMosaic (多图合成)
if [ ! -d "$CUSTOM_NODES/ComfyUI-Image-Mosaic" ]; then
  git clone --depth 1 https://github.com/city96/ComfyUI-Image-Mosaic.git \
    "$CUSTOM_NODES/ComfyUI-Image-Mosaic"
fi

# Flex Lora Manager (LoRA 管理增强)
if [ ! -d "$CUSTOM_NODES/ComfyUI-Flex-Lora-Manager" ]; then
  git clone --branch main https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager.git \
    "$CUSTOM_NODES/ComfyUI-Flex-Lora-Manager"
fi

# ============================================
# 6. Python Dependencies
# ============================================
echo "📦 Installing common Python dependencies..."

python -m pip install --no-cache-dir \
  torch-sampler==1.0.3 \
  opencv-python-headless==4.8.0.74 \
  Pillow==10.2.0 \
  einops==0.7.0 \
  numpy>=1.24,<2.0 \
  onnxruntime-gpu==1.18.0 \
  scipy==1.11.4 \
  scikit-image==0.21.0 \
  --quiet

# ============================================
# 7. Symlink Model Directories
# ============================================
echo "🔗 Creating model symlinks..."

# IP-Adapter 模型链接
mkdir -p "$COMFYUI/models/ipadapter-flux"
if [ ! -L "$COMFYUI/models/ipadapter-flux" ]; then
  ln -sfn "$RUNPOD_VOLUME/models/ipadapter-flux" "$COMFYUI/models/ipadapter-flux"
fi

mkdir -p "$COMFYUI/models/clip_vision"
if [ ! -L "$COMFYUI/models/clip_vision" ]; then
  ln -sfn "$RUNPOD_VOLUME/models/clip_vision/siglip-so400m-patch14-384" \
    "$COMFYUI/models/clip_vision/siglip-so400m-patch14-384"
fi

# ControlNet 预处理器链接
mkdir -p "$COMFYUI/models/controlnet"
if [ ! -L "$COMFYUI/models/controlnet" ]; then
  ln -sfn "$RUNPOD_VOLUME/models/controlnet/preprocessors" \
    "$COMFYUI/models/controlnet/preprocessors"
fi

# ADetailer 模型链接
mkdir -p "$COMFYUI/models/adetailer"
if [ ! -L "$COMFYUI/models/adetailer" ]; then
  ln -sfn "$RUNPOD_VOLUME/models/adetailer/checkpoints" \
    "$COMFYUI/models/adetailer/checkpoints"
fi

# Upscaler 模型链接
mkdir -p "$COMFYUI/models/upscale"
if [ ! -L "$COMFYUI/models/upscale" ]; then
  ln -sfn "$RUNPOD_VOLUME/models/upscale/models" \
    "$COMFYUI/models/upscale/models"
fi

# ============================================
# 8. Cache Cleanup
# ============================================
echo "🧹 Cleaning up caches..."

python -m pip cache purge 2>/dev/null || true
rm -rf /tmp/* 2>/dev/null || true

# ============================================
# Done!
# ============================================
echo ""
echo "✨ ✅ All ComfyUI nodes installed successfully!"
echo ""
echo "Installed nodes:"
echo "  ✅ ComfyUI-IPAdapter-Flux"
echo "  ✅ sd-webui-controlnet"
echo "  ✅ ComfyUI-ADetailer"
echo "  ✅ ComfyUI-KJNodes"
echo "  ✅ ComfyUI-Image-Mosaic"
echo "  ✅ ComfyUI-Flex-Lora-Manager"
echo ""
echo "Model directories linked to /runpod-volume/models/"
echo "Download and install additional models using scripts in /runpod-volume/models/"
echo ""
echo "You can now start ComfyUI!"
echo ""
