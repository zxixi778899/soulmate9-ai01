#!/usr/bin/env bash
# Soulmate9 — 补全 DC1 卷上缺失的 12 个 LoRA
# 当前卷上已有 7 个 (style×2, body×2, detail×3)，本脚本补齐剩余。
#
# 用法 (在挂载了卷的 RunPod Pod 内执行):
#   export CIVITAI_API_TOKEN='your_token'
#   bash download-missing-12.sh
#
# 也可指定卷路径:
#   bash download-missing-12.sh --root /runpod-volume
set -euo pipefail

VOLUME_ROOT=""
FORCE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --root) VOLUME_ROOT="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [[ -z "$VOLUME_ROOT" ]]; then
  for d in /runpod-volume /workspace /workspace/runpod-volume; do
    [[ -d "$d" ]] && VOLUME_ROOT="$d" && break
  done
fi
VOLUME_ROOT="${VOLUME_ROOT:-$(pwd)/soulmate-models-local}"
LORA_DIR="$VOLUME_ROOT/models/loras"
mkdir -p "$LORA_DIR"

if [[ -z "${CIVITAI_API_TOKEN:-}" ]]; then
  echo "ERROR: export CIVITAI_API_TOKEN first"
  exit 1
fi

echo "=== Soulmate9 LoRA 补全 (12 missing) ==="
echo "target: $LORA_DIR"
echo "token: ${CIVITAI_API_TOKEN:0:8}..."
echo ""

# ─── 缺失清单 (target_filename|civitai_download_url|tier) ───
rows=(
# Tier C — outfit (6个)
"flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894|C"
"flux_outfit_bunny_v1.safetensors|https://civitai.com/api/download/models/817758|C"
"flux_outfit_maid_v1.safetensors|https://civitai.com/api/download/models/1588611|C"
"flux_outfit_bikini_v1.safetensors|https://civitai.com/api/download/models/1184191|C"
"flux_outfit_latex_v1.safetensors|https://civitai.com/api/download/models/734230|C"
"flux_outfit_school_v1.safetensors|https://civitai.com/api/download/models/2163726|C"
# Tier D — pose + face (2个)
"flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/746602|D"
"flux_face_ahegao_v1.safetensors|https://civitai.com/api/download/models/1477302|D"
# Tier E — cinematic style (1个)
"flux_style_cinematic_v1.safetensors|https://civitai.com/api/download/models/953083|E"
# Civitai 原名文件 (3个, 下载即用无需重命名)
"AIDILETTA © - 2.0 - FLUX.safetensors|https://civitai.com/api/download/models/934262|F"
"flux see through lingenie 512X768.safetensors|https://civitai.com/api/download/models/2443240|F"
"ZIT see through lingerie outfit V2.safetensors|https://civitai.com/api/download/models/2910515|F"
)

ok=0; fail=0; skip=0
MIN_BYTES=102400  # 100KB

for row in "${rows[@]}"; do
  IFS='|' read -r name url tier <<< "$row"
  dest="$LORA_DIR/$name"

  if [[ -f "$dest" && "$FORCE" -eq 0 ]]; then
    bytes=$(stat -c%s "$dest" 2>/dev/null || wc -c < "$dest" | tr -d ' ')
    if [[ "${bytes:-0}" -ge "$MIN_BYTES" ]]; then
      echo "[SKIP] $name (already exists, ${bytes} bytes)"
      skip=$((skip+1))
      continue
    else
      echo "[RE-DL] $name (exists but too small: ${bytes} bytes)"
    fi
  fi

  echo "[DL] $name ..."
  tmp="${dest}.part"
  rm -f "$tmp"

  if curl -L --fail --retry 3 --retry-delay 3 \
      -H "Authorization: Bearer ${CIVITAI_API_TOKEN}" \
      -o "$tmp" "$url" 2>/dev/null; then
    bytes=$(stat -c%s "$tmp" 2>/dev/null || wc -c < "$tmp" | tr -d ' ')
    if [[ "${bytes:-0}" -lt "$MIN_BYTES" ]]; then
      echo "  FAIL: too small (${bytes} bytes) — likely auth error or deleted model"
      rm -f "$tmp"
      fail=$((fail+1))
      continue
    fi
    mv -f "$tmp" "$dest"
    echo "  OK: $(echo "scale=1; $bytes/1048576" | bc) MB"
    ok=$((ok+1))
  else
    echo "  FAIL: download error"
    rm -f "$tmp"
    fail=$((fail+1))
  fi
done

echo ""
echo "=== 完成: ok=$ok skip=$skip fail=$fail ==="
echo ""
echo "卷上全部 LoRA:"
ls -lhS "$LORA_DIR"/*.safetensors 2>/dev/null || echo "(none)"
echo ""
echo "总计: $(ls "$LORA_DIR"/*.safetensors 2>/dev/null | wc -l) 个文件"
