# Smart Image Generation - Mode Selection Guide

## 🔄 **重要更新：IP-Adapter 仅在 img2img 模式启用**

### **核心逻辑变更**

| 模式 | IP-Adapter | Input Image (img2img) | 人脸一致性 | 生成方式 |
|------|-----------|---------------------|----------|---------|
| **txt2img** (默认) | ❌ 禁用 | ❌ 不传 | ❌ 随机新脸 | 纯文本生成 |
| **img2img** | ✅ 启用 | ✅ 提供参考图 | ✅ 保持原脸 | 基于参考图修改 |
| **hybrid** | ✅ 启用 | ✅ 提供参考图 | ✅ 保持原脸 | 综合增强 |

---

## 🎯 **使用示例**

### **1. 文生图 - 随机新生成（默认）**

```typescript
import { smartGenerate } from '@/lib/smart-image-generation';

// === 场景：创建女友时的随机外观 ===
const result = await smartGenerate({
  prompt: 'young woman with long blonde hair, blue eyes',
  mode: 'txt2img',  // 或不指定（默认为 txt2img）
});

// ✅ 结果：完全随机的新面孔
// ❌ 不会锁定任何人脸
console.log('ipAdapterUsed:', result.ipAdapterUsed); // false
```

**典型用例：**
- ✅ 首次创建女友角色
- ✅ 批量生成候选方案
- ✅ 探索不同外貌特征
- ✅ 随机性要求高的场景

---

### **2. 图生图 - 保持人脸一致（核心功能）**

```typescript
// === 场景：同一角色的多种服装/姿势/背景 ===
const basePortrait = girlfriend.initialImage;  // 已确定的初始头像

const variations = await generateWithFaceConsistency(basePortrait, [
  {
    description: 'wearing business suit',
    composition: 'portrait',
    style: '写实',
  },
  {
    description: 'in summer dress at beach',
    composition: 'fullbody',
    style: '写实',
  },
]);

// ✅ 结果：所有图片都是同一个人脸
// ✅ 变化的是服装、姿势、背景、光线等
console.log(variations[0].image);  // 同人脸 + 西装
console.log(variations[1].image);  // 同人脸 + 泳装
```

**典型用例：**
- ✅ 换装系统
- ✅ 衣柜展示
- ✅ 姿势库扩展
- ✅ 聊天中发送多张照片

---

### **3. 混合模式 - img2img + IP-Adapter + ControlNet**

```typescript
// === 场景：严格控制姿势同时保持人脸 ===
const result = await smartGenerate({
  prompt: 'standing on rooftop, city skyline background',
  referenceImage: girlfriend.portraitUrl,
  control_image: poseReferenceImage,  // ControlNet 控制
  mode: 'hybrid',                     // 启用所有能力
  forceComposition: 'fullbody',
});

// ✅ 结果：人脸一致 + 姿势固定 + 构图准确
```

---

## 🔧 **API 参数详解**

### **SmartGenerateOptions Interface**

```typescript
export interface SmartGenerateOptions {
  prompt: string;              // 必填 - 提示词
  
  referenceImage?: string;     // 选填 - 参考图 URL（用于 img2img+IP-Adapter）
  
  negativePrompt?: string;     // 选填 - 负面提示词
  
  /** 模式选择 */
  mode?: 'txt2img' | 'img2img' | 'hybrid';
  
  enableAutoIpAdapter?: boolean;   // 自动启用 IP-Adapter（默认 true）
  
  enableAutoComposition?: boolean; // 自动构图检测（默认 true）
  
  forceComposition?: 'headshot' | 'portrait' | 'fullbody' | 'scene';
}
```

---

## 🚀 **完整工作流程**

### **流程 1: 好友推荐系统**

```typescript
async function recommendGirlfriends(count: number) {
  const results = [];
  
  for (let i = 0; i < count; i++) {
    // txt2img 模式 - 每生成一个新面孔
    const portrait = await smartGenerate({
      prompt: getRandomAppearance(),  // 'brunette girl', 'asian beauty', etc.
      mode: 'txt2img',                 // ← 随机脸
      enableAutoComposition: true,     // ← 自动判断半身/全身
    });
    
    results.push({
      image: portrait.images[0],
      isConsistent: !portrait.ipAdapterUsed,  // true = 随机脸
    });
  }
  
  return results;
}
```

---

### **流程 2: 角色扮演对话**

```typescript
async function handleChatPhotoRequest(userMessage: string, girlfriendId: string) {
  const gf = await getGirlfriend(girlfriendId);
  
  // 用户请求："拍张全身照穿白色连衣裙"
  const result = await smartGenerate({
    prompt: userMessage,
    referenceImage: gf.portraitUrl,        // ← 关键：保持人脸
    mode: 'img2img',                       // ← 显式启用 img2img
    forceComposition: 'fullbody',          // ← 强制全身
  });
  
  // ✅ 人脸保持不变，只改变姿势和服装
  await saveGeneratedImage(result.images[0]);
  return result.images[0];
}
```

---

### **流程 3: 衣柜换装系统**

```typescript
async function tryOnOutfit(outfitId: string, girlId: string) {
  const girl = await getGirlfriend(girlId);
  const outfit = await getOutfit(outfitId);
  
  const result = await smartGenerate({
    prompt: `wearing ${outfit.name}, ${outfit.description}`,
    referenceImage: girl.latestPortrait,   // ← 作为基础参考
    mode: 'img2img',                       // ← 保持人脸
    forceComposition: 'portrait',
  });
  
  return {
    outfit,
    image: result.images[0],
    faceConsistency: result.ipAdapterUsed, // true
  };
}
```

