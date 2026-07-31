#!/bin/bash
# SoulMate9 DC2 卷一键下载 — 在临时Pod终端执行:
#   export CIVITAI_API_TOKEN='你的token'  (可选,Civitai需要登录的模型)
#   bash /runpod-volume/setup-dc2.sh
set -uo pipefail

# DNS修复(RunPod Pod偶尔DNS不通)
grep -q "8.8.8.8" /etc/resolv.conf 2>/dev/null || echo "nameserver 8.8.8.8" >> /etc/resolv.conf

V="/runpod-volume"
L="$V/models/loras"
mkdir -p "$L" "$V/models/checkpoints"
T="${CIVITAI_API_TOKEN:-}"

echo "═══ SoulMate9 DC2 下载 $(date) ═══"
echo "卷: $V | LoRA目录: $L"

dl() {
  local name="$1" url="$2" dest="$L/$1"
  if [ -f "$dest" ] && [ $(stat -c%s "$dest" 2>/dev/null || echo 0) -gt 102400 ]; then
    echo "  OK $name ($(du -h "$dest"|cut -f1))"; return 0
  fi
  local full="$url"; [ -n "$T" ] && full="${url}?token=${T}"
  for i in 1 2 3; do
    wget -q --show-progress -O "$dest" "$full" 2>&1 && \
      [ $(stat -c%s "$dest" 2>/dev/null||echo 0) -gt 102400 ] && \
      { echo "  OK $name"; return 0; }
    echo "  RETRY $name ($i/3)"; rm -f "$dest"; sleep 2
  done
  echo "  FAIL $name"; return 1
}

echo ""; echo "── LoRA (18个) ──"
# Tier A 风格/画质
dl "flux_style_photoreal_v1.safetensors" "https://civitai.com/api/download/models/1084957"
dl "flux_style_hyperreal_aidma_v1.safetensors" "https://civitai.com/api/download/models/980278"
dl "flux_detail_skin_v1.safetensors" "https://civitai.com/api/download/models/827325"
dl "flux_detail_skin_nplastic_v1.safetensors" "https://civitai.com/api/download/models/1301668"
dl "flux_detail_hands_v1.safetensors" "https://civitai.com/api/download/models/1003317"
# Tier B 体型
dl "flux_body_curvy_v1.safetensors" "https://civitai.com/api/download/models/1668530"
dl "flux_body_pear_v1.safetensors" "https://civitai.com/api/download/models/1276427"
# Tier C 服装
dl "flux_outfit_lingerie_v1.safetensors" "https://civitai.com/api/download/models/869894"
dl "flux_outfit_bunny_v1.safetensors" "https://civitai.com/api/download/models/817758"
dl "flux_outfit_maid_v1.safetensors" "https://civitai.com/api/download/models/1588611"
dl "flux_outfit_bikini_v1.safetensors" "https://civitai.com/api/download/models/1184191"
dl "flux_outfit_latex_v1.safetensors" "https://civitai.com/api/download/models/734230"
dl "flux_outfit_school_v1.safetensors" "https://civitai.com/api/download/models/2163726"
# Tier D NSFW
dl "flux_pose_nsfw_dynamic_v1.safetensors" "https://civitai.com/api/download/models/746602"
dl "flux_face_ahegao_v1.safetensors" "https://civitai.com/api/download/models/1477302"
# Tier E 电影感
dl "flux_style_cinematic_v1.safetensors" "https://civitai.com/api/download/models/953083"
# 特殊LoRA
dl "AIDILETTA © - 2.0 - FLUX.safetensors" "https://civitai.com/api/download/models/934262"
dl "flux see through lingenie 512X768.safetensors" "https://civitai.com/api/download/models/2443240"
dl "ZIT see through lingerie outfit V2.safetensors" "https://civitai.com/api/download/models/2910515"

echo ""; echo "── vLLM 模型 (Qwen3.5-9B ~18GB) ──"
QD="$V/models/Qwen3.5-9B-Abliterated"
if [ -d "$QD" ] && [ -f "$QD/config.json" ]; then
  echo "  OK Qwen3.5-9B-Abliterated 已存在"
else
  pip install -q huggingface_hub 2>/dev/null || true
  huggingface-cli download Qwen/Qwen3.5-9B-Abliterated --local-dir "$QD" --local-dir-use-symlinks False
fi

echo ""; echo "── Checkpoint ──"
CK="$V/models/checkpoints/flux1-dev-fp8.safetensors"
MIN_CHECKPOINT_BYTES=16000000000
CK_BYTES=$(stat -c%s "$CK" 2>/dev/null || echo 0)
if [ "$CK_BYTES" -ge "$MIN_CHECKPOINT_BYTES" ]; then
  echo "  OK Comfy-Org FLUX single-file checkpoint ($(du -h "$CK"|cut -f1))"
else
  if [ "$CK_BYTES" -gt 0 ]; then
    echo "  REPAIR incompatible 11.9GB Kijai diffusion-only file: $CK"
  fi
  echo "  Downloading Comfy-Org FLUX single-file checkpoint (~17.2GB)..."
  wget -q --show-progress -O "$CK.part" \
    "https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors"
  DOWNLOADED_BYTES=$(stat -c%s "$CK.part" 2>/dev/null || echo 0)
  if [ "$DOWNLOADED_BYTES" -lt "$MIN_CHECKPOINT_BYTES" ]; then
    echo "  FAIL incomplete checkpoint ($DOWNLOADED_BYTES bytes)" >&2
    rm -f "$CK.part"
    exit 1
  fi
  mv "$CK.part" "$CK"
fi
echo ""; echo "═══ 结果 ═══"
echo "LoRA: $(ls "$L" 2>/dev/null|wc -l) 个文件"
ls -lhS "$L/" 2>/dev/null | head -25
echo ""
echo "vLLM: $(ls "$QD/"*.safetensors 2>/dev/null|wc -l) 个权重文件"
echo ""
echo "═══ 完成! 终止此Pod即可 ═══"
echo "记得在vLLM端点(7dacw6sk3tp1vi)设置环境变量:"
echo "  MODEL_NAME=/runpod-volume/models/Qwen3.5-9B-Abliterated"
