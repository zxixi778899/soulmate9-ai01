# SoulMate LoRA 下载与 NSFW 分级配置指南

## 📋 目录

- [1. LoRA 下载方法](#1-lora-下载方法)
- [2. NSFW 等级说明](#2-nsfw-等级说明)
- [3. LoRA 分类推荐](#3-lora-分类推荐)
- [4. 推荐配置组合](#4-推荐配置组合)
- [5. 快速执行脚本](#5-快速执行脚本)

---

## 1. LoRA 下载方法

### 方式一：使用推荐的完整列表（推荐）

```bash
# 设置 Civitai API Token（需要在 civitai.com 获取）
export CIVITAI_API_TOKEN='your_token_here'

# 下载到 RunPod 体积目录
export VOLUME_DIR='/runpod-volume/models/loras'

# 执行下载脚本
./download-loras.sh --from-file data/lora-urls.recommended.txt
```

### 方式二：手动下载

访问 Civitai 链接直接下载文件到 `/runpod-volume/models/loras/` 目录

---

## 2. NSFW 等级说明

| 等级 | 名称 | 描述 | 适用用户 |
|------|------|------|----------|
| **NSFW 0** | SFW Only | 仅安全内容，无暴露 | 自由版用户 |
| **NSFW 1** | Whisper | 暗示性服装，内衣 | 付费版用户 |
| **NSFW 2** | Touch | 亲密接触，轻度暴露 | Pro/Unlimited 会员 |
| **NSFW 3** | Explicit | 明确性行为，全裸 | Pro/Unlimited 会员 |
| **NSFW 4+** | Extreme | 特殊癖好，极端场景 | Unlimited 会员 + 高级欲望值 |

---

## 3. LoRA 分类推荐

### 🎨 A 类：基础风格 LoRA（必需）

#### 写实风格

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 建议等级 |
|------------|------|------|---------|---------|
| `flux_style_photoreal_v1.safetensors` | 女性写实主风格 | False | 0.35 | **所有用户** |
| `flux_krea_realism.safetensors` | 男性写实主风格 | False | 0.35 | 男性角色 |
| `flux_hyperrealism_aidma.safetensors` | 跨性别超写实 | False | 0.35 | Transgender |

#### 二次元风格

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 建议等级 |
|------------|------|------|---------|---------|
| `rdanimefluxv1rapid.safetensors` | FLUX 二次元风格 | False | 0.5 | 动漫爱好者 |
| `flux_3d_render_v1.safetensors` | 3D 渲染风 | False | 0.5 | 3D 风格 |

---

### ✨ B 类：细节增强 LoRA（推荐）

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 说明 |
|------------|------|------|---------|------|
| `flux_detail_skin_v1.safetensors` | 皮肤质感 | False | 0.25 | 近景必挂 |
| `flux_detail_skin_nplastic_v1.safetensors` | 真实肤质 | False | 0.25 | 避免塑料感 |
| `flux_detail_hands_v1.safetensors` | 手部细节 | False | 0.25 | 含手部特写 |
| `flux_add_details.safetensors` | 通用细节 | False | 0.25 | 轻量增强 |

> **注意**：风格 LoRA + 皮肤 LoRA 总强度建议 ≤ 0.5

---

### 💪 C 类：体型塑造 LoRA（按需）

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 推荐场景 |
|------------|------|------|---------|---------|
| `flux_body_curvy_v1.safetensors` | 曲线身形 | False | 0.4 | 丰满身材 |
| `flux_body_pear_v1.safetensors` | 梨形身材 | False | 0.4 | 臀腿曲线 |
| `flux_male_masc_v1.safetensors` | 男体写实 | False | 0.4 | 男性角色 |
| `flux_male_muscle_v1.safetensors` | 肌肉线条 | False | 0.35 | 健身猛男 |
| `flux_femboy-v1.safetensors` | 伪娘角色 | False | 0.4 | 女性化男性 |
| `realistic-mtf-trans.safetensors` | MtF 跨性别 | False | 0.4 | 跨性别女性 |

---

### 👙 D 类：服装造型 LoRA（NSFW 1-2）

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 推荐等级 |
|------------|------|------|---------|---------|
| `flux_outfit_lingerie_v1.safetensors` | 情趣内衣 | True | 0.45 | **NSFW ≥ 1** |
| `flux_outfit_bikini_v1.safetensors` | 比基尼泳装 | False | 0.45 | 海滩场景 |
| `flux_outfit_latex_v1.safetensors` | 皮衣胶衣 | True | 0.45 | NSFW ≥ 1 |
| `flux_outfit_school_v1.safetensors` | 校园制服 | False | 0.45 | 日常场景 |
| `flux_outfit_maid_v1.safetensors` | 女仆装 | False | 0.45 | 角色扮演 |
| `flux_outfit_bunny_v1.safetensors` | 兔女郎 | True | 0.45 | NSFW ≥ 2 |

---

### 🔥 E 类：NSFW 动作 LoRA（NSFW 3+）

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 推荐等级 |
|------------|------|------|---------|---------|
| `flux_pose_nsfw_dynamic_v1.safetensors` | 动态姿势 | True | 0.45 | **NSFW ≥ 3** |
| `flux_face_ahegao_v1.safetensors` | 高潮表情 | True | 0.4 | NSFW ≥ 4 |
| `flux_lewd_v1.safetensors` | 通用 NSFW | True | 0.3 | NSFW ≥ 3 |
| `flux_nsfw_klein_v2.safetensors` | NSFW 强度 | True | 0.4 | NSFW ≥ 3 |
| `flux_uncensored.safetensors` | 无审查辅助 | True | 0.3 | NSFW ≥ 3 |

---

### 🎬 F 类：特殊风格 LoRA（可选）

| LoRA 文件名 | 用途 | NSFW | 默认强度 | 适用场景 |
|------------|------|------|---------|---------|
| `flux_style_cinematic_v1.safetensors` | 电影感光影 | False | 0.3 | 夜景、情绪氛围 |
| `pony_detailifier_v5.safetensors` | Pony 细节增强 | True/False | 0.35 | Pony 底模专用 |
| `illustrious_nsfw_slider_v1.safetensors` | Illustrious NSFW | True | 0.5 | Illustrious 底模 NSFW≥3 |

---

## 4. 推荐配置组合

### ⚡ 标准配置（推荐给大多数用户）

**包含文件：**
```
# Tier A — 风格基础 (card quality)
flux_style_photoreal_v1.safetensors
flux_detail_skin_v1.safetensors
flux_detail_hands_v1.safetensors

# Tier B — 体型优化
flux_body_curvy_v1.safetensors

# Tier C — 基础服装
flux_outfit_bikini_v1.safetensors
flux_outfit_maid_v1.safetensors
```

**覆盖范围：** 70% 的日常生图需求

---

### 🔥 NSFW 扩展配置（Pro/Unlimited 会员）

**额外包含：**
```
# NSFW 服装
flux_outfit_lingerie_v1.safetensors
flux_outfit_latex_v1.safetensors

# NSFW 动作
flux_pose_nsfw_dynamic_v1.safetensors
flux_lewd_v1.safetensors

# 高级细节
flux_detail_skin_nplastic_v1.safetensors
```

**覆盖范围：** 90% 的 NSFW 场景

---

### 😈 完整版配置（All-in-One）

**完整包含所有推荐 LoRA：**
```bash
# 执行命令
./download-loras.sh --from-file data/lora-urls.recommended.txt
```

**优势：**
- ✅ 支持所有性别（Female/Male/Trans/Femboy）
- ✅ 支持所有风格（Realistic/Anime/3D）
- ✅ 支持所有 NSFW 等级（0-4）
- ✅ 最佳生图质量上限

---

## 5. 快速执行脚本

### Windows PowerShell

```powershell
# 设置环境变量
$env:CIVITAI_API_TOKEN = "your_token_here"
$env:VOLUME_DIR = "C:\path\to\models\loras"

# 运行下载脚本（如果支持 PowerShell）
.\download-loras.ps1 --from-file data/lora-urls.recommended.txt

# 或使用 Git Bash / WSL
bash download-loras.sh --from-file data/lora-urls.recommended.txt
```

### Linux / RunPod

```bash
# 设置环境变量
export CIVITAI_API_TOKEN="your_token_here"
export VOLUME_DIR="/runpod-volume/models/loras"

# 执行下载
chmod +x download-loras.sh
./download-loras.sh --from-file data/lora-urls.recommended.txt
```

### 验证下载结果

```bash
# 列出已下载的 LoRA 文件
ls -lh $VOLUME_DIR/*.safetensors

# 统计数量
ls $VOLUME_DIR/*.safetensors | wc -l
```

---

## 📌 重要提示

1. **Civitai Token**：需要在 [civitai.com](https://civitai.com) 账户设置中获取 API Token
2. **存储空间**：完整版约 5GB，请确保 RunPod 卷空间充足
3. **网络要求**：建议使用稳定网络，支持断点续传
4. **LoRA 强度叠加**：多个 LoRA 同时使用时，总强度建议 ≤ 0.6
5. **自动路由**：系统会根据女友类型自动选择合适 LoRA，无需手动指定

---

## 🔗 相关文档

- [`data/lora-catalog.json`](../../data/lora-catalog.json) - 完整 LoRA 目录元数据
- [`docs/LORA_PLAN.md`](../../docs/LORA_PLAN.md) - LoRA 管理计划
- [`docs/IMAGE_GENERATION_GUIDE.md`](../../docs/IMAGE_GENERATION_GUIDE.md) - 生图指南

---

**最后更新时间**: 2026-08-16
