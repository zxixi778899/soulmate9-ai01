#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# SoulMate9 — IP-Adapter 一键安装脚本
# 在 US-CA-2 创建临时 Pod，下载模型 + 安装自定义节点，然后销毁
# ═══════════════════════════════════════════════════════════════
# 使用方法:
#   export RUNPOD_API_KEY="rpa_xxx"
#   bash scripts/install-ipadapter.sh
#
# 前置条件:
#   - RunPod API Key
#   - US-CA-2 有 GPU 库存（脚本会自动尝试多种 GPU）
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

API="https://api.runpod.io/graphql"
AUTH="Authorization: Bearer ${RUNPOD_API_KEY:?请设置 RUNPOD_API_KEY}"
VOLUME_ID="p1dup48kuq"
DC="US-CA-2"
POD_NAME="ipadapter-install-$(date +%s)"

# 按优先级尝试的 GPU 列表
GPU_TYPES=(
  "NVIDIA GeForce RTX 4090"
  "NVIDIA GeForce RTX 3090"
  "NVIDIA RTX A5000"
  "NVIDIA RTX A6000"
  "NVIDIA L4"
  "NVIDIA A40"
  "NVIDIA GeForce RTX 4080 SUPER"
  "NVIDIA RTX 5000 Ada Generation"
)

echo "═══════════════════════════════════════════════════════"
echo "  IP-Adapter 安装 — 目标: ${DC} 卷 ${VOLUME_ID}"
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
    echo "✅ 成功! Pod=$POD_ID"
    break
  else
    echo "❌ 无库存"
  fi
done

if [ -z "$POD_ID" ]; then
  echo ""
  echo "❌ 所有 GPU 类型在 ${DC} 均无库存。请稍后重试。"
  echo "   提示: 运行 'watch -n 60 bash scripts/install-ipadapter.sh' 自动重试"
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

  # 提取 SSH 端口 (type=ssh 或 privatePort=22)
  SSH_IP=$(echo "$POD_INFO" | grep -o '"ip":"[^"]*"' | head -1 | cut -d'"' -f4 || true)
  SSH_PORT=$(echo "$POD_INFO" | grep -o '"publicPort":[0-9]*' | head -1 | cut -d: -f2 || true)

  if [ -n "$SSH_IP" ] && [ -n "$SSH_PORT" ] && [ "$SSH_PORT" != "null" ]; then
    echo "  ✅ Pod 就绪! SSH: root@${SSH_IP}:${SSH_PORT}"
    break
  fi
  echo "  等待中... ($i/60)"
done

if [ -z "$SSH_IP" ] || [ -z "$SSH_PORT" ]; then
  echo "❌ Pod 启动超时，正在清理..."
  curl -s -X POST "$API" -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"query\": \"mutation { podTerminate(input: { podId: \\\"$POD_ID\\\" }) }\"}" > /dev/null
  exit 1
fi

# ─── Step 3: 执行安装 ─────────────────────────────────────────
echo ""
echo "📦 Step 3: 下载模型 + 安装节点..."

SSH_CMD="ssh -o StrictHostKeyChecking=no -o ConnectTimeout=30 -p $SSH_PORT root@$SSH_IP"

# 等待 SSH 可达
for i in $(seq 1 12); do
  if $SSH_CMD "echo ok" 2>/dev/null; then break; fi
  echo "  SSH 连接中... ($i/12)"
  sleep 10
done

$SSH_CMD bash <<'REMOTE_SCRIPT'
set -euo pipefail

VOLUME="/runpod-volume"
echo "=== 网络卷内容 ==="
ls "$VOLUME/" 2>/dev/null || echo "(空)"

# 创建目录
mkdir -p "$VOLUME/models/ipadapter" "$VOLUME/models/clip_vision" "$VOLUME/custom_nodes"

# 下载 IP-Adapter 模型 (~98MB)
echo ""
echo ">>> 下载 ip-adapter.safetensors ..."
if [ ! -f "$VOLUME/models/ipadapter/ip-adapter.safetensors" ]; then
  wget -q --show-progress -O "$VOLUME/models/ipadapter/ip-adapter.safetensors" \
    "https://huggingface.co/InstantX/FLUX.1-dev-IP-Adapter/resolve/main/ip-adapter.safetensors"
  echo "✅ ip-adapter.safetensors 下载完成 ($(du -h "$VOLUME/models/ipadapter/ip-adapter.safetensors" | cut -f1))"
else
  echo "⏭️  已存在，跳过"
fi

# 下载 CLIP Vision 模型 (~3.5GB)
echo ""
echo ">>> 下载 sigclip_vision_384.safetensors ..."
if [ ! -f "$VOLUME/models/clip_vision/sigclip_vision_384.safetensors" ]; then
  wget -q --show-progress -O "$VOLUME/models/clip_vision/sigclip_vision_384.safetensors" \
    "https://huggingface.co/Comfy-Org/sigclip_vision_384/resolve/main/sigclip_vision_patch14_384.safetensors"
  echo "✅ sigclip_vision_384.safetensors 下载完成 ($(du -h "$VOLUME/models/clip_vision/sigclip_vision_384.safetensors" | cut -f1))"
