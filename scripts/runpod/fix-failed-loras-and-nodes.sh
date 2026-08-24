#!/usr/bin/env bash
# SoulMate AI - 补全脚本：下载失败的 LoRA 替代品 + 安装必要节点
#
# 用法:
#   export CIVITAI_API_TOKEN='your_token'
#   bash fix-failed-loras-and-nodes.sh

# Don't use set -e, we want to continue even if some downloads fail
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true

RUNPOD_VOLUME="/runpod-volume"
LORA_DIR="$RUNPOD_VOLUME/models/loras"
COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"

echo "🔧 SoulMate AI - LoRA 补全 & 节点安装脚本"
echo "================================"
echo ""

mkdir -p "$LORA_DIR"

# ============================================
# 1. 下载函数
# ============================================
download_lora() {
    local filename="$1"
    local url="$2"
    local dest="$LORA_DIR/$filename"
    
    if [ -f "$dest" ]; then
        local size=$(stat -c%s "$dest" 2>/dev/null || echo 0)
        if [ "$size" -gt 102400 ]; then
            echo "⏭️  跳过 $filename (已存在, $(numfmt --to=iec $size))"
            return 0
        fi
    fi
    
    echo "📥 下载 $filename..."
    local tmp="${dest}.part"
    
    if curl -L --fail --retry 3 --retry-delay 3 \
        -H "Authorization: Bearer ${CIVITAI_API_TOKEN}" \
        -o "$tmp" "$url" 2>/dev/null; then
        
        local size=$(stat -c%s "$tmp" 2>/dev/null || echo 0)
        
        if [ "$size" -lt 102400 ]; then
            echo "  ❌ 失败：文件太小 ($size bytes)"
            rm -f "$tmp"
            return 1
        fi
        
        mv -f "$tmp" "$dest"
        echo "  ✅ 完成: $(numfmt --to=iec $size)"
        return 0
    else
        echo "  ❌ 失败：下载错误"
        rm -f "$tmp"
        return 1
    fi
}

# ============================================
# 2. SDXL NSFW LoRA 补全（已验证存在的模型）
# ============================================
echo "🎨 下载 SDXL NSFW LoRA 补全包..."
echo "================================"
echo ""

# 这些都是 Civitai 上实际存在且热门的 NSFW LoRA
# 替代之前失败的 6 个 LoRA
EXTRA_LORAS=(
    # 姿势和动作（替代 pony_nsfw_poses_v2）
    "pony_missionary_position.safetensors|https://civitai.com/api/download/models/371595"
    "pony_cowgirl_position.safetensors|https://civitai.com/api/download/models/390916"
    "pony_doggy_style_position.safetensors|https://civitai.com/api/download/models/382139"
    
    # 内衣和服装（替代 pony_lingerie_v2）
    "pony_seethrough_lingerie.safetensors|https://civitai.com/api/download/models/462146"
    "pony_swimsuit_v1.safetensors|https://civitai.com/api/download/models/297337"
    
    # 表情（替代 pony_ahegao_v2 和 illustrious_expressions_v1）
    "pony_ahegao_face.safetensors|https://civitai.com/api/download/models/322420"
    "illustrious_ahegao_v1.safetensors|https://civitai.com/api/download/models/1045021"
    
    # 体型（替代 pony_curvy_body_v1 和 pony_breast_slider_v1）
    "pony_bigger_breasts_slider.safetensors|https://civitai.com/api/download/models/356781"
    "pony_wider_hips_v1.safetensors|https://civitai.com/api/download/models/436327"
    
    # 真实感增强（Pony Realism 专用）
    "pony_realism_nsfw_v2.safetensors|https://civitai.com/api/download/models/2194682"
)

extra_ok=0
extra_fail=0
extra_skip=0
failed_list=()

for lora in "${EXTRA_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        extra_skip=$((extra_skip + 1))
    elif download_lora "$filename" "$url"; then
        extra_ok=$((extra_ok + 1))
    else
        extra_fail=$((extra_fail + 1))
        failed_list+=("$filename")
    fi
done

echo ""
echo "额外 LoRA 下载完成: ✅ $extra_ok 成功, ⏭️  $extra_skip 跳过, ❌ $extra_fail 失败"
echo ""

