#!/bin/bash
# SoulMate AI - RunPod Endpoint Verification Script
# Checks endpoint status, models, nodes, and LoRA inventory

set -ex

echo "========================================"
echo "🔍 SOULMATE AI RUNPOD VERIFICATION"
echo "========================================"

# Input parameters
ENDPOINT_ID=$1
VOLUME_ID=$2

if [ -z "$ENDPOINT_ID" ] || [ -z "$VOLUME_ID" ]; then
  echo "❌ Usage: $0 <endpoint_id> <volume_id>"
  exit 1
fi

echo ""
echo "📊 Checking Endpoint: $ENDPOINT_ID"
echo "📦 Volume ID: $VOLUME_ID"
echo ""

# ============================================
# 1. Check ComfyUI Node Installation
# ============================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Step 1: Verify Custom Nodes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /comfyui/custom_nodes || { echo "❌ Cannot access custom_nodes"; exit 1; }

NODES_TO_CHECK=(
  "comfyui-ipadapter-flux:IP-Adapter Flux required for identity consistency"
  "sd-webui-controlnet:ControlNet for pose/edge/depth control"
  "ComfyUI-ADetailer:ADetailer for face/hand refinement"
)

for node_info in "${NODES_TO_CHECK[@]}"; do
  IFS=':' read -r NODE_NAME DESCRIPTION <<< "$node_info"
  
  if [ -d "$NODE_NAME" ]; then
    SIZE=$(du -sh "$NODE_NAME" 2>/dev/null | cut -f1)
    echo "✅ $NODE_NAME - INSTALLED ($SIZE)"
    
    # Check Python requirements for IP-Adapter
    if [ "$NODE_NAME" = "comfyui-ipadapter-flux" ]; then
      if grep -q "getattr(original_block, 'flipped_img_txt', False)" \
         "$NODE_NAME/flux/layers.py" 2>/dev/null; then
        echo "   └─ Patch applied: flipped_img_txt compatibility ✅"
      else
        echo "   └─ ⚠️ WARNING: Compatibility patch missing!"
      fi
      
      if grep -q "timestep_zero_index=None," \
         "$NODE_NAME/utils.py" 2>/dev/null; then
        echo "   └─ Patch applied: timestep_zero_index compatibility ✅"
      else
        echo "   └─ ⚠️ WARNING: Compatibility patch missing!"
      fi
    fi
  else
    echo "❌ $NODE_NAME - NOT FOUND"
    echo "   → Description: $DESCRIPTION"
  fi
done

# ============================================
# 2. Check Model Directories (Symbolic Links)
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Step 2: Verify Model Symbolic Links"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MODEL_LINKS=(
  "/comfyui/models/ipadapter-flux:/runpod-volume/models/ipadapter-flux:IP-Adapter Flux model (65MB)"
  "/comfyui/models/clip_vision/siglip-so400m-patch14-384:/runpod-volume/models/clip_vision/siglip-so400m-patch14-384:SigLIP Clip Vision for IP-Adapter (65MB)"
  "/comfyui/models/controlnet/preprocessors:/runpod-volume/models/controlnet/preprocessors:ControlNet preprocessors"
  "/comfyui/models/adetailer/checkpoints:/runpod-volume/models/adetailer/checkpoints:ADetailer YOLO models"
)

for link_info in "${MODEL_LINKS[@]}"; do
  IFS=':' read -r COMFY_PATH VOLUME_PATH DESCRIPTION <<< "$link_info"
  
  if [ -L "$COMFY_PATH" ]; then
    TARGET=$(readlink -f "$COMFY_PATH")
    
    if [ "$TARGET" = "$VOLUME_PATH" ]; then
      echo "✅ Symbolic link valid: $COMFY_PATH → $VOLUME_PATH"
      
      # Check if target directory exists
      if [ -d "$VOLUME_PATH" ]; then
        FILE_COUNT=$(ls -A "$VOLUME_PATH" 2>/dev/null | wc -l)
        if [ "$FILE_COUNT" -gt 0 ]; then
          echo "   └─ Contains $FILE_COUNT item(s): $(ls "$VOLUME_PATH" 2>/dev/null | head -3 | tr '\n' ', ')"
        else
          echo "   └─ ⚠️ DIRECTORY EMPTY - Download models first!"
        fi
      else
        echo "   └─ ❌ Target directory does not exist!"
      fi
    else
      echo "❌ Broken symlink: $COMFY_PATH → $TARGET (expected $VOLUME_PATH)"
    fi
  else
    echo "❌ Symlink missing: $COMFY_PATH"
    echo "   → Expected target: $VOLUME_PATH"
  fi
