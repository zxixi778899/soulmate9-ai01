#!/usr/bin/env bash
# SoulMate AI - 下载必要的 Custom Nodes 和 NSFW LoRA
# 支持 FLUX 和 SDXL (Pony/Illustrious) 模型族
#
# 用法:
#   export CIVITAI_API_TOKEN='your_token'
#   bash download-nodes-and-loras.sh

set -e

RUNPOD_VOLUME="/runpod-volume"
LORA_DIR="$RUNPOD_VOLUME/models/loras"
COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"

echo "🎯 SoulMate AI - Custom Nodes & NSFW LoRA 下载脚本"
echo "================================"
echo ""

# 检查 CIVITAI_API_TOKEN
if [ -z "${CIVITAI_API_TOKEN:-}" ]; then
    echo "❌ ERROR: 请先设置 CIVITAI_API_TOKEN"
    echo "   export CIVITAI_API_TOKEN='your_token'"
    echo ""
    echo "   获取 Token: https://civitai.com/user/account"
    exit 1
fi

echo "✅ CIVITAI_API_TOKEN 已设置"
echo ""

# ============================================
# 1. 安装缺失的 Custom Nodes
# ============================================
echo "📦 检查并安装缺失的 Custom Nodes..."
echo "================================"
echo ""

export PATH="/opt/venv/bin:$PATH"
export PIP_NO_INPUT=1
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=/bin/true

install_node() {
    local repo_url="$1"
    local node_name="$2"
    
    if [ ! -d "$CUSTOM_NODES/$node_name" ]; then
        echo "📥 安装 $node_name..."
        if GIT_TERMINAL_PROMPT=0 git clone --depth 1 "$repo_url" "$CUSTOM_NODES/$node_name" 2>/dev/null; then
            # 安装依赖
            if [ -f "$CUSTOM_NODES/$node_name/requirements.txt" ]; then
                echo "  安装依赖..."
                python -m pip install --no-cache-dir -r "$CUSTOM_NODES/$node_name/requirements.txt" --quiet || true
            fi
            echo "✅ $node_name 安装成功"
        else
            echo "⚠️  $node_name 安装失败（可能仓库不存在）"
        fi
    else
        echo "✅ $node_name 已安装"
    fi
}

# 核心节点
install_node "https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git" "comfyui-ipadapter-flux"
install_node "https://github.com/Mikubill/sd-webui-controlnet.git" "sd-webui-controlnet"
install_node "https://github.com/ltdrdata/ComfyUI-Impact-Pack.git" "ImpactPack"
install_node "https://github.com/kijai/ComfyUI-KJNodes.git" "ComfyUI-KJNodes"
install_node "https://github.com/1038lab/ComfyUI-Mosaic.git" "ComfyUI-Mosaic"
install_node "https://github.com/pythongosssss/ComfyUI-Manager.git" "ComfyUI-Manager"

echo ""

# ============================================
# 2. 创建 LoRA 目录
# ============================================
mkdir -p "$LORA_DIR"

echo "📂 LoRA 目录: $LORA_DIR"
echo ""

# ============================================
# 3. 下载 FLUX NSFW LoRA
# ============================================
echo "🎨 下载 FLUX NSFW LoRA..."
echo "================================"
echo ""

