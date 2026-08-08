#!/usr/bin/env bash
# ============================================================================
# 下载 Project Gaia Flux1.D v2.0 NF4 (Uncensored) fp8 checkpoint 到网络卷
# - 基于 FLUX.1-dev，无审查，男/女/跨性别 + 2D/3D 全部兼容现有 LoRA 与 IP-Adapter
# - 用法（在 POD 终端执行）:
#     export CIVITAI_TOKEN='684f419ed32660cf70e8ad945abc5159'
#     bash /tmp/download-flux-nsfw-checkpoint.sh
# ============================================================================
set -uo pipefail

CIVITAI_TOKEN="${CIVITAI_TOKEN:-}"
MODEL_VERSION="836886"
FILENAME="projectGaiaFlux1D_v20NF4Uncensored.safetensors"
URL="https://civitai.com/api/download/models/${MODEL_VERSION}?type=Model&format=SafeTensor"
EXPECTED_MB=11774

if [ -z "$CIVITAI_TOKEN" ]; then
  echo "缺少 CIVITAI_TOKEN（export CIVITAI_TOKEN=xxx）"
  exit 1
fi

# 找到挂载的 models/checkpoints 目录（优先网络卷 /workspace）
CANDIDATES=(
  /workspace/models/checkpoints
  /runpod-volume/models/checkpoints
  /root/ComfyUI/models/checkpoints
  /comfyui/models/checkpoints
)
TARGET=""
for d in "${CANDIDATES[@]}"; do
  if [ -d "$d" ]; then
    TARGET="$d"
    break
  fi
done
if [ -z "$TARGET" ]; then
  echo "未找到 models/checkpoints 目录，请确认网络卷挂载路径后手动 cd"
  exit 1
fi

echo "目标目录: $TARGET"
df -h "$TARGET"
echo "--- 现有 checkpoint ---"
ls -lh "$TARGET" 2>/dev/null || true

FREE_KB=$(df -k "$TARGET" | awk 'NR==2 {print $4}')
NEED_KB=$((EXPECTED_MB * 1024 + 512 * 1024))
if [ "$FREE_KB" -lt "$NEED_KB" ]; then
  echo ""
  echo "!! 剩余空间不足：需要约 $((NEED_KB / 1024 / 1024))GB，当前可用 $((FREE_KB / 1024 / 1024))GB"
  echo "   可清理项（确认无用后再删）："
  echo "     - 旧版无审查 LoRA：flux_realism_xlabs / flux_krea_realism / flux_hyperrealism_aidma /"
  echo "       flux_add_details / flux_detail_enhancer / flux_nsfw_klein_v2 / flux_uncensored / pony_detailifier_v5"
  echo "     - 确认切到新底模后，可删除旧 checkpoint：flux1-dev-fp8.safetensors"
  echo "   清理命令示例：cd $TARGET && rm -f flux1-dev-fp8.safetensors"
  if [ "${FORCE:-0}" != "1" ]; then
    echo "   → 空间不足，脚本已中止（不会产出损坏文件）。确认清理后重跑，或用 FORCE=1 强制（风险自担）"
    exit 1
  fi
fi

echo ""
echo "开始下载 $FILENAME（约 $((EXPECTED_MB / 1024))GB，支持断点续传）..."
cd "$TARGET"
if [ -s "$FILENAME" ]; then
  PREV=$(stat -c %s "$FILENAME" 2>/dev/null || echo 0)
  echo "检测到已有部分文件 $PREV 字节，继续续传..."
fi
curl -sL --fail -C - --retry 3 --retry-delay 5 \
  -H "Authorization: Bearer $CIVITAI_TOKEN" \
  -o "$FILENAME" "$URL"

if [ ! -s "$FILENAME" ]; then
  echo "下载失败或文件为空"
  exit 1
fi

ACTUAL_MB=$(du -m "$FILENAME" | awk '{print $1}')
echo "下载完成: $FILENAME = ${ACTUAL_MB} MB（预期 ~$((EXPECTED_MB / 1024))GB）"
if [ "$ACTUAL_MB" -lt $((EXPECTED_MB - 256)) ]; then
  echo "警告: 文件大小与预期不符，可能下载不完整，请重试"
  exit 1
fi

ACTUAL_BYTES=$(stat -c %s "$FILENAME")
if [ "$ACTUAL_BYTES" != "12346749423" ]; then
  echo "!! 大小校验失败：实际 $ACTUAL_BYTES 字节，预期 12346749423 字节（文件不完整，删除后重新下载）"
  exit 1
fi
echo "大小校验通过: $ACTUAL_BYTES 字节"

echo ""
echo "下一步："
echo "  1) 控制台「底模 Checkpoint」下拉选择: $FILENAME"
echo "  2) 或设置环境变量 RUNPOD_FLUX_CHECKPOINT=$FILENAME（Vercel + .env.local）"
