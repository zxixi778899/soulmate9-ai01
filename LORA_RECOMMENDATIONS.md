# SoulMate AI - LoRA 推荐与下载方案

## 📊 快速导航

| 需求 | 推荐包 | 文件大小 | 命令 |
|------|--------|---------|------|
| **新手入门** | Basic Pack (5 个) | ~400MB | `./download-loras.ps1 -Mode Basic` |
| **标准使用** | Recommended Pack (34 个) | ~3GB | `./download-loras.sh --from-file data/lora-urls.recommended.txt` |
| **完整体验** | All-in-One Pack (60+ 个) | ~6GB | `scripts/runpod/download-extra.sh` |

---

## 🎯 NSFW 等级与 LoRA 对应关系

### SFW 等级（NSFW 0-1）
适合普通用户，无暴露内容

```bash
# 必下载基础包
flux_style_photoreal_v1.safetensors          # 写实风格
flux_detail_skin_v1.safetensors              # 皮肤质感
flux_body_curvy_v1.safetensors               # 曲线身形
flux_krea_realism.safetensors                # 男性写实（可选）
rdanimefluxv1rapid.safetensors               # 二次元风格（可选）
```

### Pro 等级（NSFW 2-3）
支持轻度亲密接触和明确性行为

```bash
# 在 SFW 基础上额外下载
flux_outfit_lingerie_v1.safetensors         # 情趣内衣
flux_pose_nsfw_dynamic_v1.safetensors       # NSFW 动态姿势
flux_lewd_v1.safetensors                    # 通用 NSFW 增强
```

### Unlimited 等级（NSFW 4+）
支持极端场景和特殊癖好

```bash
# 完整扩展包
flux_face_ahegao_v1.safetensors             # 高潮表情
flux_nsfw_klein_v2.safetensors              # NSFW 强度增强
pony_futa_style.safetensors                 # Futa 风格
illustrious_nsfw_slider_v1.safetensors      # Illustrious NSFW 滑块
```

---

## 🗂️ LoRA 分类一览

### A. 风格类（Style LoRAs）⭐ 核心

| 文件名 | 用途 | NSFW | 默认强度 |
|--------|------|------|---------|
| `flux_style_photoreal_v1.safetensors` | FLUX 女性写实主风格 | SFW | 0.35 |
| `flux_krea_realism.safetensors` | FLUX 男性写实主风格 | SFW | 0.35 |
| `flux_hyperrealism_aidma.safetensors` | FLUX 跨性别超写实 | SFW | 0.35 |
| `rdanimefluxv1rapid.safetensors` | FLUX 二次元风格 | SFW | 0.5 |
| `flux_3d_render_v1.safetensors` | FLUX 3D 渲染风 | SFW | 0.5 |
| `flux_style_cinematic_v1.safetensors` | 电影感光影 | SFW | 0.3 |

### B. 细节类（Detail LoRAs）✨ 提升质量

| 文件名 | 用途 | NSFW | 默认强度 |
|--------|------|------|---------|
| `flux_detail_skin_v1.safetensors` | 皮肤质感增强 | SFW | 0.25 |
| `flux_detail_skin_nplastic_v1.safetensors` | 真实肤质 | SFW | 0.25 |
| `flux_detail_hands_v1.safetensors` | 手部细节修正 | SFW | 0.25 |
| `flux_add_details.safetensors` | 通用细节增强 | SFW | 0.25 |

### C. 体型类（Body LoRAs）💪 塑造身材

| 文件名 | 用途 | NSFW | 默认强度 |
|--------|------|------|---------|
| `flux_body_curvy_v1.safetensors` | 曲线丰满身材 | SFW | 0.4 |
| `flux_body_pear_v1.safetensors` | 梨形身材 | SFW | 0.4 |
| `flux_male_masc_v1.safetensors` | 男体写实 MASC | SFW | 0.4 |
| `flux_male_muscle_v1.safetensors` | 肌肉线条增强 | SFW | 0.35 |
| `flux_femboy-v1.safetensors` | 伪娘角色 | SFW | 0.4 |
| `realistic-mtf-trans.safetensors` | MtF 跨性别 | SFW | 0.4 |

### D. 服装类（Outfit LoRAs）👙 服饰造型

| 文件名 | 用途 | NSFW | 默认强度 |
|--------|------|------|---------|
| `flux_outfit_lingerie_v1.safetensors` | 情趣内衣 | ⚠️ NSFW | 0.45 |
| `flux_outfit_bikini_v1.safetensors` | 比基尼泳装 | SFW | 0.45 |
| `flux_outfit_latex_v1.safetensors` | 皮衣胶衣 | ⚠️ NSFW | 0.45 |
| `flux_outfit_school_v1.safetensors` | 校园制服 | SFW | 0.45 |
| `flux_outfit_maid_v1.safetensors` | 女仆装 | SFW | 0.45 |
| `flux_outfit_bunny_v1.safetensors` | 兔女郎 | ⚠️ NSFW | 0.45 |

