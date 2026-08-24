#!/usr/bin/env bash
# SoulMate AI - RunPod 卷内容分析和清理脚本
# 用于识别和删除不必要的文件

RUNPOD_VOLUME="/runpod-volume"

echo "🔍 Analyzing RunPod volume content..."
echo ""

# ============================================
# 1. 显示目录结构和大小
# ============================================
echo "📊 Directory Size Analysis:"
echo "================================"
du -sh "$RUNPOD_VOLUME"/* 2>/dev/null | sort -hr
echo ""

# ============================================
# 2. 列出所有目录内容
# ============================================
echo "📁 Detailed Directory Contents:"
echo "================================"

for dir in "$RUNPOD_VOLUME"/*/; do
    if [ -d "$dir" ]; then
        echo ""
        echo "📂 $(basename "$dir")/"
        ls -lah "$dir" | head -20
    fi
done

echo ""
echo "================================"
echo ""

# ============================================
# 3. 查找大文件 (>100MB)
# ============================================
echo "🔎 Large Files (>100MB):"
echo "================================"
find "$RUNPOD_VOLUME" -type f -size +100M -exec ls -lh {} \; 2>/dev/null | awk '{print $9 ": " $5}'
echo ""

# ============================================
# 4. 查找临时文件和缓存
# ============================================
echo "🗑️  Temporary Files and Caches:"
echo "================================"

echo "Python cache directories:"
find "$RUNPOD_VOLUME" -type d -name "__pycache__" 2>/dev/null

echo ""
echo "Git directories:"
find "$RUNPOD_VOLUME" -type d -name ".git" 2>/dev/null

echo ""
echo "Cache files:"
find "$RUNPOD_VOLUME" -type d -name ".cache" 2>/dev/null
find "$RUNPOD_VOLUME" -type d -name "*cache*" 2>/dev/null

echo ""
echo "Temporary files:"
find "$RUNPOD_VOLUME" -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*~" -o -name "*.bak" -o -name "*.backup" \) 2>/dev/null

echo ""
echo "Log files:"
find "$RUNPOD_VOLUME" -type f -name "*.log" 2>/dev/null

echo ""
echo "================================"
echo ""

# ============================================
# 5. 检查 quarantine 目录
# ============================================
echo "⚠️  Quarantine Directory (suspicious files):"
echo "================================"
if [ -d "$RUNPOD_VOLUME/quarantine" ]; then
    ls -lah "$RUNPOD_VOLUME/quarantine/"
    QUARANTINE_SIZE=$(du -sh "$RUNPOD_VOLUME/quarantine" 2>/dev/null | awk '{print $1}')
    echo "Size: $QUARANTINE_SIZE"
else
    echo "Not found"
fi
echo ""

# ============================================
# 6. 检查 huggingface-cache
# ============================================
echo "🤗 HuggingFace Cache:"
echo "================================"
if [ -d "$RUNPOD_VOLUME/huggingface-cache" ]; then
    du -sh "$RUNPOD_VOLUME/huggingface-cache"
    ls -lah "$RUNPOD_VOLUME/huggingface-cache/" | head -20
else
    echo "Not found"
fi
echo ""

# ============================================
# 7. 检查 .cache 目录
# ============================================
echo "📦 General Cache (.cache):"
echo "================================"
if [ -d "$RUNPOD_VOLUME/.cache" ]; then
    du -sh "$RUNPOD_VOLUME/.cache"
    ls -lah "$RUNPOD_VOLUME/.cache/" | head -20
else
    echo "Not found"
fi
echo ""

# ============================================
# 8. 检查重复的 ComfyUI 目录
# ============================================
echo "🔍 ComfyUI Directories Check:"
echo "================================"
if [ -d "$RUNPOD_VOLUME/ComfyUI" ]; then
    echo "✅ Found: $RUNPOD_VOLUME/ComfyUI"
    du -sh "$RUNPOD_VOLUME/ComfyUI"
fi
if [ -d "$RUNPOD_VOLUME/comfyui" ]; then
    echo "✅ Found: $RUNPOD_VOLUME/comfyui"
    du -sh "$RUNPOD_VOLUME/comfyui"
fi
if [ -d "$RUNPOD_VOLUME/custom_nodes" ]; then
    echo "✅ Found: $RUNPOD_VOLUME/custom_nodes"
    du -sh "$RUNPOD_VOLUME/custom_nodes"
fi
echo ""

# ============================================
# 9. 生成清理建议
# ============================================
echo "💡 Cleanup Recommendations:"
echo "================================"

echo ""
echo "🗑️  Safe to delete (caches and temp files):"
echo "  - $RUNPOD_VOLUME/.cache/"
echo "  - $RUNPOD_VOLUME/huggingface-cache/"
echo "  - $RUNPOD_VOLUME/quarantine/"
echo "  - All __pycache__ directories"
echo "  - All .git directories"
echo "  - *.tmp, *.temp, *.bak, *.backup files"
echo "  - *.log files"

