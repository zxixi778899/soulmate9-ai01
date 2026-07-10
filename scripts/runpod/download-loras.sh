#!/usr/bin/env bash
# ============================================================
# Soulmate9 — 一键下载 FLUX LoRA 到网络卷
# 在 RunPod model-downloader Pod（US-CA-2 + soulmate-models-ca2）上执行
#
# 用法:
#   chmod +x download-loras.sh
#   ./download-loras.sh                    # 生成清单 + 目录
#   ./download-loras.sh --only body,action # 只生成指定分类清单
#   ./download-loras.sh --from-file lora-urls.txt
#   CIVITAI_API_TOKEN=xxx ./download-loras.sh --from-file lora-urls.txt
#
# 说明:
# - fp8 主模型已有则跳过
# - Civitai 版本 ID 常变：先生成清单，再填直链批量下
# - 目标文件名必须与后台 data/lora-catalog.json 的 filename 一致
# ============================================================
set -euo pipefail

ONLY_CATS=""
FROM_FILE=""
VOLUME_ROOT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) ONLY_CATS="$2"; shift 2 ;;
    --from-file) FROM_FILE="$2"; shift 2 ;;
    --root) VOLUME_ROOT="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# 自动探测网盘挂载点
if [[ -z "$VOLUME_ROOT" ]]; then
  for d in /runpod-volume /workspace /workspace/runpod-volume; do
    if [[ -d "$d" ]]; then VOLUME_ROOT="$d"; break; fi
  done
fi
if [[ -z "$VOLUME_ROOT" ]]; then
  VOLUME_ROOT="$(pwd)/soulmate-models-local"
  echo "[warn] 未检测到网盘，使用本地目录: $VOLUME_ROOT"
fi

CKPT_DIR="$VOLUME_ROOT/models/checkpoints"
LORA_DIR="$VOLUME_ROOT/models/loras"
mkdir -p "$CKPT_DIR" "$LORA_DIR"

echo "=========================================="
echo " Soulmate9 LoRA 下载器"
echo " 根目录: $VOLUME_ROOT"
echo " LoRA:   $LORA_DIR"
echo "=========================================="

# 检查 fp8 是否已有
if ls "$CKPT_DIR"/flux1-dev-fp8*.safetensors 1>/dev/null 2>&1; then
  echo "[ok] 已检测到 FLUX fp8 checkpoint"
else
  echo "[info] 未在 $CKPT_DIR 发现 flux1-dev-fp8*.safetensors"
  echo "       （你说已有 fp8 可忽略；确认文件在 checkpoints 目录）"
fi

download_one() {
  local name="$1"
  local url="$2"
  local dest="$LORA_DIR/$name"
  if [[ -f "$dest" ]]; then
    echo "  skip exists: $name"
    return 0
  fi
  echo "  downloading $name ..."
  if [[ -n "${CIVITAI_API_TOKEN:-}" ]]; then
    curl -L --fail --retry 3 \
      -H "Authorization: Bearer $CIVITAI_API_TOKEN" \
      -o "$dest" "$url" || { rm -f "$dest"; return 1; }
  else
    curl -L --fail --retry 3 -o "$dest" "$url" || { rm -f "$dest"; return 1; }
  fi
  echo "  ok: $name ($(du -h "$dest" | cut -f1))"
}

