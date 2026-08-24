#!/usr/bin/env bash
# SoulMate AI RunPod 卷清理和 Custom Nodes 安装脚本
# 用于在云端 RunPod 环境中运行

set -e

RUNPOD_VOLUME="/runpod-volume"
COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"

echo "🔧 Starting RunPod volume cleanup and node installation..."
echo ""

# ============================================
# 1. 检查目录结构
# ============================================
echo "📋 Checking volume structure..."
if [ ! -d "$RUNPOD_VOLUME" ]; then
    echo "❌ Error: $RUNPOD_VOLUME not found!"
    echo "Note: This script should be run inside the ComfyUI worker container"
    exit 1
fi

ls -la "$RUNPOD_VOLUME/"

echo ""
echo "🗑️  Cleaning up temporary files..."

# ============================================
# 2. 删除临时文件
# ============================================

# 删除 .tmp 文件
find "$RUNPOD_VOLUME" -name "*.tmp" -type f -delete 2>/dev/null || true
find "$RUNPOD_VOLUME" -name "*_tmp*" -type f -delete 2>/dev/null || true

# 删除备份文件 (*.bak, *.backup, *~)
find "$RUNPOD_VOLUME" \( -name "*.bak" -o -name "*.backup" -o -name "*~" \) -type f -delete 2>/dev/null || true

# 删除日志文件（如果不需要保留）
find "$RUNPOD_VOLUME" -name "*.log" -type f -mtime +1 -delete 2>/dev/null || true

# 删除空的临时目录
find "$RUNPOD_VOLUME" -type d -empty -delete 2>/dev/null || true

echo "✅ Temporary files cleaned"
echo ""

# ============================================
# 3. 检查已安装的 Custom Nodes
# ============================================
echo "📦 Checking installed Custom Nodes..."
echo ""

if [ -d "$CUSTOM_NODES" ]; then
    echo "Current Custom Nodes:"
    ls -1 "$CUSTOM_NODES/" 2>/dev/null || echo "  (empty)"
else
    echo "⚠️  $CUSTOM_NODES not found"
fi

echo ""
echo "📊 Checking for missing nodes from install-comfyui-nodes.sh..."
echo ""

# ============================================
# 4. 安装缺失的 Custom Nodes
# ============================================

export PATH="/opt/venv/bin:$PATH"
export PIP_NO_INPUT=1

install_node() {
    local repo_url="$1"
    local node_name="$2"
    
    if [ ! -d "$CUSTOM_NODES/$node_name" ]; then
        echo "📥 Installing $node_name..."
        git clone --depth 1 "$repo_url" "$CUSTOM_NODES/$node_name" || {
            echo "⚠️  Failed to install $node_name, skipping..."
            return 1
        }
        
        # 安装依赖
        if [ -f "$CUSTOM_NODES/$node_name/requirements.txt" ]; then
            echo "  Installing requirements..."
            python -m pip install --no-cache-dir -r "$CUSTOM_NODES/$node_name/requirements.txt" --quiet || true
        fi
        
        echo "✅ $node_name installed"
    else
        echo "✅ $node_name already installed"
    fi
}

# 1. IP-Adapter Flux (Shakker Labs) - 已有
install_node "https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git" "comfyui-ipadapter-flux"

# 2. ControlNet - 已有
if [ ! -d "$CUSTOM_NODES/sd-webui-controlnet" ]; then
    echo "📥 Installing sd-webui-controlnet v2..."
    git clone --branch v2 https://github.com/Mikubill/sd-webui-controlnet.git "$CUSTOM_NODES/sd-webui-controlnet" || \
    git clone https://github.com/Mikubill/sd-webui-controlnet.git "$CUSTOM_NODES/sd-webui-controlnet"
fi

# 3. ADetailer - 已有
install_node "https://github.com/Gourieff/ComfyUI-ADetailer.git" "ComfyUI-ADetailer"

# 4. KJNodes - 可能有
install_node "https://github.com/kijai/ComfyUI-KJNodes.git" "ComfyUI-KJNodes"

# 5. Image Mosaic - 可能有
install_node "https://github.com/city96/ComfyUI-Image-Mosaic.git" "ComfyUI-Image-Mosaic"

# 6. Flex Lora Manager - 可能有
install_node "https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager.git" "ComfyUI-Flex-Lora-Manager"

