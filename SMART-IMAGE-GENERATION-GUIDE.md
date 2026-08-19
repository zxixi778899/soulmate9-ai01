# 智能生图使用指南

## 🎯 **核心功能**

1. **动态构图检测** - 根据提示词自动判断需要半身/全身/特写/场景
2. **人脸一致性保持** - 通过 IP-Adapter (FaceID) 确保多张图是同一人
3. **提示词增强** - 自动补充构图相关的专业关键词

---

## 📦 **安装与配置**

### **前置条件**

确保 RunPod Worker 已安装以下节点：
```bash
# IP-Adapter Flux
shakker-labs/ComfyUI-IPAdapter-Flux

# 可选：ControlNet（用于姿势控制）
comfyanonymous/ComfyUI_Composite_nodes
```

### **环境变量检查**

```bash
# .env.local 确认已启用
RUNPOD_IPADAPTER_READY=true
RUNPOD_CONTROLNET_READY=true
```

---

## 🚀 **基本用法**

### **1. 最简单方式 - 单张生成**

```typescript
import { smartGenerate } from '@/lib/smart-image-generation';

// 用户输入：生成女友的全身照
const result = await smartGenerate({
  prompt: 'standing pose, wearing red dress',
  characterImage: girlfriend.portraitUrl,  // 关键：传入参考图
});

console.log('生成的图片:', result.images[0]);
console.log('自动检测的构图:', result.compositionType); // 'fullbody'
```

**效果：**
- ✅ 自动识别 "standing" → 全身照 (768x1024)
- ✅ 人脸锁定为 `characterImage`
- ✅ 追加 "full body portrait, standing pose" 等关键词

---

### **2. 批量生成不同构图**

```typescript
import { generateWithFaceConsistency } from '@/lib/smart-image-generation';

const basePortrait = girlfriend.initialImage;  // 初始创建的照片

// 一键生成多种构图
const variations = await generateWithFaceConsistency(basePortrait, [
  {
    description: 'wearing business suit, office background',
    composition: 'headshot',  // 强制半身特写
    style: '写实',
  },
  {
    description: 'wearing summer dress, beach vacation',
    composition: 'portrait',  // 默认 3:4 肖像
    style: '写实',
  },
  {
    description: 'wearing evening gown, dinner date',
    composition: 'fullbody',  // 全身
    style: '写实',
  },
  {
    description: 'relaxing on couch at home',
    composition: 'scene',  // 场景照
    style: '写实',
  },
]);

// variations 返回结构：
[
  {
    variation: 'wearing business suit, office background',
    image: 'https://...',
    prompt: 'photorealistic portrait of ..., close-up, headshot, face focus, ...'
  },
  // ...
]
```

---

### **3. 聊天中动态生成照片**

```typescript
// src/app/api/chat/stream/route.ts

async function handlePhotoRequest(userMessage: string, girlfriend: Girlfriend) {
  const result = await smartGenerate({
    prompt: userMessage,  // 直接使用用户的描述
    characterImage: girlfriend.portraitUrl,  // 保持一致性
    enableAutoComposition: true,  // 自动检测
  });
  
  return {
    type: 'image',
    imageUrl: result.images[0],
    composition: result.compositionType,
    detectedPrompts: result.appliedPrompts,
  };
}

// 用户使用示例：
// 用户："可以拍一张全身照吗？穿着白色连衣裙站在花园里"
// → 自动识别为 fullbody，尺寸 768x1024
// → 人脸保持不变，只改变服装和背景
```

---

## 🔍 **智能构图检测规则**

### **触发关键词对照表**

| 类型 | 关键词示例 | 输出尺寸 | 纵横比 |
|------|-----------|---------|--------|
| **特写 (Headshot)** | `close-up`, `face only`, `selfie`, `macro` | 512×768 | 2:3 |
| **肖像 (Portrait)** | `portrait`, `head and shoulders`, `bust`, `sitting` | 1024×1280 | 3:4 |
| **全身 (Fullbody)** | `full body`, `entire body`, `from head to toe`, `standing` | 768×1024 | 3:4 |
| **横版全身** | `full body + horizontal/wide` | 1280×768 | 16:9 |
| **场景 (Scene)** | `wide angle`, `landscape`, `scenery`, `cinematic` | 1280×720 | 16:9 |

### **优先级逻辑**

