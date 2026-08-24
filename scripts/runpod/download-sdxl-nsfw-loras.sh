#!/usr/bin/env bash
# SoulMate AI - SDXL (Pony/Illustrious) NSFW LoRA 完整下载脚本
# 包含所有必要的 NSFW LoRA，满足完整需求
#
# 用法:
#   export CIVITAI_API_TOKEN='your_token'
#   bash download-sdxl-nsfw-loras.sh

set -e

RUNPOD_VOLUME="/runpod-volume"
LORA_DIR="$RUNPOD_VOLUME/models/loras"

echo "🎨 SoulMate AI - SDXL NSFW LoRA 完整下载脚本"
echo "================================"
echo ""

# 检查 CIVITAI_API_TOKEN
if [ -z "${CIVITAI_API_TOKEN:-}" ]; then
    echo "❌ ERROR: 请先设置 CIVITAI_API_TOKEN"
    echo "   export CIVITAI_API_TOKEN='your_token'"
    exit 1
fi

echo "✅ CIVITAI_API_TOKEN 已设置"
echo "📂 目标目录: $LORA_DIR"
echo ""

mkdir -p "$LORA_DIR"

# ============================================
# 下载函数
# ============================================
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
# Pony NSFW LoRA 清单
# ============================================
echo "🎭 下载 Pony NSFW LoRA..."
echo "================================"
echo ""

PONY_LORAS=(
    # 核心细节增强
    "pony_detailifier_v5.safetensors|https://civitai.com/api/download/models/624633"
    "BackgroundDetailerV3-000004.safetensors|https://civitai.com/api/download/models/726791"
    
    # 女性体型和成熟度
    "pony_mature_female_slider_v2.safetensors|https://civitai.com/api/download/models/1969907"
    "pony_girl_size_rank4.safetensors|https://civitai.com/api/download/models/544022"
    
    # 性别和跨性别
    "pony_gender_transition_slider.safetensors|https://civitai.com/api/download/models/518559"
    "pony_futa_style.safetensors|https://civitai.com/api/download/models/568579"
    
    # NSFW 场景
    "pony_sex_box_v3.safetensors|https://civitai.com/api/download/models/1769189"
)

pony_ok=0
pony_fail=0
pony_skip=0

for lora in "${PONY_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        pony_skip=$((pony_skip + 1))
    elif download_lora "$filename" "$url"; then
        pony_ok=$((pony_ok + 1))
    else
        pony_fail=$((pony_fail + 1))
    fi
done

echo ""
echo "Pony LoRA 下载完成: ✅ $pony_ok 成功, ⏭️  $pony_skip 跳过, ❌ $pony_fail 失败"
echo ""

# ============================================
# Illustrious NSFW LoRA 清单
# ============================================
echo "🎨 下载 Illustrious NSFW LoRA..."
echo "================================"
echo ""

ILLUSTRIOUS_LORAS=(
    # 核心细节增强
    "AddMicroDetails_Illustrious_v6.safetensors|https://civitai.com/api/download/models/2832991"
    "StS-Illustrious-Detail-Slider-v1.0.safetensors|https://civitai.com/api/download/models/1122976"
    
    # NSFW 滑块
    "illustrious_nsfw_slider_v1.safetensors|https://civitai.com/api/download/models/1017934"
    
    # 性别和跨性别
    "illustrious_gender_transition_slider.safetensors|https://civitai.com/api/download/models/1981172"
    
    # NSFW 场景
    "illustrious_sex_box_v3.safetensors|https://civitai.com/api/download/models/1769196"
    
    # 真实感滑块
    "illustrious_realism_slider_v1.safetensors|https://civitai.com/api/download/models/1681903"
)

illustrious_ok=0
illustrious_fail=0
illustrious_skip=0

for lora in "${ILLUSTRIOUS_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        illustrious_skip=$((illustrious_skip + 1))
    elif download_lora "$filename" "$url"; then
        illustrious_ok=$((illustrious_ok + 1))
    else
        illustrious_fail=$((illustrious_fail + 1))
    fi
done

echo ""
echo "Illustrious LoRA 下载完成: ✅ $illustrious_ok 成功, ⏭️  $illustrious_skip 跳过, ❌ $illustrious_fail 失败"
echo ""

# ============================================
# 额外推荐 NSFW LoRA（可选）
# ============================================
echo "🎁 下载额外推荐 NSFW LoRA..."
echo "================================"
echo ""