# ============================================
# 5. 额外重要的 Custom Nodes（可选）
# ============================================
echo ""
echo "🎯 Installing additional recommended nodes..."

# Impact Pack (必装 - 核心功能包)
if [ ! -d "$CUSTOM_NODES/ImpactPack" ]; then
    echo "📥 Installing ImpactPack..."
    git clone https://github.com/ltdrdata/ComfyUI-Impact-Pack.git "$CUSTOM_NODES/ImpactPack"
fi

# ComfyUI Manager (管理和更新节点)
if [ ! -d "$CUSTOM_NODES/ComfyUI-Manager" ]; then
    echo "📥 Installing ComfyUI-Manager..."
    git clone https://github.com/pythongosssss/ComfyUI-Manager.git "$CUSTOM_NODES/ComfyUI-Manager"
fi

# WAS Node Suite (实用工具集)
if [ ! -d "$CUSTOM_NODES/WAS-Node-Suite" ]; then
    echo "📥 Installing WAS-Node-Suite..."
    git clone https://github.com/BadCafé/was-node-suite-comfyui.git "$CUSTOM_NODES/WAS-Node-Suite"
fi

# ComfyUI-Custom-Scripts (PaulS 的高级功能)
if [ ! -d "$CUSTOM_NODES/comfyui-cu" ]; then
    echo "📥 Installing ComfyUI-Custom-Scripts..."
    git clone https://github.com/pythongosssss/ComfyUI-Custom-Scripts.git "$CUSTOM_NODES/comfyui-cu"
fi

# Easy Notes (注释节点)
if [ ! -d "$CUSTOM_NODES/easy-notes" ]; then
    echo "📥 Installing Easy-Nodes..."
    git clone https://github.com/nodelove/ComfyUI-Easy-Notes.git "$CUSTOM_NODES/easy-notes"
fi

#rgthree-comfy (工作流优化)
if [ ! -d "$CUSTOM_NODES/rgthree-comfy" ]; then
    echo "📥 Installing rgthree-comfy..."
    git clone https://github.com/rgthree/rgthree-comfy.git "$CUSTOM_NODES/rgthree-comfy"
fi

# ComfyUI_Fixed-Seed (固定种子)
if [ ! -d "$CUSTOM_NODES/ComfyUI_Fixed-Seed" ]; then
    echo "📥 Installing ComfyUI_Fixed-Seed..."
    git clone https://github.com/kijai/ComfyUI_Fixed-Seed.git "$CUSTOM_NODES/ComfyUI_Fixed-Seed"
fi

# InstLatexFF (节点检测)
if [ ! -d "$CUSTOM_NODES/InstLatexFF" ]; then
    echo "📥 Installing InstLatexFF..."
    git clone https://github.com/INSTILLATION/ComfyUI-InstLatexFF.git "$CUSTOM_NODES/InstLatexFF"
fi

echo ""

# ============================================
# 6. 下载额外的模型文件
# ============================================
echo "🔄 Downloading model scripts..."

# ADetailer 模型下载脚本
if [ ! -f "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh" ]; then
    mkdir -p "$RUNPOD_VOLUME/models/adetailer/checkpoints"
    cat > "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh" << 'EOFSCRIPT'
#!/bin/bash
MODEL_DIR="/runpod-volume/models/adetailer/checkpoints"
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8n-face.pt -O "$MODEL_DIR/yolov8n-face.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8m-face.pt -O "$MODEL_DIR/yolov8m-face.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-face-models/resolve/main/yolov8l-face.pt -O "$MODEL_DIR/yolov8l-face.pt" --quiet
echo "✅ Face models downloaded"
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8n-hand.pt -O "$MODEL_DIR/yolov8n-hand.pt" --quiet
wget https://huggingface.co/bottomkeys/yolov8-hand-models/resolve/main/yolov8m-hand.pt -O "$MODEL_DIR/yolov8m-hand.pt" --quiet
echo "✅ Hand models downloaded"
EOFSCRIPT
    chmod +x "$RUNPOD_VOLUME/models/adetailer/checkpoints.sh"
fi

# ControlNet 预处理器下载脚本
if [ ! -f "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh" ]; then
    mkdir -p "$RUNPOD_VOLUME/models/controlnet/preprocessors"
    cat > "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh" << 'EOFSCRIPT'