echo ""
echo "⚠️  Review before deleting:"
echo "  - $RUNPOD_VOLUME/ComfyUI vs $RUNPOD_VOLUME/comfyui (check which one is used)"
echo "  - $RUNPOD_VOLUME/soulmate9 (check if needed)"
echo "  - $RUNPOD_VOLUME/model-manifests (check if needed)"

echo ""
echo "✅ Keep these (important):"
echo "  - $RUNPOD_VOLUME/models/ (all model files)"
echo "  - Active ComfyUI installation"
echo ""

# ============================================
# 10. 计算可释放空间
# ============================================
echo "📊 Potential Space Savings:"
echo "================================"

TOTAL_SAVEABLE=0

if [ -d "$RUNPOD_VOLUME/.cache" ]; then
    CACHE_SIZE=$(du -sb "$RUNPOD_VOLUME/.cache" 2>/dev/null | awk '{print $1}')
    TOTAL_SAVEABLE=$((TOTAL_SAVEABLE + CACHE_SIZE))
    echo "Cache: $(numfmt --to=iec $CACHE_SIZE)"
fi

if [ -d "$RUNPOD_VOLUME/huggingface-cache" ]; then
    HF_SIZE=$(du -sb "$RUNPOD_VOLUME/huggingface-cache" 2>/dev/null | awk '{print $1}')
    TOTAL_SAVEABLE=$((TOTAL_SAVEABLE + HF_SIZE))
    echo "HuggingFace cache: $(numfmt --to=iec $HF_SIZE)"
fi

if [ -d "$RUNPOD_VOLUME/quarantine" ]; then
    Q_SIZE=$(du -sb "$RUNPOD_VOLUME/quarantine" 2>/dev/null | awk '{print $1}')
    TOTAL_SAVEABLE=$((TOTAL_SAVEABLE + Q_SIZE))
    echo "Quarantine: $(numfmt --to=iec $Q_SIZE)"
fi

PYCACHE_SIZE=$(find "$RUNPOD_VOLUME" -type d -name "__pycache__" -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
if [ ! -z "$PYCACHE_SIZE" ]; then
    TOTAL_SAVEABLE=$((TOTAL_SAVEABLE + PYCACHE_SIZE))
    echo "__pycache__: $(numfmt --to=iec $PYCACHE_SIZE)"
fi

GIT_SIZE=$(find "$RUNPOD_VOLUME" -type d -name ".git" -exec du -sb {} + 2>/dev/null | awk '{sum+=$1} END {print sum}')
if [ ! -z "$GIT_SIZE" ]; then
    TOTAL_SAVEABLE=$((TOTAL_SAVEABLE + GIT_SIZE))
    echo ".git directories: $(numfmt --to=iec $GIT_SIZE)"
fi

echo ""
echo "Total saveable space: $(numfmt --to=iec $TOTAL_SAVEABLE)"
echo ""

# ============================================
# 11. 询问是否执行清理
# ============================================
echo "❓ Do you want to delete these files?"
echo "================================"
read -p "Enter 'yes' to proceed with cleanup: " -r
echo ""

if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "🧹 Starting cleanup..."
    echo ""
    
    # 删除缓存
    if [ -d "$RUNPOD_VOLUME/.cache" ]; then
        echo "Removing .cache..."
        rm -rf "$RUNPOD_VOLUME/.cache"
        echo "✅ Removed .cache"
    fi
    
    if [ -d "$RUNPOD_VOLUME/huggingface-cache" ]; then
        echo "Removing huggingface-cache..."
        rm -rf "$RUNPOD_VOLUME/huggingface-cache"
        echo "✅ Removed huggingface-cache"
    fi
    
    if [ -d "$RUNPOD_VOLUME/quarantine" ]; then
        echo "Removing quarantine..."
        rm -rf "$RUNPOD_VOLUME/quarantine"
        echo "✅ Removed quarantine"
    fi
    
    # 删除 Python 缓存
    echo "Removing __pycache__ directories..."
    find "$RUNPOD_VOLUME" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null
    echo "✅ Removed __pycache__"
    
    # 删除 Git 目录
    echo "Removing .git directories..."
    find "$RUNPOD_VOLUME" -type d -name ".git" -exec rm -rf {} + 2>/dev/null
    echo "✅ Removed .git"
    
    # 删除临时文件
    echo "Removing temporary files..."
    find "$RUNPOD_VOLUME" -type f \( -name "*.tmp" -o -name "*.temp" -o -name "*~" -o -name "*.bak" -o -name "*.backup" \) -delete 2>/dev/null
    echo "✅ Removed temp files"
    
    # 删除日志文件
    echo "Removing log files..."
    find "$RUNPOD_VOLUME" -type f -name "*.log" -delete 2>/dev/null
    echo "✅ Removed log files"
    
    echo ""
    echo "✨ Cleanup complete!"
    echo "Freed up approximately: $(numfmt --to=iec $TOTAL_SAVEABLE)"
else
    echo "❌ Cleanup cancelled. No files were deleted."
fi

echo ""
echo "📊 Final disk usage:"
df -h "$RUNPOD_VOLUME"
echo ""
