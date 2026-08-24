#!/usr/bin/env bash
# SoulMate AI - SDXL NSFW LoRA 补全脚本（已验证的真实版本 ID）
# 通过 Civitai API 实际搜索验证过的热门 NSFW LoRA
#
# 用法:
#   export CIVITAI_API_TOKEN='your_token'
#   bash download-sdxl-extra-loras.sh

export GIT_TERMINAL_PROMPT=0

LORA_DIR="/runpod-volume/models/loras"

echo "🎨 SoulMate AI - SDXL NSFW LoRA 补全脚本（已验证版本）"
echo "================================"
echo ""

if [ -z "${CIVITAI_API_TOKEN:-}" ]; then
    echo "❌ ERROR: 请先设置 CIVITAI_API_TOKEN"
    exit 1
fi

mkdir -p "$LORA_DIR"

download_lora() {
    local filename="$1"
    local url="$2"
    local dest="$LORA_DIR/$filename"
    
    if [ -f "$dest" ]; then
        local size=$(stat -c%s "$dest" 2>/dev/null || echo 0)
        if [ "$size" -gt 102400 ]; then
            echo "⏭️  跳过 $filename (已存在)"
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
# 已验证的 LoRA 清单（通过 Civitai API 搜索确认存在）
# 格式: 文件名|下载URL|说明
# ============================================

echo "📍 姿势类 LoRA (Sex Positions)..."
echo "--------------------------------"

POSITION_LORAS=(
    # 女上位（20364 下载，Pony，nsfwLevel 60）
    "cowgirl_position_nonpov_pony.safetensors|https://civitai.com/api/download/models/510266"
    # 独轮车姿势（4633 下载，Pony）
    "wheelbarrow_position_pony.safetensors|https://civitai.com/api/download/models/504452"
    # 椅子姿势（2249 下载，Pony，仅 28MB）
    "chair_position_pony.safetensors|https://civitai.com/api/download/models/627721"
    # BDSM 姿势包（7595 下载，Pony）
    "bdsm_positions_pony.safetensors|https://civitai.com/api/download/models/630405"
    # 超级姿势概念版（7759 下载，Illustrious）
    "super_position_illustrious.safetensors|https://civitai.com/api/download/models/1282186"
)

echo ""
echo "😮 表情类 LoRA (Ahegao/Face)..."
echo "--------------------------------"

FACE_LORAS=(
    # 颜射滑块（17698 下载，Pony，94MB）
    "toro_ahegao_slider_pony.safetensors|https://civitai.com/api/download/models/338805"
    # 更好的 Ahegao（14989 下载，Illustrious）
    "better_ahegao_illustrious.safetensors|https://civitai.com/api/download/models/1616431"
    # Ahegao v2（9762 下载，Pony）
    "ahegao_v2_pony.safetensors|https://civitai.com/api/download/models/471570"
)

echo ""
echo "👙 体型类 LoRA (Body Sliders)..."
echo "--------------------------------"

BODY_LORAS=(
    # 体型滑块（41732 下载，Pony，仅 8MB）- 最热门
    "body_type_slider_pony.safetensors|https://civitai.com/api/download/models/520909"
    # 体型滑块（32383 下载，Illustrious，仅 8MB）
    "body_type_slider_illustrious.safetensors|https://civitai.com/api/download/models/1845953"
    # 胖瘦滑块（3169 下载，Illustrious）
    "skinny_fat_slider_illustrious.safetensors|https://civitai.com/api/download/models/2825512"
    # 胸部尺寸滑块（17156 下载，Illustrious，仅 8MB）
    "breasts_size_slider_illustrious.safetensors|https://civitai.com/api/download/models/1061714"
    # 巨乳+苗条身材（14710 下载，Pony）
    "oppai_large_breasts_pony.safetensors|https://civitai.com/api/download/models/623811"
    # 下垂胸部（14587 下载，Pony，28MB）
    "sagging_breasts_pony.safetensors|https://civitai.com/api/download/models/456826"
)

# ============================================
# 下载所有 LoRA
# ============================================
ok=0
fail=0
skip=0
failed_list=()

download_group() {
    local -n loras=$1
    for lora in "${loras[@]}"; do
        IFS='|' read -r filename url <<< "$lora"
        
        if [ -f "$LORA_DIR/$filename" ]; then
            local size=$(stat -c%s "$LORA_DIR/$filename" 2>/dev/null || echo 0)
            if [ "$size" -gt 102400 ]; then
                skip=$((skip + 1))
                echo "⏭️  跳过 $filename (已存在)"
                continue
            fi
        fi
        
        if download_lora "$filename" "$url"; then
            ok=$((ok + 1))
        else
            fail=$((fail + 1))
            failed_list+=("$filename")
        fi
    done
}

download_group POSITION_LORAS
echo ""
download_group FACE_LORAS
echo ""
download_group BODY_LORAS

# ============================================
# 显示最终状态
# ============================================
echo ""
echo "================================"
echo "✨ 补全完成!"
echo "================================"
echo ""
echo "📊 统计:"
echo "  - ✅ 成功: $ok"
echo "  - ⏭️  跳过: $skip"
echo "  - ❌ 失败: $fail"
echo ""

if [ ${#failed_list[@]} -gt 0 ]; then
    echo "⚠️  失败的文件:"
    for f in "${failed_list[@]}"; do
        echo "  - $f"
    done
    echo ""
fi

total_loras=$(ls "$LORA_DIR"/*.safetensors 2>/dev/null | wc -l)
total_size=$(du -sh "$LORA_DIR" 2>/dev/null | awk '{print $1}')

echo "📦 LoRA 目录总览:"
echo "  - 总数量: $total_loras"
echo "  - 总大小: $total_size"
echo ""

echo "🎨 SDXL LoRA 文件列表:"
ls -lhS "$LORA_DIR"/*.safetensors 2>/dev/null | grep -v flux_ | head -35
echo ""

echo "💡 下一步:"
echo "1. 重启 ComfyUI 以加载新 LoRA"
echo "2. 更新环境变量 RUNPOD_INSTALLED_LORAS_PONY/ILLUSTRIOUS"
echo ""