#!/bin/bash
PREPROCESSOR_DIR="/runpod-volume/models/controlnet/preprocessors"
wget https://huggingface.co/yzd-v/DWPose/resolve/main/openpose/full.yaml -O "$PREPROCESSOR_DIR/full.yaml" --quiet
wget https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth -O "$PREPROCESSOR_DIR/model.pth" --quiet
python -m pip install ultralytics==8.3.0 --quiet
echo "✅ Preprocessors configured"
EOFSCRIPT
    chmod +x "$RUNPOD_VOLUME/models/controlnet/preprocessors.sh"
fi

# Upscaler 模型下载脚本
if [ ! -f "$RUNPOD_VOLUME/models/upscale/models.sh" ]; then
    mkdir -p "$RUNPOD_VOLUME/models/upscale/models"
    cat > "$RUNPOD_VOLUME/models/upscale/models.sh" << 'EOFSCRIPT'
#!/bin/bash
UPSCALE_DIR="/runpod-volume/models/upscale/models"
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.1/RealESRGAN_x4plus.pth -O "$UPSCALE_DIR/RealESRGAN_x4plus.pth" --quiet
wget https://github.com/xinntao/RealESRGAN/releases/download/v0.2.2/RealESRGAN_x2plus.pth -O "$UPSCALE_DIR/RealESRGAN_x2plus.pth" --quiet
wget https://github.com/xinntao/ESRGAN/releases/download/v0.1.0/ESRGAN_x4.pth -O "$UPSCALE_DIR/ESRGAN_x4.pth" --quiet
wget https://huggingface.co/ultimatheist/ultrasharp-upscalers/resolve/main/4x-UltraSharp.pth -O "$UPSCALE_DIR/4x-UltraSharp.pth" --quiet
echo "✅ Upscaler models downloaded"
EOFSCRIPT
    chmod +x "$RUNPOD_VOLUME/models/upscale/models.sh"
fi

echo ""

# ============================================
# 7. 创建 Python 依赖清理工具
# ============================================
cat > "$RUNPOD_VOLUME/cleanup_cache.sh" << 'EOFSCRIPT'
#!/bin/bash
echo "Cleaning Python pip cache..."
python -m pip cache purge 2>/dev/null || true
echo "Removing temp files..."
rm -rf /tmp/* 2>/dev/null || true
echo "Cleanup complete!"
EOFSCRIPT
chmod +x "$RUNPOD_VOLUME/cleanup_cache.sh"

echo ""

# ============================================
# 8. 显示最终状态
# ============================================
echo "✨ ✅ Installation Complete!"
echo ""
echo "📦 Installed Custom Nodes:"
ls -1 "$CUSTOM_NODES/" 2>/dev/null | while read node; do
    echo "  ✅ $node"
done

echo ""
echo "📁 Model Directories:"
echo "  - IP-Adapter: $RUNPOD_VOLUME/models/ipadapter-flux"
echo "  - Clip Vision: $RUNPOD_VOLUME/models/clip_vision"
echo "  - ControlNet: $RUNPOD_VOLUME/models/controlnet/preprocessors"
echo "  - ADetailer: $RUNPOD_VOLUME/models/adetailer/checkpoints"
echo "  - Upscaler: $RUNPOD_VOLUME/models/upscale/models"

echo ""
echo "📝 Available Scripts:"
echo "  - $RUNPOD_VOLUME/models/adetailer/checkpoints.sh (download face/hand models)"
echo "  - $RUNPOD_VOLUME/models/controlnet/preprocessors.sh (download pose models)"
echo "  - $RUNPOD_VOLUME/models/upscale/models.sh (download upscaler models)"
echo "  - $RUNPOD_VOLUME/cleanup_cache.sh (clean pip cache)"

echo ""
echo "💡 Next Steps:"
echo "1. Run the model download scripts if you haven't yet:"
echo "   bash $RUNPOD_VOLUME/models/adetailer/checkpoints.sh"
echo "   bash $RUNPOD_VOLUME/models/controlnet/preprocessors.sh"
echo "   bash $RUNPOD_VOLUME/models/upscale/models.sh"
echo ""
echo "2. Restart your ComfyUI endpoint to load all new nodes"
echo ""