if [ ${#failed_list[@]} -gt 0 ]; then
    echo "⚠️  下载失败的文件:"
    for f in "${failed_list[@]}"; do
        echo "  - $f"
    done
    echo ""
fi

# ============================================
# 3. 检查并安装必要节点
# ============================================
echo "📦 检查并安装必要的 Custom Nodes..."
echo "================================"
echo ""

export PATH="/opt/venv/bin:$PATH"
export PIP_NO_INPUT=1

install_node() {
    local repo_url="$1"
    local node_name="$2"
    local branch="${3:-}"
    
    if [ -d "$CUSTOM_NODES/$node_name" ]; then
        echo "✅ $node_name 已安装"
        return 0
    fi
    
    echo "📥 安装 $node_name..."
    
    local clone_cmd="git clone --depth 1"
    if [ -n "$branch" ]; then
        clone_cmd="git clone --depth 1 --branch $branch"
    fi
    
    if GIT_TERMINAL_PROMPT=0 $clone_cmd "$repo_url" "$CUSTOM_NODES/$node_name" 2>/dev/null; then
        # 安装依赖
        if [ -f "$CUSTOM_NODES/$node_name/requirements.txt" ]; then
            echo "  安装依赖..."
            python -m pip install --no-cache-dir \
                -r "$CUSTOM_NODES/$node_name/requirements.txt" --quiet || true
        fi
        echo "✅ $node_name 安装成功"
        return 0
    else
        echo "⚠️  $node_name 安装失败"
        return 1
    fi
}

# FLUX 端点必要节点（来自 Dockerfile）
echo "--- FLUX 端点节点 ---"
install_node "https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git" "comfyui-ipadapter-flux"
install_node "https://github.com/Gourieff/ComfyUI-ADetailer.git" "ComfyUI-ADetailer"

# SDXL-Pro 端点必要节点（来自 Dockerfile.sdxl-pro）
echo ""
echo "--- SDXL-Pro 端点节点 ---"
install_node "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git" "ComfyUI-Impact-Pack"
install_node "https://github.com/ltdrdata/ComfyUI-Impact-Subpack.git" "ComfyUI-Impact-Subpack"
install_node "https://github.com/Fannovel16/comfyui_controlnet_aux.git" "comfyui_controlnet_aux"
install_node "https://github.com/cubiq/ComfyUI_IPAdapter_plus.git" "ComfyUI_IPAdapter_plus"
install_node "https://github.com/ltdrdata/ComfyUI-Manager.git" "ComfyUI-Manager"

# 安装 InsightFace（IPAdapter FaceID 需要）
echo ""
echo "📥 安装 InsightFace 依赖..."
python -m pip install --no-cache-dir insightface onnxruntime --quiet || true
echo "✅ InsightFace 依赖安装完成"

echo ""

# ============================================
# 4. 显示最终状态
# ============================================
echo "================================"
echo "✨ 补全完成!"
echo "================================"
echo ""

echo "📦 已安装的 Custom Nodes:"
ls -1 "$CUSTOM_NODES/" 2>/dev/null
echo ""

echo "🎨 SDXL LoRA 文件:"
ls -lhS "$LORA_DIR"/pony_*.safetensors "$LORA_DIR"/illustrious_*.safetensors \
    "$LORA_DIR"/BackgroundDetailer*.safetensors "$LORA_DIR"/AddMicroDetails*.safetensors \
    "$LORA_DIR"/StS-*.safetensors 2>/dev/null | head -30
echo ""

total_loras=$(ls "$LORA_DIR"/*.safetensors 2>/dev/null | wc -l)
total_size=$(du -sh "$LORA_DIR" 2>/dev/null | awk '{print $1}')

echo "📊 统计:"
echo "  - 总 LoRA 数量: $total_loras"
echo "  - LoRA 总大小: $total_size"
echo "  - 额外 LoRA: $extra_ok 新下载, $extra_skip 已存在, $extra_fail 失败"
echo ""

echo "💡 下一步:"
echo "1. 重启 ComfyUI 以加载新节点和 LoRA"
echo "2. 更新环境变量 RUNPOD_INSTALLED_LORAS_PONY/ILLUSTRIOUS"
echo ""