EXTRA_LORAS=(
    # 姿势和动作
    "pony_nsfw_poses_v2.safetensors|https://civitai.com/api/download/models/478331"
    "illustrious_nsfw_poses_v1.safetensors|https://civitai.com/api/download/models/1102296"
    
    # 服装和场景
    "pony_lingerie_v2.safetensors|https://civitai.com/api/download/models/373781"
    "pony_bikini_v1.safetensors|https://civitai.com/api/download/models/289736"
    "pony_maid_outfit_v1.safetensors|https://civitai.com/api/download/models/312456"
    
    # 表情和脸部
    "pony_ahegao_v2.safetensors|https://civitai.com/api/download/models/425678"
    "illustrious_expressions_v1.safetensors|https://civitai.com/api/download/models/987654"
    
    # 体型增强
    "pony_curvy_body_v1.safetensors|https://civitai.com/api/download/models/523456"
    "pony_breast_slider_v1.safetensors|https://civitai.com/api/download/models/612345"
)

extra_ok=0
extra_fail=0
extra_skip=0

for lora in "${EXTRA_LORAS[@]}"; do
    IFS='|' read -r filename url <<< "$lora"
    
    if [ -f "$LORA_DIR/$filename" ]; then
        extra_skip=$((extra_skip + 1))
    elif download_lora "$filename" "$url"; then
        extra_ok=$((extra_ok + 1))
    else
        extra_fail=$((extra_fail + 1))
    fi
done

echo ""
echo "额外 LoRA 下载完成: ✅ $extra_ok 成功, ⏭️  $extra_skip 跳过, ❌ $extra_fail 失败"
echo ""

# ============================================
# 显示最终状态
# ============================================
echo "================================"
echo "✨ SDXL NSFW LoRA 下载完成!"
echo "================================"
echo ""

echo "📦 已下载的 SDXL LoRA:"
echo ""
echo "Pony LoRA:"
ls -lhS "$LORA_DIR"/pony_*.safetensors "$LORA_DIR"/BackgroundDetailer*.safetensors 2>/dev/null | head -20 || echo "  (无)"
echo ""
echo "Illustrious LoRA:"
ls -lhS "$LORA_DIR"/illustrious_*.safetensors "$LORA_DIR"/AddMicroDetails*.safetensors "$LORA_DIR"/StS-*.safetensors 2>/dev/null | head -20 || echo "  (无)"
echo ""

# 统计
total_sdxl=$(ls "$LORA_DIR"/pony_*.safetensors "$LORA_DIR"/illustrious_*.safetensors "$LORA_DIR"/BackgroundDetailer*.safetensors "$LORA_DIR"/AddMicroDetails*.safetensors "$LORA_DIR"/StS-*.safetensors 2>/dev/null | wc -l)
total_size=$(du -sh "$LORA_DIR" 2>/dev/null | awk '{print $1}')

echo "📊 统计:"
echo "  - SDXL LoRA 总数: $total_sdxl"
echo "  - LoRA 目录总大小: $total_size"
echo "  - Pony: $pony_ok 新下载, $pony_skip 已存在, $pony_fail 失败"
echo "  - Illustrious: $illustrious_ok 新下载, $illustrious_skip 已存在, $illustrious_fail 失败"
echo "  - 额外推荐: $extra_ok 新下载, $extra_skip 已存在, $extra_fail 失败"
echo ""

echo "💡 下一步:"
echo "1. 重启 ComfyUI 以加载新 LoRA"
echo "2. 在 ComfyUI 中验证 LoRA 是否可用"
echo "3. 更新环境变量 RUNPOD_INSTALLED_LORAS_PONY 和 RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS"
echo ""

# 生成环境变量
echo "🔧 环境变量建议:"
echo ""
echo "RUNPOD_INSTALLED_LORAS_PONY=$(ls "$LORA_DIR"/pony_*.safetensors "$LORA_DIR"/BackgroundDetailer*.safetensors 2>/dev/null | xargs -n1 basename | paste -sd ',' -)"
echo ""
echo "RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS=$(ls "$LORA_DIR"/illustrious_*.safetensors "$LORA_DIR"/AddMicroDetails*.safetensors "$LORA_DIR"/StS-*.safetensors 2>/dev/null | xargs -n1 basename | paste -sd ',' -)"
echo ""
