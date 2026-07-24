#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SoulMate9 — RunPod DC2 多机房部署脚本
# 在第二个数据中心创建网络卷 + Serverless 端点（按需计费）
# ═══════════════════════════════════════════════════════════════
# 使用方法:
#   export RUNPOD_API_KEY="your-api-key"
#   bash scripts/deploy-dc2.sh
#
# 前置条件:
#   - RunPod API Key (账号级, rpa_CMDBP... 格式)
#   - DC1 已有正常运行的 FLUX + vLLM 端点
#   - 选择与 DC1 不同的数据中心 (避免同时缺货)
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── 配置 ─────────────────────────────────────────────────────
# 选择数据中心 (避开 DC1 的 US-CA-2, 推荐 US-TX-3 或 US-GA-1)
DC2_REGION="${DC2_REGION:-US-TX-3}"
VOLUME_NAME="soulmate-dc2-models"
VOLUME_SIZE_GB="${VOLUME_SIZE_GB:-50}"

# FLUX 图片生成端点
FLUX_TEMPLATE="${FLUX_TEMPLATE:-runpod/flux-comfyui:1.0.0}"
FLUX_GPU="${FLUX_GPU:-NVIDIA RTX A5000}"
FLUX_WORKERS_MIN=0
FLUX_WORKERS_MAX=2
FLUX_WORKERS_IDLE=1

# vLLM NSFW 聊天端点
VLLM_MODEL="${VLLM_MODEL:-Qwen/Qwen3.5-9B-Abliterated}"
VLLM_TEMPLATE="${VLLM_TEMPLATE:-runpod/vllm:2.1.0}"
VLLM_GPU="${VLLM_GPU:-NVIDIA RTX A5000}"
VLLM_WORKERS_MIN=0
VLLM_WORKERS_MAX=2
VLLM_WORKERS_IDLE=1

# LoRA 文件列表 (从 DC1 卷复制)
LORA_FILES=(
  "flux_realismV20.safetensors"
  "flux_amateurV20.safetensors"
  "flux_portrait_v1.safetensors"
  "flux_anime_v1.safetensors"
  "flux_furry_v1.safetensors"
  "flux_hyperreal_v1.safetensors"
  "flux_detail_v1.safetensors"
)

CHECKPOINT="flux1-dev-fp8.safetensors"

# ─── 检查 ─────────────────────────────────────────────────────
if [ -z "${RUNPOD_API_KEY:-}" ]; then
  echo "❌ 请设置 RUNPOD_API_KEY 环境变量"
  exit 1
fi

API="https://api.runpod.ai/graphql"
AUTH_HEADER="Authorization: Bearer ${RUNPOD_API_KEY}"

echo "═══════════════════════════════════════════════════════"
echo "  SoulMate9 DC2 部署 — 区域: ${DC2_REGION}"
echo "═══════════════════════════════════════════════════════"
echo ""

# ─── Step 1: 创建网络卷 ──────────────────────────────────────
echo "📦 Step 1: 创建网络卷 ${VOLUME_NAME} (${VOLUME_SIZE_GB}GB) @ ${DC2_REGION}"

