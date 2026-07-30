#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SoulMate9 — LoRA 同步脚本
# 检查网络卷上的 LoRA，下载缺失文件，生成 Vercel 环境变量分配方案
# ═══════════════════════════════════════════════════════════════
# 使用方法:
#   export RUNPOD_API_KEY="rpa_xxx"
#   export CIVITAI_API_TOKEN="xxx"  (可选)
#   bash scripts/sync-loras.sh
#
# 功能:
#   1. 部署临时 Pod 挂载网络卷
#   2. 检查 routing 所需的 LoRA 是否存在
#   3. 下载缺失文件
#   4. 确保 ComfyUI worker 启动时能找到 LoRA
#   5. 输出 Vercel 环境变量更新指令
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

API="https://api.runpod.io/graphql"
AUTH="Authorization: Bearer ${RUNPOD_API_KEY:?请设置 RUNPOD_API_KEY}"
VOLUME_ID="p1dup48kuq"
DC="US-CA-2"
POD_NAME="lora-sync-$(date +%s)"
CIVITAI_TOKEN="${CIVITAI_API_TOKEN:-fa3ffd82ab82c4b98265520245d66547}"

# ─── LoRA 清单 (文件名 → CivitAI 下载 URL) ─────────────────────
# 核心路由 LoRA (model-lora-routing.ts DEFAULT_FAMILY_LORAS 所需)
declare -A CORE_LORAS=(
  ["flux_realism_xlabs.safetensors"]="https://civitai.com/api/download/models/712217"
  ["flux_add_details.safetensors"]="https://civitai.com/api/download/models/628336"
  ["flux_uncensored.safetensors"]="https://civitai.com/api/download/models/722689"
  ["flux_krea_realism.safetensors"]="https://civitai.com/api/download/models/876445"
  ["flux_hyperrealism_aidma.safetensors"]="https://civitai.com/api/download/models/980278"
  ["flux_detail_enhancer.safetensors"]="https://civitai.com/api/download/models/827325"
  ["flux_nsfw_klein_v2.safetensors"]="https://civitai.com/api/download/models/746602"
)

# 扩展 LoRA (风格/体型/服装/NSFW)
declare -A EXTRA_LORAS=(
  ["flux_style_photoreal_v1.safetensors"]="https://civitai.com/api/download/models/1084957"
  ["flux_style_hyperreal_aidma_v1.safetensors"]="https://civitai.com/api/download/models/980278"
  ["flux_detail_skin_v1.safetensors"]="https://civitai.com/api/download/models/827325"
  ["flux_detail_skin_nplastic_v1.safetensors"]="https://civitai.com/api/download/models/1301668"
  ["flux_detail_hands_v1.safetensors"]="https://civitai.com/api/download/models/1003317"
  ["flux_body_curvy_v1.safetensors"]="https://civitai.com/api/download/models/1668530"
  ["flux_body_pear_v1.safetensors"]="https://civitai.com/api/download/models/1276427"
  ["flux_outfit_lingerie_v1.safetensors"]="https://civitai.com/api/download/models/869894"
  ["flux_outfit_bunny_v1.safetensors"]="https://civitai.com/api/download/models/817758"
  ["flux_outfit_maid_v1.safetensors"]="https://civitai.com/api/download/models/1588611"
  ["flux_outfit_bikini_v1.safetensors"]="https://civitai.com/api/download/models/1184191"
  ["flux_outfit_latex_v1.safetensors"]="https://civitai.com/api/download/models/734230"
  ["flux_outfit_school_v1.safetensors"]="https://civitai.com/api/download/models/2163726"
  ["flux_pose_nsfw_dynamic_v1.safetensors"]="https://civitai.com/api/download/models/746602"
  ["flux_face_ahegao_v1.safetensors"]="https://civitai.com/api/download/models/1477302"
  ["flux_style_cinematic_v1.safetensors"]="https://civitai.com/api/download/models/953083"
)