### E. 动作类（Action LoRAs）🔥 NSFW 专用

| 文件名 | 用途 | NSFW | 默认强度 |
|--------|------|------|---------|
| `flux_pose_nsfw_dynamic_v1.safetensors` | NSFW 动态姿势 | ⚠️ NSFW≥3 | 0.45 |
| `flux_face_ahegao_v1.safetensors` | 高潮表情 | ⚠️ NSFW≥4 | 0.4 |
| `flux_lewd_v1.safetensors` | 通用 NSFW 辅助 | ⚠️ NSFW≥3 | 0.3 |
| `flux_nsfw_klein_v2.safetensors` | NSFW 强度增强 | ⚠️ NSFW≥3 | 0.4 |
| `flux_uncensored.safetensors` | 无审查辅助 | ⚠️ NSFW≥3 | 0.3 |

### F. 特殊底模专用（Pony/Illustrious）🎨

| 文件名 | 适用底模 | 用途 | NSFW |
|--------|---------|------|------|
| `pony_detailifier_v5.safetensors` | Pony | 细节增强 | ✅/❌ |
| `pony_mature_female_slider_v2.safetensors` | Pony | 成熟女性 | SFW |
| `pony_gender_transition_slider.safetensors` | Pony | 跨性别过渡 | ⚠️ NSFW |
| `pony_futa_style.safetensors` | Pony | Futa 风格 | ⚠️ NSFW |
| `illustrious-micro-details-v6.safetensors` | Illustrious | 微细节增强 | SFW |
| `illustrious_nsfw_slider_v1.safetensors` | Illustrious | NSFW 强度 | ⚠️ NSFW≥3 |

---

## 📦 三种配置方案对比

### 方案 1: Basic Pack（5 个 LoRA，~400MB）

**适合**: 新用户测试、存储空间有限、仅 SFW 需求

**包含**:
- `flux_style_photoreal_v1.safetensors` - 写实风格
- `flux_detail_skin_v1.safetensors` - 皮肤质感  
- `flux_body_curvy_v1.safetensors` - 曲线身形
- `rdanimefluxv1rapid.safetensors` - 二次元风格
- `flux_outfit_bikini_v1.safetensors` - 比基尼

**覆盖**: 
- ✅ SFW 生图（90%）
- ✅ 基础服装搭配
- ✅ 多风格支持

---

### 方案 2: Recommended Pack（34 个 LoRA，~3GB）⭐⭐⭐

**适合**: 80% 的标准用户、Pro/Unlimited 会员

**包含**:
- 所有 Basic Pack 内容
- 7 个进阶风格 LoRA
- 全部服装类 LoRA（包括 Lingerie/Latex）
- NSFW 基础动作 LoRA

**覆盖**:
- ✅ SFW 生图（100%）
- ✅ NSFW 1-3 等级（95%）
- ✅ 男女双性别支持
- ✅ Realistic/Anime/3D三风格

---

### 方案 3: All-in-One Pack（60+ LoRA，~6GB）

**适合**: 极端定制需求、高级用户、工作室

**包含**:
- 所有 Recommended Pack 内容
- Pony 全系列 LoRA
- Illustrious 全系列 LoRA
- Gender Control 专项 LoRA
- 更多特殊风格和动作 LoRA

**覆盖**:
- ✅ 所有 NSFW 等级（0-5）
- ✅ 所有性别（Female/Male/Trans/Femboy）
- ✅ 所有风格（Realistic/Anime/3D/Special）
- ✅ 特殊癖好支持

---

## 🚀 快速执行命令

### Windows PowerShell

```powershell
# 设置 Civitai Token（首次运行）
$env:CIVITAI_API_TOKEN = "cv_your_token_here"

# 下载 Recommended Pack（推荐）
.\download-loras.ps1 -OutputDir "C:\RunPodVolume\models\loras"

# 批量下载指定类别（示例：仅下载服装类）
# 1. 创建 custom-loras.txt（每行：文件名 | 下载链接）
# 2. 运行
.\download-loras.ps1 -UrlsFile ".\custom-loras.txt" -OutputDir "C:\RunPodVolume\models\loras"
```

### Linux / WSL / RunPod

```bash
# 设置 Civitai Token
export CIVITAI_API_TOKEN="cv_your_token_here"

# 方法 1: 使用预置的 recommended 列表
export VOLUME_DIR="/runpod-volume/models/loras"
./download-loras.sh --from-file data/lora-urls.recommended.txt

# 方法 2: 批量下载额外 LoRA（Pony/Illustrious）
cd scripts/runpod
chmod +x download-extra.sh
./download-extra.sh

# 方法 3: 自定义列表下载
echo "# Custom list" > custom-loras.txt
echo "flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/869894" >> custom-loras.txt
../download-loras.sh --from-file custom-loras.txt
```