```typescript
if (全身关键词 > 0 && 肖像关键词 === 0) {
  → 全身照
} else if (特写关键词 > 肖像关键词 × 2) {
  → 特写
} else if (场景关键词 > 肖像 && 场景 > 全身) {
  → 场景照
} else {
  → 默认肖像
}
```

---

## 💡 **高级技巧**

### **1. 强制覆盖自动检测**

```typescript
// 即使提示词说"standing"，也强制生成半身照
await smartGenerate({
  prompt: 'standing in the park, wearing casual clothes',
  characterImage: girlfriend.portraitUrl,
  forceComposition: 'portrait',  // 忽略 detect，强制 3:4
});
```

### **2. 禁用自动检测（完全手动）**

```typescript
await smartGenerate({
  prompt: 'some text here',
  characterImage: girlfriend.portraitUrl,
  enableAutoComposition: false,  // 关闭 AI 辅助
  
  // 手动指定尺寸
  width: 1024,
  height: 1536,
});
```

### **3. 结合 ControlNet 控制姿势**

```typescript
import { smartGenerate } from '@/lib/smart-image-generation';

await smartGenerate({
  prompt: 'waving hello',
  characterImage: girlfriend.portraitUrl,
  control_image: poseReferenceImage,  // ControlNet 参考图
  control_strength: 0.7,
  enableAutoComposition: true,
});
```

---

## ⚠️ **常见问题**

### **Q1: 人脸还是不一致？**

**原因分析：**
1. IP-Adapter 权重过低
2. 参考图质量差（模糊/角度不正）
3. Denoise 过高（>0.8）

**解决方案：**
```typescript
await smartGenerate({
  prompt: 'smiling happily',
  characterImage: referenceImage,
  ip_adapter_weight: 0.8,  // 提高权重（默认 0.7）
  ip_adapter_start: 0.02,  // 更早开始影响
  ip_adapter_end: 0.9,     // 更晚结束
});
```

### **Q2: 构图检测不准？**

**优化提示词：**
```typescript
// ❌ 模糊的描述
prompt: 'standing outside'  // 可能被误判

// ✅ 明确的关键字
prompt: 'full body shot, standing outside, entire body visible'
```

### **Q3: 生成速度慢？**

**原因：** 自动检测需要额外解析步骤（但差异很小，<100ms）

**优化方案：**
```typescript
// 如果不需要动态检测，提前计算好尺寸
await smartGenerate({
  prompt: 'photo',
  characterImage: ref,
  enableAutoComposition: false,  // 跳过检测
  width: 1024,
  height: 1280,
});
```

---

## 🔄 **回退到传统方式**

如果不想用智能模块，可以直接调用 `runpod.generate`：

```typescript
import { generate } from '@/lib/runpod';

// 传统方式（不智能）
const result = await generate({
  prompt: 'standing in the garden',
  ip_adapter_image: girlfriend.portraitUrl,  // 需要手动传
  width: 1024,
  height: 1280,
});
```

---

## 📊 **性能对比**

| 方式 | 生成时间 | 人脸一致性 | 构图灵活性 | 推荐场景 |
|------|---------|-----------|-----------|---------|
| **smartGenerate** | 15-25s | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 对话、画廊 |
| **generateWithFaceConsistency** | 4×15s | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 批量创作 |
| **直接 runpod.generate** | 15-25s | ⭐⭐⭐⭐ | ⭐⭐ | 快速原型 |

---

## 🎨 **实战案例**

### **案例：AI 女友的日常照片服务**

```typescript
// src/components/GirlfriendChat.tsx

async function sendPhotoRequest(message: string, girlfriendId: string) {
  const gf = await getGirlfriend(girlfriendId);
  
  // 1. 智能检测用户意图
  const intent = analyzeIntent(message); // photo/full body/casual
  
  let composition: 'headshot' | 'portrait' | 'fullbody' = 'portrait';
  
  if (intent.includes('全身')) {
    composition = 'fullbody';
  } else if (intent.includes('大头照') || intent.includes('自拍')) {
    composition = 'headshot';
  }
  
  // 2. 调用智能生图
  const result = await smartGenerate({
    prompt: message,
    characterImage: gf.latestPortrait,
    forceComposition: composition,
  });
  
  // 3. 保存并推送
  await saveGeneratedImage(result.images[0]);
  return result.images[0];
}
```

---

## 📞 **技术支持**

遇到问题请查看：
1. RunPod Worker logs (`docker logs`)
2. 前端 console 的错误信息
3. 参考图格式是否为 PNG/JPG
4. IP-Adapter 模型文件是否存在