# 从文件批量下载: 每行  文件名|URL
if [[ -n "$FROM_FILE" ]]; then
  if [[ ! -f "$FROM_FILE" ]]; then
    echo "[error] 文件不存在: $FROM_FILE"
    exit 1
  fi
  echo "[info] 从 $FROM_FILE 批量下载..."
  ok=0
  fail=0
  while IFS='|' read -r name url || [[ -n "${name:-}" ]]; do
    name="$(echo "${name:-}" | xargs)"
    url="$(echo "${url:-}" | xargs)"
    [[ -z "$name" || -z "$url" || "$name" =~ ^# ]] && continue
    if download_one "$name" "$url"; then
      ok=$((ok + 1))
    else
      fail=$((fail + 1))
      echo "  FAIL: $name"
    fi
  done < "$FROM_FILE"
  echo "[done] 成功 $ok / 失败 $fail"
  ls -lh "$LORA_DIR"
  exit 0
fi

# 生成推荐清单 + 示例 urls 模板（与 data/lora-catalog.json 同步）
LIST_FILE="$LORA_DIR/SOULMATE_LORA_MANIFEST.txt"
URLS_FILE="$LORA_DIR/lora-urls.example.txt"
URLS_EDIT="$LORA_DIR/lora-urls.txt"

cat > "$LIST_FILE" << 'EOF'
# Soulmate9 推荐 FLUX LoRA 清单（人物动作 NSFW / 服装 / 道具 / 身材）
# 下载后文件名请与「目标文件名」一致，后台 /admin/comfy → LoRA 清单 才能直接选
# 与仓库 data/lora-catalog.json 保持一致
#
# 分类 | 目标文件名 | 推荐强度 | 用途 | Civitai 搜索关键词
# -----|------------|----------|------|--------------------
body|flux_body_curvy_v1.safetensors|0.75|丰满曲线身材|FLUX curvy hourglass body
body|flux_body_athletic_v1.safetensors|0.70|运动紧实|FLUX athletic body fit
body|flux_body_petite_v1.safetensors|0.65|纤细身材(成人)|FLUX slim petite slender
action|flux_pose_nsfw_dynamic_v1.safetensors|0.70|动态 NSFW 姿势|FLUX nsfw pose dynamic
action|flux_pose_from_behind_v1.safetensors|0.65|后视角/回眸|FLUX from behind doggy pose
action|flux_pose_cowgirl_v1.safetensors|0.70|骑乘|FLUX cowgirl riding pose
action|flux_pose_missionary_v1.safetensors|0.68|传教士/仰躺|FLUX missionary sex pose
action|flux_pose_oral_v1.safetensors|0.70|口交/跪姿|FLUX oral blowjob pose POV
action|flux_pose_standing_v1.safetensors|0.68|站立/壁咚|FLUX standing sex against wall
action|flux_pose_side_v1.safetensors|0.65|侧躺/汤匙|FLUX side spooning sex pose
action|flux_pose_lying_bed_v1.safetensors|0.65|床上躺姿|FLUX lying on bed bedroom
action|flux_pose_ahegao_v1.safetensors|0.55|高潮表情(低强度)|FLUX ahegao expression
outfit|flux_outfit_lingerie_v1.safetensors|0.80|内衣蕾丝|FLUX lingerie lace silk
outfit|flux_outfit_maid_v1.safetensors|0.80|女仆 cos|FLUX maid outfit cosplay
outfit|flux_outfit_bunny_v1.safetensors|0.80|兔女郎|FLUX bunny girl suit
outfit|flux_outfit_school_v1.safetensors|0.75|校服(成人)|FLUX school uniform adult
outfit|flux_outfit_evening_v1.safetensors|0.75|晚礼服|FLUX evening gown dress
outfit|flux_outfit_bikini_v1.safetensors|0.78|比基尼泳装|FLUX bikini swimsuit
outfit|flux_outfit_latex_v1.safetensors|0.75|乳胶皮衣|FLUX latex shiny catsuit
outfit|flux_outfit_product_v1.safetensors|0.70|无模特服装|FLUX clothing product ghost mannequin
prop|flux_prop_magic_v1.safetensors|0.75|魔法道具|FLUX magical item fantasy prop
prop|flux_prop_jewelry_v1.safetensors|0.70|珠宝礼物|FLUX jewelry product shot
prop|flux_prop_intimate_v1.safetensors|0.70|成人商品展示|FLUX product photography studio
prop|flux_prop_bondage_v1.safetensors|0.65|束缚道具|FLUX bondage accessories handcuffs
detail|flux_detail_skin_v1.safetensors|0.50|皮肤质感|FLUX skin detail pores
detail|flux_detail_hands_v1.safetensors|0.45|手部修正|FLUX hands fix fingers
EOF

# 按 --only 过滤清单展示
if [[ -n "$ONLY_CATS" ]]; then
  FILTERED="$LORA_DIR/SOULMATE_LORA_MANIFEST.filtered.txt"
  {
    head -n 6 "$LIST_FILE"
    while IFS=',' read -ra cats; do
      for c in "${cats[@]}"; do
        c="$(echo "$c" | xargs)"
        grep -E "^${c}\\|" "$LIST_FILE" || true
      done
    done <<< "$ONLY_CATS"
  } > "$FILTERED"
  echo "[info] 已按分类过滤: $ONLY_CATS → $FILTERED"
  LIST_FILE="$FILTERED"
fi

cat > "$URLS_FILE" << 'EOF'
# 格式: 目标文件名|完整下载URL
# 复制本文件为 lora-urls.txt，填上真实链接后执行:
#   ./download-loras.sh --from-file /runpod-volume/models/loras/lora-urls.txt
#
# 获取 Civitai 直链:
# 1. 打开模型页 → 选 Base = FLUX.1 D 的版本 → Download
# 2. 或 API: https://civitai.com/api/download/models/<versionId>
# 3. 可选: export CIVITAI_API_TOKEN=你的token
#
# 优先推荐（占空间小、覆盖 NSFW 动作+身材+内衣）:
# flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_pose_cowgirl_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_pose_from_behind_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_outfit_bunny_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
# flux_detail_skin_v1.safetensors|https://civitai.com/api/download/models/REPLACE_VERSION_ID
EOF

if [[ ! -f "$URLS_EDIT" ]]; then
  cp "$URLS_FILE" "$URLS_EDIT"
  echo "[ok] 已创建可编辑: $URLS_EDIT"
fi

echo ""
echo "[ok] 已生成清单:"
echo "  $LIST_FILE"
echo "  $URLS_FILE"
echo "  $URLS_EDIT  ← 填直链后 --from-file 此文件"
echo ""
echo "========== 一键流程 =========="
echo "1. 浏览器 Civitai → Base Model = FLUX.1 D"
echo "2. 按清单关键词下载，保存到: $LORA_DIR"
echo "3. 重命名为清单中的「目标文件名」"
echo "   或写入 $URLS_EDIT 后:"
echo "   export CIVITAI_API_TOKEN=可选"
echo "   ./download-loras.sh --from-file $URLS_EDIT"
echo ""
echo "========== 叠加强度经验 =========="
echo "  NSFW 动作: 姿势 0.65–0.70（优先）"
echo "  身材 0.7 + 姿势 0.65 + 服装 0.75（最多 2~3；后台一次挂 1 个）"
echo "  换装 img2img: 只开服装 0.6 + denoise 0.5"
echo "  道具: 只开 prop + 负面词 person/face"
echo ""
echo "后台: /admin/comfy → Tab「LoRA 清单」一键调用"
echo ""
echo "当前 loras 目录:"
ls -lah "$LORA_DIR" || true
echo "=========================================="
echo "完成后停止 model-downloader Pod 以省钱。"
