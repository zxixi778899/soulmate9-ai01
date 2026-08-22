# 统一 FLUX 风格预览图批量生成指南

## 📋 概述

本脚本用于批量生成一套风格统一的 AI 女友预览图，使用 **FLUX.1-dev** 底模，确保所有图片在视觉上保持一致的艺术风格和参数设置。

## 🎯 生成的预览类型

预设了 8 种不同的角色风格：

| ID | 类型 | 颜色主题 | 提示词关键词 |
|----|------|---------|------------|
| anime_girl_1 | 二次元女孩 | #FF2D78 (粉色) | 长发、棕眼、休闲装、柔和光效 |
| anime_girl_2 | 甜美少女 | #EC4899 (玫红) | 粉发、蓝眼、校服、樱花背景 |
| anime_girl_3 | 神秘哥特 | #8B5CF6 (紫色) | 黑长直、紫眼、洛丽塔、月光 |
| realistic_girl_1 | 写实女性 | #F59E0B (橙色) | 自然妆、米色大衣、城市黄昏 |
| realistic_girl_2 | 清新自然 | #10B981 (绿色) | 金发、绿眼、夏装、公园阳光 |
| 3d_render_1 | 3D 科幻 | #06B6D4 (青色) | 赛博朋克、霓虹灯、动态姿势 |
| 3d_render_2 | 3D 奇幻 | #EF4444 (红色) | 童话森林、魔法粒子、迪士尼风格 |
| sketch_art_1 | 手绘素描 | #6366F1 (蓝色) | 铅笔素描、灰阶、水彩点缀 |

## 🔧 技术参数（统一标准）

- **底模**: `flux1-dev-fp8.safetensors`
- **分辨率**: 512×640 (3:4 比例 - 适合全身到膝盖的肖像构图)
- **采样步数**: 28 steps
- **CFG Scale**: 1.0 (固定，依靠 FluxGuidance 节点控制引导强度)
- **Flux Guidance**: 3.5
- **采样器**: euler
- **调度器**: simple
- **种子**: 随机生成 (每次运行不同)

## 🚀 使用方法

### 方法 1: 直接运行脚本 (推荐)

```bash
cd c:\Users\71489\soulmate9
node scripts/generate-preview-images.mjs
```

### 方法 2: 通过 package.json 脚本

```bash
pnpm run generate-previews
```

### 方法 3: 修改后自定义运行

编辑脚本中的以下配置：
- `RUNPOD_API_KEY` - API 密钥
- `RUNPOD_ENDPOINT_ID` - RunPod 端点 ID
- `PREVIEW_CONFIGS` - 添加/删除自己的预览配置
- `width`, `height` - 调整输出尺寸

## 📊 输出结果

脚本会生成一个 JSON 文件 `preview-generation-results.json`，包含：

```json
[
  {
    "id": "anime_girl_1",
    "prompt": "beautiful anime girl, long flowing hair...",
    "color": "#FF2D78",
    "url": "https://your-supabase-bucket/path/to/image.png"
  }
]
```

## ⏱️ 预计时间

- 单个图片生成等待时间：约 5-10 分钟
- 全套 8 张图片：**约 40-80 分钟**
- 并行处理选项：需要多端点配置

## 🔍 Job 轮询机制

脚本使用正确的 RunPod API 路径查询状态：
- ✅ `/v2/{endpoint_id}/status/{jobId}` (正确)
- ❌ `/v2/{endpoint_id}/jobs/{jobId}` (错误)

轮询间隔：5 秒
最大等待：60 次尝试（300 秒 = 5 分钟）

## 🐛 故障排除

### 问题 1: 提交失败 (401/403)
```
❌ Failed to submit xxx: Unauthorized
```
**解决方案**:
- 检查 `RUNPOD_API_KEY` 是否有效
- 确认 API Key 权限是否正确

### 问题 2: 端点不存在 (404)
```
❌ Status check failed for xxx: page not found
```
**解决方案**:
- 验证 `RUNPOD_ENDPOINT_ID` 是否有效
- 确认端点是 ComfyUI 且已启动

### 问题 3: Job 超时
```
⏱️ Timeout for job xxx
```
**解决方案**:
- GPU 资源不足，重试
- 检查端点日志
- 增加最大尝试次数