done

# ============================================
# 3. Check Installed Models
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Step 3: Inventory Mounted Models"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# FLUX checkpoint check
echo ""
echo "🔹 FLUX Premium Models:"
if [ -f "/runpod-volume/models/checkpoints/flux1-dev-fp8.safetensors" ]; then
  SIZE=$(ls -lh "/runpod-volume/models/checkpoints/flux1-dev-fp8.safetensors" | awk '{print $5}')
  echo "✅ flux1-dev-fp8.safetensors ($SIZE)"
else
  echo "❌ flux1-dev-fp8.safetensors - MISSING"
fi

# IP-Adapter Flux
echo ""
echo "🔹 IP-Adapter Flux:"
if [ -f "/runpod-volume/models/ipadapter-flux/ip-adapter-flux.bin" ]; then
  SIZE=$(ls -lh "/runpod-volume/models/ipadapter-flux/ip-adapter-flux.bin" | awk '{print $5}')
  echo "✅ ip-adapter-flux.bin ($SIZE)"
else
  echo "⚠️  ip-adapter-flux.bin - NOT FOUND (may need download)"
fi

if ls /runpod-volume/models/clip_vision/siglip-so400m-patch14-384/*.safetensors 1>/dev/null 2>&1; then
  echo "✅ SigLIP clip vision model(s) present"
else
  echo "❌ SigLIP clip vision model - MISSING"
fi

# SDXL checkpoints (only if using SDXL endpoints)
echo ""
echo "🔹 SDXL Models (if applicable):"
if [ -f "/runpod-volume/models/checkpoints/ponyDiffusionV6XL_pngpt.safetensors" ]; then
  SIZE=$(ls -lh "/runpod-volume/models/checkpoints/ponyDiffusionV6XL_pngpt.safetensors" | awk '{print $5}')
  echo "✅ ponyDiffusionV6XL_pngpt.safetensors ($SIZE)"
else
  echo "⚠️  ponyDiffusionV6XL_pngpt.safetensors - NOT FOUND"
fi

if [ -f "/runpod-volume/models/checkpoints/waiMatureIllustrious_v20.safetensors" ]; then
  SIZE=$(ls -lh "/runpod-volume/models/checkpoints/waiMatureIllustrious_v20.safetensors" | awk '{print $5}')
  echo "✅ waiMatureIllustrious_v20.safetensors ($SIZE)"
else
  echo "⚠️  waiMatureIllustrious_v20.safetensors - NOT FOUND"
fi

# ADetailer YOLO models
echo ""
echo "🔹 ADetailer Checkpoints:"
YOLO_FILES=("yolov8n-face.pt" "yolov8n-hand.pt" "yolov8s-body.pt")
for yolo_file in "${YOLO_FILES[@]}"; do
  if [ -f "/runpod-volume/models/adetailer/checkpoints/$yolo_file" ]; then
    SIZE=$(ls -lh "/runpod-volume/models/adetailer/checkpoints/$yolo_file" | awk '{print $5}')
    echo "✅ $yolo_file ($SIZE)"
  else
    echo "❌ $yolo_file - MISSING"
  fi
done

# ControlNet Preprocessors
echo ""
echo "🔹 ControlNet Preprocessors:"
if [ -f "/runpod-volume/models/controlnet/preprocessors/dw-ocr.pth" ]; then
  SIZE=$(ls -lh "/runpod-volume/models/controlnet/preprocessors/dw-ocr.pth" | awk '{print $5}')
  echo "✅ dw-ocr.pth (OpenPose processor) ($SIZE)"
else
  echo "❌ dw-ocr.pth - MISSING"
fi

if [ -f "/runpod-volume/models/controlnet/preprocessors/openpose-full.yaml" ]; then
  echo "✅ openpose-full.yaml (OpenPose config)"
else
  echo "❌ openpose-full.yaml - MISSING"
fi

# ============================================
# 4. Python Dependencies Check
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Step 4: Verify Python Packages"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PYTHON_DEPS=(
  "opencv-python-headless:>=4.8.0"
  "ultralytics:latest"
  "einops:latest"
  "numpy:>=1.24,<2.0"
  "onnxruntime-gpu:>=1.18.0"
)

for dep in "${PYTHON_DEPS[@]}"; do
  IFS=':' read -r PACKAGE VERSION_REQUIREMENT <<< "$dep"
  
  if python3 -c "import $PACKAGE" 2>/dev/null; then
    echo "✅ $PACKAGE installed"
  else
    echo "❌ $PACKAGE - NOT INSTALLED"
  fi
done

# ============================================
# 5. Uplscaler Models (Optional but Recommended)
# ============================================
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "ℹ️  Step 5: Upscaler Models (Optional)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d "/runpod-volume/models/upscale/models" ]; then
  UPSCALE_FILES=$(ls -A "/runpod-volume/models/upscale/models" 2>/dev/null)
  if [ -n "$UPSCALE_FILES" ]; then
    echo "✅ Upscaler directory contains:"
    echo "$UPSCALE_FILES" | while read -r file; do
      SIZE=$(ls -lh "/runpod-volume/models/upscale/models/$file" | awk '{print $5}')
      echo "   - $file ($SIZE)"
    done
  else
    echo "⚠️  Upscaler directory is empty"
  fi
else
  echo "⚠️  Upscaler models directory not found"
fi

# ============================================
# 6. Summary Report
# ============================================
echo ""
echo "========================================"
echo "📊 VERIFICATION SUMMARY"
echo "========================================"

MISSING_NODES=0
MISSING_MODELS=0
BROKEN_LINKS=0

# Count issues
[ ! -d "/comfyui/custom_nodes/comfyui-ipadapter-flux" ] && ((MISSING_NODES++))
[ ! -d "/comfyui/custom_nodes/sd-webui-controlnet" ] && ((MISSING_NODES++))
[ ! -f "/runpod-volume/models/ipadapter-flux/ip-adapter-flux.bin" ] && ((MISSING_MODELS++))
[ ! -f "/runpod-volume/models/clip_vision/siglip-so400m-patch14-384/model.safetensors" ] && ((MISSING_MODELS++))
[ ! -f "/runpod-volume/models/adetailer/checkpoints/yolov8n-face.pt" ] && ((MISSING_MODELS++))

echo "Custom Nodes Issues: $MISSING_NODES"
echo "Missing Models: $MISSING_MODELS"
echo ""

if [ $MISSING_NODES -eq 0 ] && [ $MISSING_MODELS -eq 0 ]; then
  echo "🎉 ALL CHECKS PASSED! System is ready."
  echo ""
  echo "✅ Ready to generate images on this endpoint!"
else
  echo "⚠️  ISSUES DETECTED:"
  [ $MISSING_NODES -gt 0 ] && echo "   - Missing/failed nodes: $MISSING_NODES"
  [ $MISSING_MODELS -gt 0 ] && echo "   - Missing model files: $MISSING_MODELS"
  echo ""
  echo "📖 Run the following script to fix:"
  echo "   bash /scripts/runpod/download-sdxl-models.sh"
  echo "   bash /scripts/runpod/install-comfyui-nodes.sh"
fi

echo ""
echo "========================================"
echo "End of verification report"
echo "========================================"
