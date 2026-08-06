# LoRA 下载与调用方案（ComfyUI 控制台 / 全站生图）

## 1. 推荐下载清单

完整可下载清单见 `data/lora-urls.recommended.txt`（Civitai 直链，按 Tier 分组）：

| Tier | 用途 | 推荐文件 |
|------|------|----------|
| A 卡片质量 | 写实风格 + 皮肤/手部细节 | flux_style_photoreal_v1、flux_style_hyperreal_aidma_v1、flux_detail_skin_v1、flux_detail_hands_v1、flux_detail_upgrader_v1 |
| B 身形 | 曲线 / 梨形 | flux_body_curvy_v1、flux_body_pear_v1 |
| C 服装 | 内衣 / 兔女郎 / 女仆 / 比基尼 / 皮衣 / 校服 | flux_outfit_lingerie_v1、bunny、maid、bikini、latex、school |
| D NSFW 场景 | 动态姿势 / 颜艺 | flux_pose_nsfw_dynamic_v1、flux_face_ahegao_v1 |
| E 电影感 | 氛围光 | flux_style_cinematic_v1 |

## 2. 下载命令

```bash
export CIVITAI_API_TOKEN='你的_token'
# 一键下载（写入 /runpod-volume/models/loras 或本地卷映射目录）
bash download-loras.sh --from-file data/lora-urls.recommended.txt
# 或最小集
bash download-loras.sh --from-file data/lora-urls.minimal.txt
```

## 3. 环境变量（调用方配置）

```env
# 已挂载到 worker 卷的 LoRA 文件名（逗号分隔，决定控制台“已安装”清单）
RUNPOD_INSTALLED_LORAS_FLUX=flux_style_photoreal_v1.safetensors,flux_detail_skin_v1.safetensors,flux_nsfw_klein_v2.safetensors,...
RUNPOD_INSTALLED_LORAS_PONY=pony_detailifier_v5.safetensors
RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS=AddMicroDetails_Illustrious_v6.safetensors
```

> 目录清单 `data/lora-catalog.json` 是静态元数据（`installed=false` 不代表文件缺失）；真正生效以
> `RUNPOD_INSTALLED_LORAS_*` 运行时清单为准，未挂载的 LoRA 会自动跳过。

## 4. 按工作流的调用方案

控制台 LoRA 选择器最多叠加 3 个，总强度 >1.55 自动等比缩放。目录内置路由规则
（`lora-catalog.json > routing_rules`）：

- **生成角色 / 立绘（人物一致）**：风格 LoRA 1 个（写实/超写实，0.3~0.35）+ 细节 LoRA 1 个（0.25~0.3）。
  身份锁定用 IP-Adapter（不用 LoRA 锁脸，避免脸崩）。
- **姿势替换 / 换背景**：服装/动作 LoRA 1 个（0.4~0.5）+ 细节 1 个；IP-Adapter 0.8+。
- **NSFW 强度 ≥3**：叠加 flux_nsfw_klein_v2（0.4）+ flux_uncensored（0.3），并配合 vLLM-Qwen3
  NSFW 路由提示词优化。
- **Pony / Illustrious 底模**：只挂对应家族细节 LoRA（pony_detailifier_v5 / AddMicroDetails），
  禁止混用 FLUX LoRA。

## 5. 与本次控制台新功能的配合

- 立绘 / 姿势 / 视频预设新增 **NSFW 强度**（1–5）。
- 任一含 prompt 的预设可点 **AI 优化提示词**：强度 ≥3 走 vLLM-Qwen3（RunPod）NSFW 端点，
  1–2 走 SFW 端点（DashScope），按强度边界生成优化提示词后再挂载 LoRA。