CREATE_VOLUME=$(curl -s -X POST "$API" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { networkVolumeCreate(input: { name: \\\"${VOLUME_NAME}\\\", dataCenterId: \\\"${DC2_REGION}\\\", size: ${VOLUME_SIZE_GB} }) { id name size dataCenterId } }\"
  }")

VOLUME_ID=$(echo "$CREATE_VOLUME" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('networkVolumeCreate',{}).get('id',''))" 2>/dev/null || echo "")

if [ -z "$VOLUME_ID" ]; then
  echo "⚠️  卷创建失败或已存在，尝试查找现有卷..."
  # 查找已有卷
  LIST_VOLUMES=$(curl -s -X POST "$API" \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d '{"query": "{ myself { networkVolumes { id name dataCenterId size } } }"}')
  VOLUME_ID=$(echo "$LIST_VOLUMES" | python3 -c "
import sys,json
d=json.load(sys.stdin)
vols=d.get('data',{}).get('myself',{}).get('networkVolumes',[])
for v in vols:
  if v.get('name')=='${VOLUME_NAME}':
    print(v['id']); break
" 2>/dev/null || echo "")
  if [ -z "$VOLUME_ID" ]; then
    echo "❌ 无法创建或找到网络卷，请手动在 RunPod Console 创建"
    echo "   名称: ${VOLUME_NAME}, 区域: ${DC2_REGION}, 大小: ${VOLUME_SIZE_GB}GB"
    exit 1
  fi
  echo "   找到现有卷: ${VOLUME_ID}"
else
  echo "   ✅ 卷已创建: ${VOLUME_ID}"
fi

echo ""

# ─── Step 2: 创建 FLUX Serverless 端点 ───────────────────────
echo "🎨 Step 2: 创建 FLUX 图片生成端点 (按需计费)"

CREATE_FLUX=$(curl -s -X POST "$API" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { endpointCreate(input: { name: \\\"soulmate-flux-dc2\\\", templateId: \\\"${FLUX_TEMPLATE}\\\", gpuIds: \\\"${FLUX_GPU}\\\", networkVolumeId: \\\"${VOLUME_ID}\\\", locations: \\\"${DC2_REGION}\\\", idleTimeout: 5, scalerType: \\\"QUEUE\\\", scalerValue: 4, minWorkers: ${FLUX_WORKERS_MIN}, maxWorkers: ${FLUX_WORKERS_MAX}, workerIdleTimeout: 300 }) { id name gpuIds status } }\"
  }")

FLUX_ENDPOINT_ID=$(echo "$CREATE_FLUX" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('endpointCreate',{}).get('id',''))" 2>/dev/null || echo "")

if [ -z "$FLUX_ENDPOINT_ID" ]; then
  echo "⚠️  FLUX 端点创建失败，请手动创建"
  echo "   响应: $CREATE_FLUX"
else
  echo "   ✅ FLUX 端点: ${FLUX_ENDPOINT_ID}"
fi

echo ""

# ─── Step 3: 创建 vLLM NSFW 聊天端点 ─────────────────────────
echo "💬 Step 3: 创建 vLLM NSFW 聊天端点 (按需计费)"

CREATE_VLLM=$(curl -s -X POST "$API" \
  -H "$AUTH_HEADER" \
  -H "Content-Type: application/json" \
  -d "{
    \"query\": \"mutation { endpointCreate(input: { name: \\\"soulmate-qwen35-9b-nsfw-dc2\\\", templateId: \\\"${VLLM_TEMPLATE}\\\", gpuIds: \\\"${VLLM_GPU}\\\", networkVolumeId: \\\"${VOLUME_ID}\\\", locations: \\\"${DC2_REGION}\\\", idleTimeout: 5, scalerType: \\\"QUEUE\\\", scalerValue: 4, minWorkers: ${VLLM_WORKERS_MIN}, maxWorkers: ${VLLM_WORKERS_MAX}, workerIdleTimeout: 300, env: [{ key: \\\"MODEL_NAME\\\", value: \\\"${VLLM_MODEL}\\\" }] }) { id name gpuIds status } }\"
  }")

VLLM_ENDPOINT_ID=$(echo "$CREATE_VLLM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('endpointCreate',{}).get('id',''))" 2>/dev/null || echo "")

if [ -z "$VLLM_ENDPOINT_ID" ]; then
  echo "⚠️  vLLM 端点创建失败，请手动创建"
  echo "   响应: $CREATE_VLLM"
else
  echo "   ✅ vLLM 端点: ${VLLM_ENDPOINT_ID}"
fi

echo ""

# ─── Step 4: 下载模型到卷 ────────────────────────────────────
echo "📥 Step 4: 模型下载指令 (需要在 Pod 中执行)"
echo ""
echo "   启动一个临时 Pod 挂载卷 ${VOLUME_ID}，然后执行:"
echo ""
cat << 'DOWNLOAD_SCRIPT'
   # ── 在 Pod 终端中执行 ──
   mkdir -p /runpod-volume/models/checkpoints
   mkdir -p /runpod-volume/models/loras

   # 下载 FLUX checkpoint (如果卷上没有)
   if [ ! -f "/runpod-volume/models/checkpoints/flux1-dev-fp8.safetensors" ]; then
     echo "Downloading flux1-dev-fp8..."
     wget -q --show-progress -O /runpod-volume/models/checkpoints/flux1-dev-fp8.safetensors \
       "https://huggingface.co/Kijai/flux-fp8/resolve/main/flux1-dev-fp8.safetensors"
   fi

   # 下载 LoRA 文件
   cd /runpod-volume/models/loras
DOWNLOAD_SCRIPT

for lora in "${LORA_FILES[@]}"; do
  echo "   wget -q --show-progress -O \"${lora}\" \"<CIVITAI_OR_HF_URL_FOR_${lora}>\""
done

echo ""
echo "   # 下载 Qwen3.5-9B Abliterated 模型 (vLLM)"
echo "   huggingface-cli download Qwen/Qwen3.5-9B-Abliterated --local-dir /runpod-volume/models/qwen35-9b-abliterated"
echo ""

# ─── Step 5: 输出 Vercel 环境变量 ────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo "  📋 部署完成后，设置以下 Vercel 环境变量:"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  # DC2 FLUX 图片生成"
echo "  RUNPOD_ENDPOINT_ID_DC2=${FLUX_ENDPOINT_ID:-<手动填入>}"
echo ""
echo "  # DC2 vLLM NSFW 聊天"
echo "  RUNPOD_DC2_CHAT_URL=https://api.runpod.ai/v2/${VLLM_ENDPOINT_ID:-<手动填入>}"
echo ""
echo "  设置命令:"
echo "  npx vercel env add RUNPOD_ENDPOINT_ID_DC2 production <<< '${FLUX_ENDPOINT_ID:-<ID>}'"
echo "  npx vercel env add RUNPOD_DC2_CHAT_URL production <<< 'https://api.runpod.ai/v2/${VLLM_ENDPOINT_ID:-<ID>}'"
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ DC2 部署脚本执行完毕"
echo "  路由已配置: RunPod DC1 → RunPod DC2 → fal.ai → Together"
echo "  按需计费: minWorkers=0, 无请求时不产生费用"
echo "═══════════════════════════════════════════════════════"