download_lora() {
    local filename="$1"
    local url="$2"
    local dest="$LORA_DIR/$filename"
    
    # 检查是否已存在
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
        
        # 检查文件大小（至少 100KB）
        if [ "$size" -lt 102400 ]; then
            echo "  ❌ 失败：文件太小 ($size bytes) - 可能是认证错误或模型已删除"
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

# FLUX LoRA 清单
FLUX_LORAS=(
    # Tier A — 画质增强
    "flux_style_photoreal_v1.safetensors|https://civitai.com/api/download/models/1084957"
    "flux_style_hyperreal_aidma_v1.safetensors|https://civitai.com/api/download/models/980278"
    "flux_detail_skin_v1.safetensors|https://civitai.com/api/download/models/827325"
    "flux_detail_skin_nplastic_v1.safetensors|https://civitai.com/api/download/models/1301668"
    "flux_detail_hands_v1.safetensors|https://civitai.com/api/download/models/1003317"
    "flux_detail_upgrader_v1.safetensors|https://civitai.com/api/download/models/984672"
    
    # Tier B — 体型
    "flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/1668530"
    "flux_body_pear_v1.safetensors|https://civitai.com/api/download/models/1276427"
    
    # Tier C — 服装 (NSFW)
    "flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894"
    "flux_outfit_bunny_v1.safetensors|https://civitai.com/api/download/models/817758"
    "flux_outfit_maid_v1.safetensors|https://civitai.com/api/download/models/1588611"
    "flux_outfit_bikini_v1.safetensors|https://civitai.com/api/download/models/1184191"
    "flux_outfit_latex_v1.safetensors|https://civitai.com/api/download/models/734230"
    "flux_outfit_school_v1.safetensors|https://civitai.com/api/download/models/2163726"
    
    # Tier D — NSFW 姿势和表情
    "flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/746602"
    "flux_face_ahegao_v1.safetensors|https://civitai.com/api/download/models/1477302"
    
    # Tier E — 电影风格
    "flux_style_cinematic_v1.safetensors|https://civitai.com/api/download/models/953083"
)

flux_ok=0
flux_fail=0
flux_skip=0

for lora in "${FLUX_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        flux_skip=$((flux_skip + 1))
    elif download_lora "$filename" "$url"; then
        flux_ok=$((flux_ok + 1))
    else
        flux_fail=$((flux_fail + 1))
    fi
done

echo ""
echo "FLUX LoRA 下载完成: ✅ $flux_ok 成功, ⏭️  $flux_skip 跳过, ❌ $flux_fail 失败"
echo ""

# ============================================
# 4. 下载 SDXL/Pony/Illustrious NSFW LoRA
# ============================================
echo "🎨 下载 SDXL (Pony/Illustrious) NSFW LoRA..."
echo "================================"
echo ""

SDXL_LORAS=(
    # Illustrious 细节增强
    "AddMicroDetails_Illustrious_v6.safetensors|https://civitai.com/api/download/models/2832991"
    "StS-Illustrious-Detail-Slider-v1.0.safetensors|https://civitai.com/api/download/models/1122976"
    "BackgroundDetailerV3-000004.safetensors|https://civitai.com/api/download/models/726791"
    
    # Pony NSFW
    "Girl-Size-alpha1.0-rank4.safetensors|https://civitai.com/api/download/models/544022"
)

sdxl_ok=0
sdxl_fail=0
sdxl_skip=0

for lora in "${SDXL_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        sdxl_skip=$((sdxl_skip + 1))
    elif download_lora "$filename" "$url"; then
        sdxl_ok=$((sdxl_ok + 1))
    else
        sdxl_fail=$((sdxl_fail + 1))
    fi
done

echo ""
echo "SDXL LoRA 下载完成: ✅ $sdxl_ok 成功, ⏭️  $sdxl_skip 跳过, ❌ $sdxl_fail 失败"
echo ""

# ============================================
# 5. 显示最终状态
# ============================================
echo "================================"
echo "✨ 下载完成!"
echo "================================"
echo ""

echo "📦 已安装的 Custom Nodes:"
ls -1 "$CUSTOM_NODES/" 2>/dev/null || echo "  (无)"
echo ""

echo "🎨 已下载的 LoRA 文件:"
echo ""
echo "FLUX LoRA:"
ls -lhS "$LORA_DIR"/flux_*.safetensors 2>/dev/null | head -20 || echo "  (无)"
echo ""
echo "SDXL/Pony/Illustrious LoRA:"
ls -lhS "$LORA_DIR"/*Illustrious*.safetensors "$LORA_DIR"/*Pony*.safetensors "$LORA_DIR"/Girl-Size*.safetensors 2>/dev/null | head -20 || echo "  (无)"
echo ""

total_loras=$(ls "$LORA_DIR"/*.safetensors 2>/dev/null | wc -l)
total_size=$(du -sh "$LORA_DIR" 2>/dev/null | awk '{print $1}')

echo "📊 统计:"
echo "  - 总 LoRA 数量: $total_loras"
echo "  - 总大小: $total_size"
echo "  - FLUX: $flux_ok 新下载, $flux_skip 已存在, $flux_fail 失败"
echo "  - SDXL: $sdxl_ok 新下载, $sdxl_skip 已存在, $sdxl_fail 失败"
echo ""

echo "💡 下一步:"
echo "1. 重启 ComfyUI 以加载新节点"
echo "2. 在 ComfyUI 中验证 LoRA 是否可用"
echo "3. 更新环境变量 RUNPOD_INSTALLED_LORAS_FLUX/PONY/ILLUSTRIOUS"
echo ""
