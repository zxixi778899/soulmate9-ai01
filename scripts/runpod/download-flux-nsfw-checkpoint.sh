#!/usr/bin/env bash
# ============================================================================
# Flux Unchained by SCG (fp8, UNET-only) + FLUX 文本编码器/VAE 安装脚本
#
# 说明：Flux Unchained 只有 UNET（无内置 CLIP/T5/VAE），ComfyUI 必须用
#   UNETLoader + DualCLIPLoader + VAELoader 才能出图。因此除底模外还需：
#     models/clip/clip_l.safetensors            (~246MB, CLIP-L)
#     models/clip/t5xxl_fp8_e4m3fn.safetensors  (~4.9GB, T5-XXL fp8)
#     models/vae/ae.safetensors                 (~335MB, FLUX VAE)
#   底模放入 models/diffusion_models/（UNETLoader 扫描目录）。
#
# 用法（在 POD 终端执行）：
#     export CIVITAI_TOKEN='684f419ed32660cf70e8ad945abc5159'
#     bash /tmp/download-flux-nsfw-checkpoint.sh
# ============================================================================
set -uo pipefail

CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
MODEL_VERSION="768009"
FILENAME="fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors"
URL="https://civitai.com/api/download/models/${MODEL_VERSION}?type=Model&format=SafeTensor"
EXPECTED_BYTES=11891283720

# 最小体积校验（MB）：低于阈值视为下载不完整
CLIP_MIN_MB=200
T5_MIN_MB=4500
VAE_MIN_MB=280

if [ -z "$CIVITAI_TOKEN" ]; then
  echo "缺少 CIVITAI_TOKEN（export CIVITAI_TOKEN=xxx）"
  exit 1
fi

# 找到挂载的 models 根目录（优先网络卷 /workspace）
MODELS_ROOT=""
for d in /workspace/models /runpod-volume/models /root/ComfyUI/models /comfyui/models; do
  if [ -d "$d" ]; then
    MODELS_ROOT="$d"
    break
  fi
done
if [ -z "$MODELS_ROOT" ]; then
  echo "未找到 models 目录，请确认网络卷挂载路径后手动 cd"
  exit 1
fi

UNET_DIR="$MODELS_ROOT/diffusion_models"
CKPT_DIR="$MODELS_ROOT/checkpoints"
CLIP_DIR="$MODELS_ROOT/clip"
VAE_DIR="$MODELS_ROOT/vae"
mkdir -p "$UNET_DIR" "$CLIP_DIR" "$VAE_DIR"

echo "models 根目录: $MODELS_ROOT"
df -h "$MODELS_ROOT"

NEED_MB=$((11340 + CLIP_MIN_MB + T5_MIN_MB + VAE_MIN_MB + 512))
FREE_KB=$(df -k "$MODELS_ROOT" | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt $((NEED_MB * 1024)) ]; then
  echo ""
  echo "!! 剩余空间不足：至少需要约 $((NEED_MB / 1024))GB，当前可用 $((FREE_KB / 1024 / 1024))GB"
  echo "   可清理项（确认无用后再删）：旧版 LoRA、flux1-dev-fp8.safetensors（17G）、旧 Gaia"
  exit 1
fi

# ---------------------------------------------------------------- 底模 UNET
if [ -s "$UNET_DIR/$FILENAME" ] && [ "$(stat -c %s "$UNET_DIR/$FILENAME")" = "$EXPECTED_BYTES" ]; then
  echo "SKIP $FILENAME（diffusion_models 已存在且校验通过）"
elif [ -s "$CKPT_DIR/$FILENAME" ] && [ "$(stat -c %s "$CKPT_DIR/$FILENAME")" = "$EXPECTED_BYTES" ]; then
  echo "检测到 checkpoints 已有完整文件，创建 diffusion_models 软链接（节省 11GB）..."
  ln -sf "../checkpoints/$FILENAME" "$UNET_DIR/$FILENAME"
  ls -lh "$UNET_DIR/$FILENAME"
else
  echo ""
  echo "开始下载 $FILENAME（约 11GB，支持断点续传）..."
  cd "$UNET_DIR"
  curl -sL --fail -C - --retry 3 --retry-delay 5 \
    -H "Authorization: Bearer $CIVITAI_TOKEN" \
    -o "$FILENAME" "$URL"
  ACTUAL_BYTES=$(stat -c %s "$FILENAME" 2>/dev/null || echo 0)
  if [ "$ACTUAL_BYTES" != "$EXPECTED_BYTES" ]; then
    echo "!! 大小校验失败：实际 $ACTUAL_BYTES 字节，预期 $EXPECTED_BYTES 字节（文件不完整，删除后重新下载）"
    exit 1
  fi
  echo "大小校验通过: $ACTUAL_BYTES 字节"
fi

# ------------------------------------------------------- CLIP-L + T5 + VAE
download_if_missing() {
  local name="$1" min_mb="$2" dir="$3"
  shift 3
  local target="$dir/$name"
  if [ -s "$target" ]; then
    local mb
    mb=$(du -m "$target" | awk '{print $1}')
    if [ "$mb" -ge "$min_mb" ]; then
      echo "SKIP $name（已存在 ${mb}MB）"
      return 0
    fi
  fi
  local ok=0
  for url in "$@"; do
    echo "下载 $name <- $url"
    if curl -sL --fail -C - --retry 2 --retry-delay 3 -o "$target" "$url"; then
      ok=1
      break
    fi
  done
  if [ "$ok" != "1" ] || [ ! -s "$target" ]; then
    echo "!! $name 下载失败（所有镜像均失败），请重跑"
    exit 1
  fi
  local mb
  mb=$(du -m "$target" | awk '{print $1}')
  if [ "$mb" -lt "$min_mb" ]; then
    echo "!! $name 下载不完整（${mb}MB < ${min_mb}MB），请重跑"
    exit 1
  fi
  echo "OK $name (${mb}MB)"
}

download_if_missing "clip_l.safetensors" "$CLIP_MIN_MB" "$CLIP_DIR" \
  "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors"
download_if_missing "t5xxl_fp8_e4m3fn.safetensors" "$T5_MIN_MB" "$CLIP_DIR" \
  "https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors"
download_if_missing "ae.safetensors" "$VAE_MIN_MB" "$VAE_DIR" \
  "https://huggingface.co/unsloth/FLUX.1-schnell/resolve/main/ae.safetensors" \
  "https://huggingface.co/foxmail/flux_vae/resolve/main/ae.safetensors"

echo ""
echo "=== 安装完成 ==="
echo "UNET : $UNET_DIR/$FILENAME"
echo "CLIP : $CLIP_DIR/clip_l.safetensors + $CLIP_DIR/t5xxl_fp8_e4m3fn.safetensors"
echo "VAE  : $VAE_DIR/ae.safetensors"
echo ""
echo "代码已按 split 模式加载（UNETLoader + DualCLIPLoader + VAELoader），"
echo "无需再手动切 checkpoint；控制台默认底模即 $FILENAME"
