# SoulMate LoRA 快速下载指南 🚀

## 🎯 快速开始（3 步搞定）

### 步骤 1️⃣: 获取 Civitai Token
1. 访问 [civitai.com](https://civitai.com)
2. 登录你的账户
3. 进入 **Settings** → **API Keys**
4. 点击 **Generate New Key**
5. 复制生成的 token（以 `cv_` 开头）

---

### 步骤 2️⃣: 运行下载脚本

#### 🪟 Windows 用户（推荐 PowerShell）

```powershell
# 方式 A: 直接运行（使用默认设置）
.\download-loras.ps1

# 方式 B: 指定 Token（更安全）
$env:CIVITAI_API_TOKEN = "your_token_here"
.\download-loras.ps1 -OutputDir "C:\path\to\models\loras"

# 方式 C: 下载到 RunPod 体积目录
.\download-loras.ps1 -OutputDir "\\wsl$\RunPod Volume\soulmate-volume\models\loras"
```

#### 🐧 Linux / WSL / RunPod 用户

```bash
# 设置 Token（推荐方式 1：环境变量）
export CIVITAI_API_TOKEN="your_token_here"

# 方式 A: 直接使用系统脚本
./download-loras.sh --from-file data/lora-urls.recommended.txt

# 方式 B: 指定目标目录
VOLUME_DIR="/runpod-volume/models/loras" \
./download-loras.sh --from-file data/lora-urls.recommended.txt
```

---

### 步骤 3️⃣: 验证下载结果

```bash
# 查看已下载的 LoRA 文件
ls -lh models/loras/*.safetensors

# 统计数量（应该看到 30+ 个文件）
ls models/loras/*.safetensors | wc -l
```

---

## 📦 下载内容说明

### ✅ Recommended Pack（34 个 LoRA）

这是推荐的完整包，包含：

| 分类 | 数量 | 用途 | NSFW |
|------|------|------|------|
| **风格基础** | 8 个 | 写实/二次元/电影感 | 全部 SFW |
| **细节增强** | 4 个 | 皮肤/手部/通用细节 | 全部 SFW |
| **体型塑造** | 2 个 | 曲线/梨形身材 | 全部 SFW |
| **服装造型** | 6 个 | 内衣/泳装/制服等 | 部分 NSFW |
| **NSFW 动作** | 2 个 | 动态姿势/表情 | 仅 NSFW≥3 |

**总大小**: ~3GB  
**覆盖场景**: 95% 的日常生图需求

---

## 🎮 NSFW 等级配置建议

### ⭐ 标准版（推荐给 80% 用户）

下载 **Recommended Pack**，并在生图时根据以下规则自动选择：

| NSFW 等级 | 自动加载的 LoRA |
|----------|------------------|
| **NSFW 0** | 仅风格和细节 LoRA |
| **NSFW 1** | + 服装类（Lingerie/Bikini/Maid） |
| **NSFW 2** | + Latex/School 等进阶服装 |
| **NSFW 3** | + Pose_NSFW_Dynamic + Lewd |
| **NSFW 4+** | + Ahegao/Futa 等特殊 LoRA |

✅ **优势**: 空间占用合理，满足绝大部分需求

---

### 🔥 完整版（Pro/Unlimited 会员）

如果追求极致体验，可以下载所有可用 LoRA：

```bash
# 额外下载 Pony/Illustrious 专用 LoRA
scripts/runpod/download-extra.sh
```

**新增内容**:
- Pony 系列细节增强 LoRA
- Illustrious 系列 NSFW 滑块
- Gender Control 专项 LoRA
- 更多特殊风格 LoRA

✅ **优势**: 支持所有性别和癖好  
⚠️ **注意**: 额外增加约 2GB 空间占用

---

## 🛠️ 高级用法

### 批量下载特定类别

创建自定义列表文件（如 `custom-loras.txt`）：

```txt
# 仅下载服装类
flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894
flux_outfit_bikini_v1.safetensors|https://civitai.com/api/download/models/1184191
flux_outfit_latex_v1.safetensors|https://civitai.com/api/download/models/734230
```

然后执行：

```bash
./download-loras.sh --from-file custom-loras.txt
```

---

### 断点续传与重试

脚本已内置断点续传功能，即使网络中断也能继续：

```powershell
# PowerShell 会自动跳过已存在的文件
# 重新运行即可继续下载
.\download-loras.ps1
```

如需强制重新下载某个文件，先删除它：

```powershell
Remove-Item "models\loras\flux_style_photoreal_v1.safetensors"
.\download-loras.ps1
```

---

## ❓ 常见问题

### Q1: 没有 Civitai Token 能下载吗？
**A**: 可以，但部分高权重资源可能无法访问。建议使用 Token 以获得最佳体验。

### Q2: 下载速度慢怎么办？
**A**: 
- 检查网络连接稳定性
- 使用 `wget -c` (Linux) 或 `Invoke-WebRequest` (Windows) 的断点续传功能
- 在晚上低峰期下载

### Q3: 下载到哪里了？
**A**:
- Windows: `$env:USERPROFILE\models\loras\`
- Linux/RunPod: `/runpod-volume/models/loras/`
- 可通过 `-OutputDir` 参数自定义

### Q4: 如何确认 LoRA 类型是否正确？
**A**: 查看文件名中的标识：
- `flux_*`: FLUX 底模专用
- `pony_*`: Pony 底模专用
- `illustrious_*`: Illustrious 底模专用

---

## 📊 推荐下载优先级

### 第一阶段（必下）⭐⭐⭐
- [ ] `flux_style_photoreal_v1.safetensors` - 核心写实风格
- [ ] `flux_detail_skin_v1.safetensors` - 皮肤质感
- [ ] `flux_body_curvy_v1.safetensors` - 女性身形
- [ ] `flux_krea_realism.safetensors` - 男性写实（可选）

### 第二阶段（推荐）⭐⭐
- [ ] `flux_outfit_lingerie_v1.safetensors` - NSFW 1+
- [ ] `flux_pose_nsfw_dynamic_v1.safetensors` - NSFW 3+
- [ ] `flux_detail_hands_v1.safetensors` - 手部细节

### 第三阶段（扩展）⭐
- [ ] 其他服装类 LoRA
- [ ] Pony/Illustrious 专用 LoRA
- [ ] 特殊风格 LoRA

---

## 🔗 相关资源

- **完整 LoRA 目录**: [`data/lora-catalog.json`](data/lora-catalog.json)
- **详细文档**: [`LORA_DOWNLOAD_GUIDE.md`](LORA_DOWNLOAD_GUIDE.md)
- **生图指南**: [`docs/IMAGE_GENERATION_GUIDE.md`](docs/IMAGE_GENERATION_GUIDE.md)
- **LoRA 管理计划**: [`docs/LORA_MANAGEMENT.md`](docs/LORA_MANAGEMENT.md)

---

## 💡 提示

1. **定期更新**: 关注 Civitai 上的新 LoRA，可手动添加到下载列表
2. **版本控制**: 建议保留主要 LoRA 的多个版本备份
3. **存储管理**: 按性别/风格分类组织 LoRA 文件便于查找
4. **测试优化**: 不同 LoRA 组合可能有意外效果，建议多尝试

---

**祝下载愉快！** 🎉