# GPU 优先级
GPU_TYPES=(
  "NVIDIA GeForce RTX 4090"
  "NVIDIA GeForce RTX 3090"
  "NVIDIA RTX A5000"
  "NVIDIA RTX A6000"
  "NVIDIA L4"
  "NVIDIA A40"
)

echo "═══════════════════════════════════════════════════════"
echo "  SoulMate9 LoRA 同步 — $(date '+%Y-%m-%d %H:%M')"
echo "  卷: ${VOLUME_ID} @ ${DC}"
echo "═══════════════════════════════════════════════════════"

# ─── Step 1: 部署 Pod ─────────────────────────────────────────
echo ""
echo "🔍 Step 1: 寻找可用 GPU..."

POD_ID=""
for gpu in "${GPU_TYPES[@]}"; do
  echo -n "  尝试 $gpu ... "
  RESULT=$(curl -s -X POST "$API" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"query\": \"mutation { podFindAndDeployOnDemand(input: { gpuCount: 1, gpuTypeId: \\\"$gpu\\\", volumeInGb: 5, containerDiskInGb: 10, minVcpuCount: 2, minMemoryInGb: 8, imageName: \\\"runpod/base:0.0.2\\\", dataCenterId: \\\"$DC\\\", name: \\\"$POD_NAME\\\", ports: \\\"22/tcp\\\", supportPublicIp: true, networkVolumeId: \\\"$VOLUME_ID\\\" }) { id name desiredStatus } }\"
    }")

  if echo "$RESULT" | grep -q '"id":"'; then
    POD_ID=$(echo "$RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "✅ Pod=$POD_ID"
    break
  else
    echo "❌"
  fi
done

if [ -z "$POD_ID" ]; then
  echo ""
  echo "❌ ${DC} 所有 GPU 无库存，同步中止。"
  exit 1
fi

# ─── Step 2: 等待 Pod 就绪 ────────────────────────────────────
echo ""
echo "⏳ Step 2: 等待 Pod 启动..."

SSH_IP=""
SSH_PORT=""
for i in $(seq 1 60); do
  sleep 5
  POD_INFO=$(curl -s -X POST "$API" \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "{
      \"query\": \"{ pod(input: { podId: \\\"$POD_ID\\\" }) { id runtime { ports { ip isIpPublic privatePort publicPort type } } } }\"
    }")

  SSH_IP=$(echo "$POD_INFO" | grep -o '"ip":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  SSH_PORT=$(echo "$POD_INFO" | grep -o '"publicPort":[0-9]*' | head -1 | cut -d: -f2 || true)

  if [ -n "$SSH_IP" ] && [ -n "$SSH_PORT" ] && [ "$SSH_PORT" != "null" ]; then
    echo "  ✅ SSH: root@${SSH_IP}:${SSH_PORT}"
    break
  fi
  echo "  等待中... ($i/60)"
done

if [ -z "$SSH_IP" ] || [ -z "$SSH_PORT" ]; then
  echo "❌ Pod 启动超时，清理..."
  curl -s -X POST "$API" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation { podTerminate(input: { podId: \\\"$POD_ID\\\" }) }\"}" > /dev/null
  exit 1
fi

# ─── Step 3: 远程执行同步 ─────────────────────────────────────
echo ""
echo "📦 Step 3: 检查 + 下载 LoRA..."

SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -p $SSH_PORT root@$SSH_IP"

for i in $(seq 1 12); do
  if $SSH_CMD "echo ok" 2>/dev/null; then break; fi
  echo "  SSH 连接中... ($i/12)"
  sleep 10
done

$SSH_CMD bash <<'REMOTE_SCRIPT'
set -uo pipefail

grep -q "8.8.8.8" /etc/resolv.conf 2>/dev/null || echo "nameserver 8.8.8.8" >> /etc/resolv.conf

V="/runpod-volume"
L="$V/models/loras"
mkdir -p "$L"
TOKEN="fa3ffd82ab82c4b98265520245d66547"

dl() {
  local name="$1" url="$2" dest="$L/$1"
  if [ -f "$dest" ] && [ $(stat -c%s "$dest" 2>/dev/null || echo 0) -gt 102400 ]; then
    echo "  OK $name ($(du -h "$dest"|cut -f1))"; return 0
  fi
  local full="$url"; [ -n "$TOKEN" ] && full="${url}?token=${TOKEN}"
  for i in 1 2 3; do
    wget -q --show-progress -O "$dest" "$full" 2>&1 && \
      [ $(stat -c%s "$dest" 2>/dev/null||echo 0) -gt 102400 ] && \
      { echo "  ✅ $name"; return 0; }
    echo "  RETRY $name ($i/3)"; rm -f "$dest"; sleep 3
  done
  echo "  ❌ FAIL $name"; return 1
}

echo ""
echo "── 核心路由 LoRA (7个) ──"
dl "flux_realism_xlabs.safetensors" "https://civitai.com/api/download/models/712217"
dl "flux_add_details.safetensors" "https://civitai.com/api/download/models/628336"
dl "flux_uncensored.safetensors" "https://civitai.com/api/download/models/722689"
dl "flux_krea_realism.safetensors" "https://civitai.com/api/download/models/876445"
dl "flux_hyperrealism_aidma.safetensors" "https://civitai.com/api/download/models/980278"
dl "flux_detail_enhancer.safetensors" "https://civitai.com/api/download/models/827325"
dl "flux_nsfw_klein_v2.safetensors" "https://civitai.com/api/download/models/746602"

echo ""
echo "── 扩展 LoRA (16个) ──"
dl "flux_style_photoreal_v1.safetensors" "https://civitai.com/api/download/models/1084957"
dl "flux_style_hyperreal_aidma_v1.safetensors" "https://civitai.com/api/download/models/980278"
dl "flux_detail_skin_v1.safetensors" "https://civitai.com/api/download/models/827325"
dl "flux_detail_skin_nplastic_v1.safetensors" "https://civitai.com/api/download/models/1301668"
dl "flux_detail_hands_v1.safetensors" "https://civitai.com/api/download/models/1003317"
dl "flux_body_curvy_v1.safetensors" "https://civitai.com/api/download/models/1668530"
dl "flux_body_pear_v1.safetensors" "https://civitai.com/api/download/models/1276427"
dl "flux_outfit_lingerie_v1.safetensors" "https://civitai.com/api/download/models/869894"
dl "flux_outfit_bunny_v1.safetensors" "https://civitai.com/api/download/models/817758"
dl "flux_outfit_maid_v1.safetensors" "https://civitai.com/api/download/models/1588611"
dl "flux_outfit_bikini_v1.safetensors" "https://civitai.com/api/download/models/1184191"
dl "flux_outfit_latex_v1.safetensors" "https://civitai.com/api/download/models/734230"
dl "flux_outfit_school_v1.safetensors" "https://civitai.com/api/download/models/2163726"
dl "flux_pose_nsfw_dynamic_v1.safetensors" "https://civitai.com/api/download/models/746602"
dl "flux_face_ahegao_v1.safetensors" "https://civitai.com/api/download/models/1477302"
dl "flux_style_cinematic_v1.safetensors" "https://civitai.com/api/download/models/953083"

# 创建 ComfyUI 启动钩子
echo ""
echo "── 创建启动钩子 ──"
cat > "$V/startup-loras.sh" <<'HOOK'
#!/bin/bash
COMFYUI_DIR="${COMFYUI_DIR:-/comfyui}"
VOLUME="/runpod-volume"
LORA_SRC="$VOLUME/models/loras"

if [ -d "$LORA_SRC" ]; then
  mkdir -p "$COMFYUI_DIR/models/loras"
  for f in "$LORA_SRC"/*.safetensors; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    target="$COMFYUI_DIR/models/loras/$base"
    if [ ! -f "$target" ] && [ ! -L "$target" ]; then
      ln -sf "$f" "$target"
    fi
  done
  echo "[startup-loras] Linked $(ls "$COMFYUI_DIR/models/loras/"*.safetensors 2>/dev/null | wc -l) LoRAs"
fi

CKPT_SRC="$VOLUME/models/checkpoints"
if [ -d "$CKPT_SRC" ]; then
  mkdir -p "$COMFYUI_DIR/models/checkpoints"
  for f in "$CKPT_SRC"/*.safetensors; do
    [ -f "$f" ] || continue
    base=$(basename "$f")
    target="$COMFYUI_DIR/models/checkpoints/$base"
    if [ ! -f "$target" ] && [ ! -L "$target" ]; then
      ln -sf "$f" "$target"
    fi
  done
fi

for dir in ipadapter clip_vision; do
  if [ -d "$VOLUME/models/$dir" ] && [ ! -d "$COMFYUI_DIR/models/$dir" ]; then
    ln -sf "$VOLUME/models/$dir" "$COMFYUI_DIR/models/$dir"
  fi
done

if [ -d "$VOLUME/custom_nodes" ]; then
  for node_dir in "$VOLUME/custom_nodes"/*/; do
    [ -d "$node_dir" ] || continue
    node_name=$(basename "$node_dir")
    if [ ! -d "$COMFYUI_DIR/custom_nodes/$node_name" ]; then
      ln -sf "$node_dir" "$COMFYUI_DIR/custom_nodes/$node_name"
    fi
  done
fi
HOOK
chmod +x "$V/startup-loras.sh"
echo "  ✅ startup-loras.sh 已更新"

if [ -d "/comfyui/models" ]; then
  echo "  检测到本地 ComfyUI，执行链接..."
  bash "$V/startup-loras.sh"
fi

echo ""
echo "═══ 卷上 LoRA 清单 ═══"
ls -1 "$L/"*.safetensors 2>/dev/null | xargs -I{} basename {} | sort
echo ""
echo "总计: $(ls "$L/"*.safetensors 2>/dev/null | wc -l) 个 LoRA"
REMOTE_SCRIPT

echo ""
echo "✅ 远程同步完成!"

# ─── Step 4: 清理 Pod ─────────────────────────────────────────
echo ""
echo "🧹 Step 4: 销毁临时 Pod..."
curl -s -X POST "$API" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { podTerminate(input: { podId: \\\"$POD_ID\\\" }) }\"}" > /dev/null
echo "✅ Pod $POD_ID 已销毁"

# ─── Step 5: 输出 Vercel 环境变量 ─────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  📋 LoRA 分配方案 (Vercel 环境变量)"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  RUNPOD_INSTALLED_LORAS_FLUX=\"flux_realism_xlabs.safetensors;flux_add_details.safetensors;flux_uncensored.safetensors;flux_krea_realism.safetensors;flux_hyperrealism_aidma.safetensors;flux_detail_enhancer.safetensors;flux_nsfw_klein_v2.safetensors;flux_style_photoreal_v1.safetensors;flux_style_cinematic_v1.safetensors;flux_detail_skin_v1.safetensors;flux_detail_hands_v1.safetensors;flux_body_curvy_v1.safetensors;flux_outfit_lingerie_v1.safetensors;flux_pose_nsfw_dynamic_v1.safetensors\""
echo ""
echo "  RUNPOD_FLUX_FEMALE_LORAS=\"flux_realism_xlabs.safetensors;flux_add_details.safetensors;flux_uncensored.safetensors\""
echo "  RUNPOD_FLUX_MALE_LORAS=\"flux_krea_realism.safetensors;flux_add_details.safetensors;flux_uncensored.safetensors\""
echo "  RUNPOD_FLUX_TRANSGENDER_LORAS=\"flux_hyperrealism_aidma.safetensors;flux_add_details.safetensors;flux_uncensored.safetensors\""
echo "  RUNPOD_FLUX_ANIME_LORAS=\"flux_detail_enhancer.safetensors\""
echo "  RUNPOD_FLUX_NSFW_LORAS=\"flux_nsfw_klein_v2.safetensors\""
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ LoRA 同步完成!"
echo "  ⚠️  ComfyUI worker 冷启动后自动加载 (startup-loras.sh)"
echo "═══════════════════════════════════════════════════════"
