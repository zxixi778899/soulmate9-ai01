#!/bin/bash
# SoulMate LoRA 自动下载脚本
# 生成时间: 7/20/2026, 3:42:43 PM
# 共 9 个文件

# 配置
VOLUME_DIR="${VOLUME_DIR:-/runpod-volume/models/loras}"
TOKEN="${CIVITAI_API_TOKEN:-}"

mkdir -p "$VOLUME_DIR"
cd "$VOLUME_DIR"

# 下载函数（支持断点续传）
download_file() {
  local filename="$1"
  local url="$2"
  if [ -f "$filename" ]; then
    echo "[SKIP] $filename 已存在"
    return 0
  fi
  echo "[DOWN] $filename"
  if [ -n "$TOKEN" ]; then
    wget -c --header="Authorization: Bearer $TOKEN" -O "$filename" "$url" 2>/dev/null
  else
    wget -c -O "$filename" "$url" 2>/dev/null
  fi
  if [ $? -eq 0 ]; then
    echo "[OK] $filename"
  else
    echo "[FAIL] $filename"
  fi
}

download_file "Realistic_Adult_Flux_10-000001.safetensors" "https://civitai.com/api/download/models/875581"
download_file "curvy.safetensors" "https://civitai.com/api/download/models/1202097"
download_file "flux see throught lingerie 512X768.safetensors" "https://civitai.com/api/download/models/2443240"
download_file "AIDILETTA__-_2.0_-_FLUX.safetensors" "https://civitai.com/api/download/models/934262"
download_file "FLUX-AI girl gigantic 09 768X1024.safetensors" "https://civitai.com/api/download/models/2381117"
download_file "Flux bondage outfit 02 512X768.safetensors" "https://civitai.com/api/download/models/2428455"
download_file "flux-lora-000006.safetensors" "https://civitai.com/api/download/models/2174047"
download_file "FLUX_Starleij.safetensors" "https://civitai.com/api/download/models/795822"
download_file "Tea_body_curvy_swollen_pawg_Female_LoRa__FLUX_dev.safetensors" "https://civitai.com/api/download/models/2608976"

echo ""
echo "===== 下载完成 ====="
echo "文件位置: $VOLUME_DIR"
ls -lh "$VOLUME_DIR"/*.safetensors 2>/dev/null | wc -l | xargs -I{} echo "共 {} 个 safetensors 文件"