---

## ⚠️ **常见问题与解决方案**

### **Q1: txt2img 仍然锁定了人脸？**

**原因：** 可能传入了 `referenceImage` 参数

**解决方案：**
```typescript
// ❌ 错误：传了 referenceImage 但没改 mode
await smartGenerate({
  prompt: 'random person',
  referenceImage: someImage,  // ← 这会导致 IP-Adapter 激活！
});

// ✅ 正确：完全不传 referenceImage
await smartGenerate({
  prompt: 'random person',
});
```

---

### **Q2: img2img 人脸还是不一样？**

**检查点：**
1. **Mode 是否正确？**
   ```typescript
   mode: 'img2img'  // 不是 'txt2img'!
   ```

2. **Denoise 强度是否过高？**
   ```typescript
   denoising_strength: 0.8  // ← 太高会丢失人脸特征
   // 建议范围：0.4~0.65
   ```

3. **IP-Adapter 权重是否过低？**
   ```typescript
   ip_adapter_weight: 0.9  // ← 提高权重（默认 0.7）
   ```

---

### **Q3: SDXL 模型如何使用？**

```typescript
import { smartGenerateSDXL } from '@/lib/smart-image-generation';

// SDXL 专用接口（自动设置 model_family='sdxl'）
const result = await smartGenerateSDXL({
  prompt: 'anime style character',
  referenceImage: baseImage,  // img2img 模式下启用 IP-Adapter
  mode: 'img2img',            // ← 必须为 img2img/hybrid
});
```

---

## 📊 **性能对比**

| 配置 | 生成时间 | 文件大小 | 人脸一致性 | 适用场景 |
|------|---------|---------|-----------|---------|
| **txt2img only** | ~20s | 标准 | N/A | 新建角色 |
| **img2img (no IP)** | ~20s | 标准 | ❌ 无 | 仅姿势调整 |
| **img2img+IP** | ~25s | 标准 | ✅ 100% | 换装/姿势库 |
| **hybrid+ControlNet** | ~35s | 较大 | ✅ 100% | 精确控制 |

---

## 🔄 **迁移指南**

### **从旧版本升级**

如果您之前使用的是：

```typescript
// 旧代码（总是启用 IP-Adapter）
await smartGenerate({
  prompt: 'smiling woman',
  characterImage: refImage,  // ← 总是锁定人脸
});
```

**新代码需要明确指定：**

```typescript
// 如果希望随机人脸 → txt2img 模式
await smartGenerate({
  prompt: 'smiling woman',
  mode: 'txt2img',  // ← 明确不传人脸
});

// 如果希望锁定人脸 → img2img 模式
await smartGenerate({
  prompt: 'smiling woman in new outfit',
  referenceImage: refImage,
  mode: 'img2img',  // ← 明确启用 img2img+IP-Adapter
});
```

---

## 💡 **最佳实践**

### **实践 1: 分离关注点**

- **创建阶段** → txt2img（快速试错）
- **确认阶段** → img2img（精细调整）
- **展示阶段** → hybrid（最终质量）

### **实践 2: 缓存策略**

```typescript
// 缓存基础肖像
const cachedBase = girlfriend.initialImage;

// 每次生成变体时使用 img2img
const variants = await Promise.all([
  smartGenerate({ prompt: 'in office', referenceImage: cachedBase, mode: 'img2img' }),
  smartGenerate({ prompt: 'at gym', referenceImage: cachedBase, mode: 'img2img' }),
  smartGenerate({ prompt: 'on vacation', referenceImage: cachedBase, mode: 'img2img' }),
]);
```

### **实践 3: 降级处理**

```typescript
try {
  await smartGenerate({
    prompt: 'smiling happily',
    referenceImage: weakNetworkImage,  // 可能不可用
    mode: 'img2img',
  });
} catch (error) {
  logger.warn('img2img failed, falling back to txt2img');
  await smartGenerate({
    prompt: 'smiling happily',
    mode: 'txt2img',  // 降级为随机生成
  });
}
```

---

## 🎨 **实战案例汇总**

| 功能模块 | 模式选择 | 参考图 | 说明 |
|---------|---------|--------|------|
| **首页推荐卡片** | txt2img | 无 | 随机多样化 |
| **个人资料页** | txt2img | 无 | 首次加载预览 |
| **创建向导第一步** | txt2img | 无 | 探索外貌选项 |
| **创建向导第三步** | img2img | ✓ | 确定最终外观 |
| **聊天发送照片** | img2img | ✓ | 保持角色一致 |
| **衣柜换装展示** | img2img | ✓ | 同一人多套装 |
| **生日特殊皮肤** | img2img | ✓ | 节日限定造型 |
| **粉丝投稿活动** | txt2img | 无 | 参与者多样性 |

---

## 📞 **技术支持**

遇到问题请检查：

1. **控制台日志** - 查看 `ipAdapterUsed` 字段
2. **RunPod Worker** - 确认 IP-Adapter 模型存在
3. **参考图格式** - 必须是 PNG/JPG
4. **网络状态** - 确保 `referenceImage` URL 可访问
