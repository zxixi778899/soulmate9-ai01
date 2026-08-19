# RunPod 生图尺寸配置指南

## 📊 **问题描述**

**之前的问题：**
- 默认尺寸：1024 x 1536 (约 2:3)
- 效果：锁死半身像（突出面部特写）

**修复后：**
- 默认尺寸：1024 x 1280 (约 3:4)
- 效果：全身/半膝像（更适合角色展示）

---

## 🎯 **推荐尺寸配置**

### **1. 头像/半身像（适合聊天头像、快速预览）**
```typescript
await generate({
  width: 1024,
  height: 1280,  // 3:4 - 经典的半身肖像比例
  prompt: 'portrait, head and shoulders, elegant pose'
});
```

### **2. 全身照（适合角色展示、衣柜页面）**
```typescript
await generate({
  width: 1024,
  height: 768,   // 4:3 - 横向构图，完整身材
  prompt: 'full body shot, full body portrait, standing pose'
});

// 或者竖版全身
await generate({
  width: 768,
  height: 1024,  // 3:4 但更矮胖，显示全身
  prompt: 'full body view, entire body, from head to toe'
});
```

### **3. 电影宽屏（适合海报、社交媒体）**
```typescript
await generate({
  width: 1280,
  height: 720,   // 16:9 - 电影感宽屏
  prompt: 'cinematic wide shot, dramatic composition'
});
```

### **4. 正方形（适合 Instagram、头像卡片）**
```typescript
await generate({
  width: 1024,
  height: 1024,  // 1:1 - 标准正方形
  prompt: 'square portrait, symmetrical composition'
});
```

---

## 🔧 **代码中的配置位置**

### **文件：`src/lib/runpod.ts`**

#### **默认值（第 172-173 行）**
```typescript
const width = opts.width ?? 1024;        // Default 1024 for character portraits
const height = opts.height ?? 1280;      // Default 1280 (3:4 ratio) for full-body to knee shots
```

#### **如需全局修改默认尺寸：**
直接修改上述数值即可。例如改为全身照：

```typescript
const width = opts.width ?? 768;         // 更小宽度
const height = opts.height ?? 1024;      // 更低高度，显示全身
```

---

## 💡 **提示词优化技巧**

### **强制指定姿势的关键词**

#### ✅ 全身照提示词
```
full body shot, full body portrait, entire body, 
from head to toe, standing pose, full length portrait,
knees up shot, lower body visible
```

#### ✅ 半身照提示词
```
portrait, head and shoulders, upper body only, 
close-up, face focus, bust portrait, waist up
```

#### ✅ 避免的关键字
```
不要使用：
- "wide angle"（可能导致不必要的背景扩展）
- "landscape"（可能强制横版）
- "background scenery"（分散主体注意力）
```

---

## 🎨 **不同用途的推荐配置**

| 用途 | 宽高比 | 建议尺寸 | 提示词关键词 |
|------|--------|----------|-------------|
| **聊天头像** | 3:4 | 1024x1280 | portrait, elegant, head and shoulders |
| **个人资料页** | 4:3 | 1024x768 | full body, standing pose, complete outfit |
| **创建向导预览** | 1:1 | 1024x1024 | square portrait, centered composition |
| **画廊网格** | 3:4 | 1024x1280 | same as chat avatar |
| **社交媒体分享** | 4:5 | 1000x1250 | social media portrait, vertical composition |
| **广告横幅** | 16:9 | 1280x720 | cinematic, dramatic lighting, landscape |

---

## ⚠️ **注意事项**

### **1. 显存限制（RunPod Worker）**
- FLUX 模型建议使用 1024x1024 ~ 1024x1536
- 超过 1536 高度可能导致 OOM 错误
- SDXL 端点可支持更高分辨率

### **2. 生成时间**
- 1024x1280 @ 28 steps ≈ 15-25 秒（FLUX）
- 1024x1536 @ 28 steps ≈ 20-30 秒（FLUX）
- 增加 batch_size 会线性增加时间

### **3. LoRA 影响**
某些 LoRA 对特定尺寸有优化：
- `flux_pose_nsfw_dynamic_v1.safetensors` - 动态姿势，适合全身照
- `flux_body_curvy_v1.safetensors` - 强调身体曲线，适合 3:4 比例

---

## 🚀 **实际调用示例**

### **创建女友时的预览图**
```typescript
// 创建阶段：使用更快的正方形预览
const preview = await generateImage({
  width: 512,
  height: 512,
  steps: 12,  // 降低步数加快速度
  prompt: quickPrompt,
  model_family: 'flux',
});

// 确认创建：生成高分辨率全身照
const finalPortrait = await generateImage({
  width: 1024,
  height: 1280,
  steps: 28,
  lora_name: 'flux_style_photoreal_v1.safetensors',
  prompt: refinedPrompt,
  model_family: 'flux',
});
```

### **聊天中发送图片**
```typescript
// 根据对话内容动态调整
if (conversationContext.includes('photo') || conversationContext.includes('picture')) {
  return await generateImage({
    width: 1024,
    height: 1280,
    prompt: `photoshoot, ${userRequest}, fashion photography`,
    model_family: 'flux',
    ip_adapter_image: girlfriend.portraitUrl,
  });
}
```

---

## 🔄 **回滚到之前的设置**

如果新尺寸不符合预期，可以恢复旧版本：

```typescript
const width = opts.width ?? 1024;
const height = opts.height ?? 1536;  // 恢复 2:3 半身比例
```

---

## 📞 **需要帮助？**

如果遇到尺寸相关的问题：
1. 检查生成的图片是否符合预期
2. 查看 RunPod worker 日志是否有 OOM 错误
3. 尝试调整宽高比例（保持纵横比一致）
4. 考虑使用 img2img 模式而非 txt2img