### 问题 4: 显存溢出 (OOM)
```
Error: out of memory
```
**解决方案**:
- 降低分辨率 (如 512×512)
- 减少步数 (如 20 steps)
- 分批生成

## 🎨 自定义提示词

编辑脚本中的 `PREVIEW_CONFIGS` 数组，每个配置包含：

```javascript
{
  id: 'unique_identifier',           // 唯一标识符
  prompt: 'positive description...', // 正向提示词
  negativePrompt: 'avoid these...',  // 负向提示词
  color: '#FF2D78'                   // 配色标记
}
```

### 最佳实践

✅ **好的提示词**:
- 具体描述角色特征 (头发、眼睛、服装)
- 指定场景和氛围
- 注明艺术风格
- 强调高质量细节

❌ **避免**:
- 过于笼统 ("beauty", "pretty")
- 相互矛盾的描述
- 无关的关键字堆砌
- 重复的概念

## 📸 图像质量优化建议

### 提升清晰度
- 增加步骤：28 → 32-36
- 启用 Face Detailer (如果支持)
- 使用高清修复 Upscale

### 增强一致性
- 固定部分种子 (如前 3 位)
- 使用 IP-Adapter 保持面部一致
- 统一 lighting 和 style 描述

### 加快生成速度
- 降低分辨率：512×640 → 512×512
- 减少步骤：28 → 20
- 启用 turbo scheduler (实验性)

## 🔗 与现有系统集成

### 导入到 Create 页面
生成的预览图可以上传到:
- Supabase Storage (`portraits/style-previews/`)
- Site Settings (`creator_style_previews`)
- Admin 后台就地管理

### 数据库字段
```sql
INSERT INTO site_settings (key, value) VALUES 
('creator_preview_anime_1', 'image_url_here'),
('creator_preview_realistic_1', 'image_url_here');
```

## 🌟 进阶功能

### 批量并行生成
修改脚本支持多个端点同时工作:
```javascript
const endpoints = ['endpoint1', 'endpoint2'];
await Promise.all(endpoints.map(id => generateWithEndpoint(id, config)));
```

### IP-Adapter 面部一致
添加参考图参数:
```javascript
{
  ip_adapter_image: 'worker_local_path.png',
  ip_adapter_weight: 0.7,
  ip_adapter_start: 0.05,
  ip_adapter_end: 0.85
}
```

### LoRA 混合
应用特定风格的 LoRA:
```javascript
{
  lora_name: 'anime_detail.safetensors',
  lora_strength_model: 0.6,
  lora_strength_clip: 0.6
}
```

## 📝 日志输出示例

```
🎨 Starting Batch Preview Generation...

📍 Endpoint: e40cgshtouocg8
🎯 Model: flux1-dev-fp8.safetensors
📐 Size: 512x640 (3:4 ratio)
🔄 Steps: 28 | CFG: 1 | Guidance: 3.5


============================================================
Processing 1/8: anime_girl_1
============================================================

📤 Submitting job for anime_girl_1...
⏳ Waiting for eec4ec8b... (1/60) Status: IN_QUEUE
⏳ Waiting for eec4ec8b... (2/60) Status: IN_PROGRESS
⏳ Waiting for eec4ec8b... (3/60) Status: IN_PROGRESS
✅ Job eec4ec8b completed!
   Output: https://xxx.supabase.co/storage/v1/object/...
💾 Saved: https://xxx.supabase.co/storage/v1/object/...

============================================================
📊 GENERATION SUMMARY
============================================================

✅ Successful: 1/8
❌ Failed: 0/8
```

## 🔄 后续步骤

1. **上传到存储**: 将生成的图片 URL 存入 Supabase
2. **更新预设库**: 在 Admin 后台添加新预览图
3. **测试展示**: 在 Create 页面验证显示效果
4. **用户反馈**: 收集用户对风格多样性的意见
5. **迭代优化**: 根据数据调整提示词和参数

---

## 📞 技术支持

如有问题请查阅:
- [COMFYUI-NODES-GUIDE.md](./COMFYUI-NODES-GUIDE.md)
- [RUNPOD-SUPPORT.md](./RUNPOD-SUPPORT.md)
- [FLUX-PARAMETERS.md](./FLUX-PARAMETERS.md)

---

**版本**: v1.0  
**更新日期**: 2026-08-21  
**兼容性**: Next.js 15 + RunPod Serverless + FLUX.1-dev
