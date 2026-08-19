# 智能生图快速参考卡

## 🎯 **一句话总结**

- **txt2img (默认)** → 随机新面孔，不锁定人脸 ✅
- **img2img + 参考图** → 保持人脸一致性 ✅

---

## 🚀 **立即使用**

### **场景 1: 创建新人物（随机脸）**
```typescript
const result = await smartGenerate({
  prompt: 'blonde woman, blue eyes, smile',
  // mode: 'txt2img'  ← 可以不写（默认）
});
// ✅ 结果：全新的随机面孔
```

---

### **场景 2: 换装/改姿势（同人脸）**
```typescript
const result = await smartGenerate({
  prompt: 'wearing red dress at beach',
  referenceImage: basePortraitUrl,  ← 关键！
  mode: 'img2img',                  ← 显式启用 img2img
});
// ✅ 结果：同一人脸的新服装/姿势
```

---

### **场景 3: 批量生成变体**
```typescript
// 一键生成多张相同人物不同场景
await generateWithFaceConsistency(baseImage, [
  { description: 'in office', composition: 'portrait' },
  { description: 'at gym', composition: 'fullbody' },
]);
// ✅ 所有图片都是同一个人
```

---

## ⚠️ **常见错误**

| 错误 | 原因 | 解决 |
|------|------|------|
| txt2img 还是锁脸 | 传了 referenceImage | 删除该参数 |
| img2img 人脸变了 | mode 没设 img2img | 添加 `mode: 'img2img'` |
| SDXL 效果不好 | 用了 FLUX 参数 | 用 `smartGenerateSDXL()` |

---

## 📊 **API 对照表**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | string | ✅ | 提示词 |
| `referenceImage` | string | ❌ | 参考图 URL |
| `mode` | 'txt2img' \| 'img2img' \| 'hybrid' | ❌ | 默认 txt2img |
| `forceComposition` | enum | ❌ | 强制构图类型 |
| `negativePrompt` | string | ❌ | 负面提示词 |

---

## 💡 **最佳实践**

✅ **推荐：**
```typescript
// 1. 先 txt2img 探索外观
const preview = await smartGenerate({ prompt: 'random face' });

// 2. 确定后 img2img 精细化
const final = await smartGenerate({
  prompt: 'refined details',
  referenceImage: preview.images[0],
  mode: 'img2img',
});
```

❌ **避免：**
```typescript
// 误用：想要随机脸却传了 referenceImage
await smartGenerate({
  prompt: 'new person',
  referenceImage: oldImage,  ← 会锁定旧人脸！
});
```

---

## 🔧 **故障排查**

1. **检查日志中的 ipAdapterUsed**
   ```typescript
   console.log(result.ipAdapterUsed); // false = 随机，true = 锁定
   ```

2. **RunPod Worker 确认**
   - IP-Adapter 模型已安装？
   - ControlNet 可用？

3. **参考图格式**
   - PNG/JPG ✓
   - Base64 ✓
   - URL ✓

---

## 📁 **文件位置**

- 核心模块：[`src/lib/smart-image-generation.ts`](c:\Users\71489\soulmate9\src\lib\smart-image-generation.ts)
- 构图检测：[`src/lib/prompt-composition-detect.ts`](c:\Users\71489\soulmate9\src\lib\prompt-composition-detect.ts)
- 完整指南：[`SMART-IMAGE-MODE-GUIDE.md`](c:\Users\71489\soulmate9\SMART-IMAGE-MODE-GUIDE.md)

---

## 🆘 **需要帮助？**

遇到问题请提供：
1. 使用的 mode 参数
2. 是否传了 referenceImage
3. 日志中的 ipAdapterUsed 值
