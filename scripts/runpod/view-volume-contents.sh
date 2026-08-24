#!/usr/bin/env bash
# 快速查看 RunPod 卷内容
# 直接列出所有文件和目录，方便快速查看

RUNPOD_VOLUME="/runpod-volume"

echo "📂 RunPod Volume Contents"
echo "================================"
echo ""

# 显示根目录
echo "Root directory: $RUNPOD_VOLUME"
ls -lah "$RUNPOD_VOLUME/"
echo ""

# 显示每个子目录的详细内容
for item in "$RUNPOD_VOLUME"/*; do
    if [ -d "$item" ]; then
        echo "================================"
        echo "📁 $(basename "$item")/"
        echo "================================"
        
        # 显示目录大小
        du -sh "$item" 2>/dev/null
        
        # 列出内容（最多显示 50 行）
        ls -lah "$item" | head -50
        
        # 如果文件太多，显示总数
        TOTAL_FILES=$(find "$item" -type f 2>/dev/null | wc -l)
        if [ "$TOTAL_FILES" -gt 50 ]; then
            echo "... and $(($TOTAL_FILES - 50)) more files"
        fi
        
        echo ""
    elif [ -f "$item" ]; then
        echo "📄 $(basename "$item"): $(du -sh "$item" 2>/dev/null | awk '{print $1}')"
    fi
done

echo "================================"
echo ""
echo "📊 Total disk usage:"
df -h "$RUNPOD_VOLUME"
echo ""
