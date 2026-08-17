# 📥 SoulMate AI - LoRA 下载与使用中心

> **一站式 LoRA 管理解决方案**  
> 支持 FLUX/Pony/Illustrious 多底模 · NSFW 分级配置 · 自动路由 · 推荐组合包

---

## 🎯 快速导航

| 你需要的 | 看这里 |
|---------|--------|
| **3 步快速下载** | 👉 [LORA_QUICKSTART.md](LORA_QUICKSTART.md) |
| **NSFW 分级配置** | 👉 [LORA_DOWNLOAD_GUIDE.md](LORA_DOWNLOAD_GUIDE.md) |
| **推荐方案对比** | 👉 [LORA_RECOMMENDATIONS.md](LORA_RECOMMENDATIONS.md) |
| **执行下载命令** | 👉 [见下方"快速执行"](#-快速执行) |

---

## 🔥 快速执行（5 分钟搞定）

### 方式一：完整推荐包（⭐⭐⭐ 推荐）

包含 **34 个精心挑选的 LoRA**，覆盖 95% 的使用场景

```bash
# 步骤 1: 获取 Civitai Token
# 访问 https://civitai.com → Settings → API Keys → 生成新密钥

# 步骤 2: 运行下载脚本
export CIVITAI_API_TOKEN="your_token_here"

# Windows PowerShell
.\download-loras.ps1 -OutputDir "C:\models\loras"

# Linux / RunPod
./download-loras.sh --from-file data/lora-urls.recommended.txt

# 步骤 3: 验证结果
ls $VOLUME_DIR/*.safetensors  # 应该看到 34 个文件
```

✅ **文件大小**: ~3GB  
✅ **适用用户**: Pro/Unlimited 会员、标准用户  
✅ **NSFW 支持**: 等级 0-3（含 Lingerie/Bikini/动态姿势等）

---

### 方式二：最小基础包

仅下载核心必需的 5 个 LoRA，快速开始生图

```bash
# 只包含：写实风格 + 皮肤质感 + 身形塑造 + 二次元风格
echo "# Minimal essential pack" > minimal-loras.txt
echo "flux_style_photoreal_v1.safetensors|https://civitai.com/api/download/models/1084957" >> minimal-loras.txt
echo "flux_detail_skin_v1.safetensors|https://civitai.com/api/download/models/827325" >> minimal-loras.txt
echo "flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/1668530" >> minimal-loras.txt
echo "rdanimefluxv1rapid.safetensors|https://civitai.com/api/download/models/863817" >> minimal-loras.txt

# 执行下载
./download-loras.sh --from-file minimal-loras.txt
```

✅ **文件大小**: ~400MB  
✅ **适用用户**: 新用户测试、存储空间有限

---

## 📦 LoRA 分类一览

### A. 风格类（Style）⭐ 核心质量
- `flux_style_photoreal_v1` - FLUX 女性写实主风格
- `flux_krea_realism` - FLUX 男性写实主风格  
- `rdanimefluxv1rapid` - FLUX 二次元风格
- `flux_3d_render_v1` - FLUX 3D 渲染风

### B. 细节类（Detail）✨ 提升真实感
- `flux_detail_skin_v1` - 皮肤质感增强
- `flux_detail_hands_v1` - 手部细节修正
- `flux_add_details` - 通用细节增强

### C. 体型类（Body）💪 塑造身材
- `flux_body_curvy_v1` - 曲线丰满身材
- `flux_body_pear_v1` - 梨形身材
- `flux_male_masc_v1` - 男体写实 MASC

### D. 服装类（Outfit）👙 服饰造型 ⚠️部分 NSFW
- `flux_outfit_lingerie_v1` - 情趣内衣 ⚠️
- `flux_outfit_bikini_v1` - 比基尼泳装
- `flux_outfit_latex_v1` - 皮衣胶衣 ⚠️

### E. NSFW 动作类（Action）🔥 高级内容 ⚠️
- `flux_pose_nsfw_dynamic_v1` - NSFW 动态姿势
- `flux_lewd_v1` - 通用 NSFW 辅助
- `flux_face_ahegao_v1` - 高潮表情 ⚠️特殊癖好

### F. 特殊底模专用
- `pony_detailifier_v5` - Pony 系列细节增强
- `illustrious-micro-details-v6` - Illustrious 微细节

---

## 🎮 NSFW 等级配置策略

### SFW 模式（NSFW 0-1）
**适用**: 普通用户、免费套餐  
**配置**: 仅下载风格类 + 细节类 LoRA  
**覆盖**: 日常穿搭、亲密互动、暗示性服装

### Pro 模式（NSFW 2-3）⭐ 推荐
**适用**: Pro 会员、付费用户  
**配置**: 在 SFW 基础上增加服装类 + 基础 NSFW 动作  
**覆盖**: 轻度暴露、明确性行为、角色扮演

### Unlimited 模式（NSFW 4+）
**适用**: Unlimited 会员、高级欲望值  
**配置**: 完整 All-in-One 包，包括所有特殊 LoRA  
**覆盖**: 极端场景、特殊癖好、Futa/MtT 等

---

## 💡 最佳实践建议

### 1️⃣ 渐进式安装
```
Phase 1 (必下): 
  flux_style_photoreal_v1 ✓
  flux_detail_skin_v1 ✓
  flux_body_curvy_v1 ✓

Phase 2 (按需):
  flux_outfit_lingerie_v1 (NSFW≥1)
  flux_pose_nsfw_dynamic_v1 (NSFW≥3)

Phase 3 (扩展):
  Pony/Illustrious 专用 LoRA
  特殊风格 LoRA
```

### 2️⃣ 强度叠加规则
- ⚠️ 风格 LoRA + 细节 LoRA ≤ 0.5
- ⚠️ 同类 LoRA 不要叠加（如两个身体类）
- ⚠️ 总强度建议不超过 1.0

### 3️⃣ 自动路由机制
系统会根据以下规则自动选择 LoRA：
- 女友性别 → 选择对应风格 LoRA（Female/Male/Trans）
- NSFW 等级 → 选择对应动作 LoRA（SFW/Pro/Unlimited）
- 风格偏好 → 选择对应画风（Realistic/Anime/3D）

---

## 🛠️ 下载脚本说明

### `download-loras.sh`（Bash 版本）
```bash
# 基本用法
./download-loras.sh --from-file <url_file>

# 环境变量
export CIVITAI_API_TOKEN="token_here"   # Civitai 认证
export VOLUME_DIR="/runpod-volume/models/loras"  # 目标目录
```

### `download-loras.ps1`（PowerShell 版本）
```powershell
# 基本用法
.\download-loras.ps1 -OutputDir "C:\models\loras"

# 指定 Token
$env:CIVITAI_API_TOKEN = "cv_your_token_here"
.\download-loras.ps1

# 自定义列表
.\download-loras.ps1 -UrlsFile ".\custom-loras.txt"
```

---

## 📊 文件清单

### Recommended Pack（34 个 LoRA）

详细列表请查看：[`data/lora-urls.recommended.txt`](data/lora-urls.recommended.txt)

```txt
# Tier A — 风格基础（8 个）
flux_style_photoreal_v1.safetensors
flux_style_hyperrealism_aidma_v1.safetensors
flux_style_cinematic_v1.safetensors
rdanimefluxv1rapid.safetensors
flux_3d_render_v1.safetensors
...

# Tier B — 细节增强（4 个）
flux_detail_skin_v1.safetensors
flux_detail_skin_nplastic_v1.safetensors
flux_detail_hands_v1.safetensors
flux_add_details.safetensors

# Tier C — 体型塑造（2 个）
flux_body_curvy_v1.safetensors
flux_body_pear_v1.safetensors

# Tier D — 服装造型（6 个）
flux_outfit_lingerie_v1.safetensors
flux_outfit_bikini_v1.safetensors
flux_outfit_latex_v1.safetensors
...

# Tier E — NSFW 动作（2 个）
flux_pose_nsfw_dynamic_v1.safetensors
flux_face_ahegao_v1.safetensors
```

---

## 🔍 验证与调试

### 检查下载结果
```bash
# 统计文件数量
ls $VOLUME_DIR/*.safetensors | wc -l

# 按大小排序
ls -lhS $VOLUME_DIR/*.safetensors | tail -10

# 检查关键文件
for file in "flux_style_photoreal_v1.safetensors" \
            "flux_detail_skin_v1.safetensors"; do
    [ -f "$file" ] && echo "✅ $file" || echo "❌ $file"
done
```

### ComfyUI 验证
1. 打开 ComfyUI Object Browser
2. Load LoRA 节点 → 查看所有可用 LoRA
3. 确认文件名与预期一致

---

## 📚 相关文档索引

| 文档 | 用途 |
|------|------|
| **[LORA_QUICKSTART.md](LORA_QUICKSTART.md)** | 3 步快速下载教程 |
| **[LORA_DOWNLOAD_GUIDE.md](LORA_DOWNLOAD_GUIDE.md)** | 详细指南与 NSFW 分级说明 |
| **[LORA_RECOMMENDATIONS.md](LORA_RECOMMENDATIONS.md)** | 配置方案对比与最佳实践 |
| **[data/lora-catalog.json](data/lora-catalog.json)** | LoRA 目录元数据（JSON） |
| **[data/lora-urls.recommended.txt](data/lora-urls.recommended.txt)** | 推荐下载链接列表 |
| **[docs/LORA_MANAGEMENT.md](docs/LORA_MANAGEMENT.md)** | LoRA 管理计划 |
| **[docs/IMAGE_GENERATION_GUIDE.md](docs/IMAGE_GENERATION_GUIDE.md)** | 生图流程指南 |

---

## ❓ 常见问题

### Q1: 没有 Civitai Token 能下载吗？
**A**: 可以，但部分高权重资源可能受限。建议使用 Token 获得最佳体验。

### Q2: 下载速度慢怎么办？
**A**: 
- 使用断点续传功能（脚本已内置）
- 在低峰期（凌晨/深夜）下载
- 分批下载（先基础包，再扩展包）

### Q3: 如何选择适合的 LoRA？
**A**: 
- 查看 **[LORA_RECOMMENDATIONS.md](LORA_RECOMMENDATIONS.md)** 中的分类表
- 根据 NSFW 等级和目标场景选择
- 遵循“渐进式安装”策略

### Q4: LoRA 冲突怎么办？
**A**: 
- 避免同类 LoRA 叠加（如两个身体类）
- 控制总强度不超过 1.0
- 通过 ComfyConsole 逐个测试效果

---

## 💾 备份与更新

### 定期备份
```bash
# 压缩备份
tar -czf loras-backup-$(date +%Y%m%d).tar.gz $VOLUME_DIR/*.safetensors

# 上传到云存储（如有配置）
az storage blob upload-batch --source $VOLUME_DIR --dest "loras-backup"
```

### 版本管理
建议保留最近 3 个月的版本快照，并标记废弃的 LoRA。

---

## 🌟 维护者提示

- ✅ 定期检查 Civitai 上新 LoRA
- ✅ 保持与生产环境一致性
- ✅ 记录成功的 LoRA 组合配置
- ✅ 关注用户反馈优化推荐列表

---

**Happy Generating!** 🎨✨

最后更新时间：2026-08-16