else
  echo "⏭️  已存在，跳过"
fi

# 安装 ComfyUI_IPAdapter_plus 自定义节点到卷
echo ""
echo ">>> 安装 ComfyUI_IPAdapter_plus ..."
if [ ! -d "$VOLUME/custom_nodes/ComfyUI_IPAdapter_plus" ]; then
  cd "$VOLUME/custom_nodes"
  git clone --depth 1 https://github.com/cubiq/ComfyUI_IPAdapter_plus.git
  echo "✅ ComfyUI_IPAdapter_plus 克隆完成"
else
  echo "⏭️  已存在，跳过"
fi

# 创建启动钩子脚本（ComfyUI worker 冷启动时可执行）
cat > "$VOLUME/startup-ipadapter.sh" <<'HOOK'
#!/bin/bash
# IP-Adapter 启动钩子 - ComfyUI worker 冷启动时执行
# 将网络卷上的自定义节点链接到 ComfyUI 目录
COMFYUI_DIR="${COMFYUI_DIR:-/comfyui}"
VOLUME="/runpod-volume"

# 链接自定义节点
if [ -d "$VOLUME/custom_nodes/ComfyUI_IPAdapter_plus" ] && [ ! -d "$COMFYUI_DIR/custom_nodes/ComfyUI_IPAdapter_plus" ]; then
  ln -sf "$VOLUME/custom_nodes/ComfyUI_IPAdapter_plus" "$COMFYUI_DIR/custom_nodes/ComfyUI_IPAdapter_plus"
  echo "[startup-hook] Linked ComfyUI_IPAdapter_plus"
fi

# 链接模型目录
for dir in ipadapter clip_vision; do
  if [ -d "$VOLUME/models/$dir" ] && [ ! -d "$COMFYUI_DIR/models/$dir" ]; then
    ln -sf "$VOLUME/models/$dir" "$COMFYUI_DIR/models/$dir"
    echo "[startup-hook] Linked models/$dir"
  fi
done

# 安装 Python 依赖
if [ -f "$VOLUME/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt" ]; then
  pip install -q -r "$VOLUME/custom_nodes/ComfyUI_IPAdapter_plus/requirements.txt" 2>/dev/null || true
fi
HOOK
chmod +x "$VOLUME/startup-ipadapter.sh"
echo "✅ 启动钩子已创建: $VOLUME/startup-ipadapter.sh"

# 如果当前 Pod 上有 ComfyUI（不太可能，但以防万一）
if [ -d "/comfyui/custom_nodes" ]; then
  echo ">>> 检测到本地 ComfyUI，直接安装..."
  bash "$VOLUME/startup-ipadapter.sh"
fi

# 验证
echo ""
echo "=== 验证文件 ==="
echo "IP-Adapter 模型:"
ls -lh "$VOLUME/models/ipadapter/" 2>/dev/null || echo "  (缺失!)"
echo ""
echo "CLIP Vision 模型:"
ls -lh "$VOLUME/models/clip_vision/" 2>/dev/null || echo "  (缺失!)"
echo ""
echo "自定义节点:"
ls "$VOLUME/custom_nodes/" 2>/dev/null || echo "  (缺失!)"
echo ""
echo "启动钩子:"
ls -la "$VOLUME/startup-ipadapter.sh" 2>/dev/null
echo ""
echo "🎉 文件全部就位!"
REMOTE_SCRIPT

echo ""
echo "✅ 远程安装完成!"

# ─── Step 4: 清理 Pod ─────────────────────────────────────────
echo ""
echo "🧹 Step 4: 销毁临时 Pod..."
curl -s -X POST "$API" -H "$AUTH" -H "Content-Type: application/json" \
  -d "{\"query\": \"mutation { podTerminate(input: { podId: \\\"$POD_ID\\\" }) }\"}" > /dev/null
echo "✅ Pod $POD_ID 已销毁"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  ✅ IP-Adapter 安装完成!"
echo "  模型: /runpod-volume/models/ipadapter/ip-adapter.safetensors"
echo "  视觉: /runpod-volume/models/clip_vision/sigclip_vision_384.safetensors"
echo "  节点: /runpod-volume/custom_nodes/ComfyUI_IPAdapter_plus/"
echo ""
echo "  ⚠️  ComfyUI worker 需要重启才能加载新节点。"
echo "  方法: 在 RunPod Console 将 endpoint wozrrlcdipyl3p 的"
echo "  idle workers 设为 0，等待现有 worker 超时关闭，"
echo "  然后发送一次生图请求触发新 worker 冷启动。"
echo "═══════════════════════════════════════════════════════"
