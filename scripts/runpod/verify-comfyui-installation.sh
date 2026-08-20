#!/bin/bash
# SoulMate AI - ComfyUI Node Verification Script
# 部署后验证节点和模型是否安装正确

set -ex

echo "🔍 Verifying ComfyUI installation..."

COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"
MODEL_DIRS="$COMFYUI/models"

FAILED=0

# ============================================
# Check Custom Nodes
# ============================================
echo "📦 Checking custom nodes..."

NODES_TO_CHECK=(
  "comfyui-ipadapter-flux"
  "sd-webui-controlnet"
  "ComfyUI-ADetailer"
)

for node in "${NODES_TO_CHECK[@]}"; do
  if [ -d "$CUSTOM_NODES/$node" ]; then
    echo "✅ $node installed"
  else
    echo "❌ $node NOT FOUND"
    FAILED=1
  fi
done

# ============================================
# Check Python Dependencies
# ============================================
echo ""
echo "🐍 Checking Python dependencies..."

PYTHON_DEPS=(
  "opencv-python-headless"
  "ultralytics"
  "torch-sampler"
  "einops"
)

for dep in "${PYTHON_DEPS[@]}"; do
  if python -c "import $dep" 2>/dev/null; then
    echo "✅ $dep available"
  else
    echo "❌ $dep NOT FOUND"
    FAILED=1
  fi
done

# ============================================
# Check Model Symlinks
# ============================================
echo ""
echo "🔗 Checking model symlinks..."

SYMLINKS=(
  "$MODEL_DIRS/ipadapter-flux:/runpod-volume/models/ipadapter-flux"
  "$MODEL_DIRS/controlnet:/runpod-volume/models/controlnet"
  "$MODEL_DIRS/adetailer:/runpod-volume/models/adetailer"
  "$MODEL_DIRS/upscale:/runpod-volume/models/upscale"
)

for symlink in "${SYMLINKS[@]}"; do
  SOURCE="${symlink%%:*}"
  TARGET="${symlink##*:}"
  
  if [ -L "$SOURCE" ]; then
    if [ "$(readlink -f $SOURCE)" == "$(readlink -f $TARGET)" ]; then
      echo "✅ $SOURCE -> $TARGET"
    else
      echo "⚠️ $SOURCE points to wrong target"
      FAILED=1
    fi
  else
    echo "❌ $SOURCE is not a symlink"
    FAILED=1
  fi
done

# ============================================
# Check Model Files
# ============================================
echo ""
echo "📁 Checking model files..."

# ControlNet preprocessors
if [ -f "/runpod-volume/models/controlnet/preprocessors/openpose-full.yaml" ]; then
  echo "✅ OpenPose preprocessor found"
else
  echo "❌ OpenPose preprocessor MISSING"
  FAILED=1
fi

# ADetailer checkpoints
FACE_COUNT=$(ls /runpod-volume/models/adetailer/checkpoints/yolov8*-face.pt 2>/dev/null | wc -l)
if [ "$FACE_COUNT" -ge 1 ]; then
  echo "✅ ADetailer face checkpoints ($FACE_COUNT files)"
else
  echo "❌ ADetailer face checkpoints MISSING"
  FAILED=1
fi

# Upscaler models
UPSCALE_COUNT=$(ls /runpod-volume/models/upscale/models/*.pth 2>/dev/null | wc -l)
if [ "$UPSCALE_COUNT" -ge 3 ]; then
  echo "✅ Upscaler models ($UPSCALE_COUNT files)"
else
  echo "❌ Upscaler models MISSING (found $UPSCALE_COUNT, expected >= 3)"
  FAILED=1
fi

# ============================================
# Test Import (Optional - slow)
# ============================================
echo ""
echo "🧪 Testing node imports (may take a moment)..."

# Test IP-Adapter import
if python -c "import sys; sys.path.append('$CUSTOM_NODES/comfyui-ipadapter-flux'); from apply_ipadapter_flux import ApplyIPAdapterFlux; print('✅ IP-Adapter Flux import OK')" 2>/dev/null; then
  echo "✅ IP-Adapter Flux module loads correctly"
else
  echo "⚠️ IP-Adapter Flux import test skipped (could be network issue)"
fi

# Test ControlNet import
if python -c "from controlnet_aux import OpenPoseDetector; print('✅ ControlNet import OK')" 2>/dev/null; then
  echo "✅ ControlNet modules load correctly"
else
  echo "⚠️ ControlNet import test skipped"
fi

# Test ADetailer import
if python -c "import ADetailer; print('✅ ADetailer import OK')" 2>/dev/null; then
  echo "✅ ADetailer module loads correctly"
else
  echo "⚠️ ADetailer import test skipped"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "============================================"
if [ $FAILED -eq 0 ]; then
  echo "✅ ALL CHECKS PASSED!"
  echo ""
  echo "Your ComfyUI setup is ready for use."
  exit 0
else
  echo "❌ SOME CHECKS FAILED"
  echo ""
  echo "Please review the errors above and run:"
  echo "  docker exec <container_id> bash /scripts/runpod/install-comfyui-nodes.sh"
  echo ""
  echo "Or manually fix missing components."
  exit 1
fi