---

## 📈 LoRA 叠加建议

### 安全组合策略

| 类型 | 组合数量 | 最大总强度 | 说明 |
|------|---------|-----------|------|
| **风格 + 细节** | 2 个 | ≤ 0.5 | 如：Photoreal(0.35) + Skin(0.25) |
| **风格 + 体型** | 2 个 | ≤ 0.5 | 如：Photoreal(0.35) + Curvy(0.3) |
| **NSFW 全套** | 4 个 | ≤ 0.8 | 如：Lingerie(0.45) + Pose(0.45) |
| **复杂场景** | 6 个 | ≤ 1.0 | 需要精细控制时使用 |

### ⚠️ 重要提示
1. **单 LoRA 强度范围**: 0.2 ~ 0.6（超出易失真）
2. **总强度上限**: 建议不超过 1.0，超过后效果边际递减
3. **冲突检测**: 同类 LoRA（如两个身体类）不要叠加
4. **自动路由**: 系统会自动选择合适组合，无需手动干预

---

## 🔍 验证下载成功

### 检查文件完整性

```bash
# 列出所有 Safetensors 文件
ls -lh $VOLUME_DIR/*.safetensors

# 按大小排序查看大文件
ls -lhS $VOLUME_DIR/*.safetensors | tail -20

# 检查关键 LoRA 是否存在
for file in "flux_style_photoreal_v1.safetensors" "flux_detail_skin_v1.safetensors"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file 缺失"
    fi
done
```

### 在 ComfyUI 中验证

1. 打开 ComfyUI → Object Browser
2. 点击 `Load LoRA` 节点
3. 查看可加载的 LoRA 列表
4. 确认文件名与预期一致

---

## 💾 备份与更新

### 定期备份

```bash
# 备份到本地
tar -czf loras-backup-$(date +%Y%m%d).tar.gz $VOLUME_DIR/*.safetensors

# 上传到云端（如有 OSS/Blob 存储）
az storage blob upload-batch --source $VOLUME_DIR --dest "loras-backup"
```

### 版本管理

建议保留：
- **最新稳定版**: 当前生产环境使用的版本
- **历史备份**: 过去 3 个月的版本快照
- **废弃标记**: 不再使用的 LoRA 单独存放

---

## 📝 日志与问题排查

### 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 下载失败 | 网络问题 | 使用断点续传，重试 |
| Token 无效 | Token 过期 | 重新生成并更新环境变量 |
| 文件格式错误 | 下载不完整 | 删除文件，重新下载 |
| LoRA 无法加载 | 底模不匹配 | 确认 LoRA 适用的底模（FLUX/Pony/Illustrious） |

### 调试信息

```bash
# 查看详细日志
export DOWNLOAD_VERBOSE=true
./download-loras.sh --from-file data/lora-urls.recommended.txt

# 跳过失败继续
export CONTINUE_ON_ERROR=true
./download-loras.sh --from-file data/lora-urls.recommended.txt
```

---

## 📚 相关文档

- **[LORA_DOWNLOAD_GUIDE.md](LORA_DOWNLOAD_GUIDE.md)** - 详细下载指南（含 NSFW 分级说明）
- **[LORA_QUICKSTART.md](LORA_QUICKSTART.md)** - 快速启动教程（3 步搞定）
- **[data/lora-catalog.json](data/lora-catalog.json)** - LoRA 目录元数据（1003 行）
- **[docs/LORA_MANAGEMENT.md](docs/LORA_MANAGEMENT.md)** - LoRA 管理计划
- **[docs/IMAGE_GENERATION_GUIDE.md](docs/IMAGE_GENERATION_GUIDE.md)** - 生图流程指南

---

## ✨ 最佳实践

1. **渐进式安装**: 先下基础包 → 再按需添加 → 最后扩展特殊 LoRA
2. **定期清理**: 移除未使用的 LoRA，节省空间
3. **测试优化**: 通过 ComfyConsole 测试不同组合效果
4. **记录参数**: 保存成功的 LoRA 组合及强度配置
5. **关注社区**: 定期查看 Civitai 上的新 LoRA，评估是否加入

---

**祝你使用愉快！** 🎉

如果遇到问题，请查阅：
- [`BUGFIX_LOG.md`](BUGFIX_LOG.md) - Bug 修复日志
- [`RUNPOD_SDXL_SETUP.md`](RUNPOD_SDXL_SETUP.md) - RunPod 配置指南
- 或直接在项目 Issue 区反馈
