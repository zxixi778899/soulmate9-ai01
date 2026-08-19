# Img2Img 构图锁死问题修复

## 🔍 **问题分析**

### **症状**
用户在工作台选择"全身照" (full body)，但生成的图片仍然是半身像。

### **根本原因**

在 `ComfyConsole.tsx` 第 1274-1275 行：

```typescript
input_image: genMode === 'img2img' || inputImage.trim() || identityConsistencyActive
  ? inputImage.trim() || identityReferenceUrl || undefined
  : undefined,
```

当 `identityConsistencyActive === true` 时：
1. `input_image` 被设置为参考图的 URL
2. 该图既作为 img2img 的基础图像
3. 同时可能触发 IP-Adapter 的脸部锁定

**结果：**
- IP-Adapter 锁定了原始图像的构图比例
- 即使修改了宽高参数，生成过程仍受限于参考图的构图
- 画面裁剪位置无法改变

---

## ✅ **解决方案**

### **方案 1: 分离输入图像和 IP-Adapter（推荐）**

确保 IP-Adapter 只在真正需要脸部一致性时才启用：

**ComfyConsole.tsx 第 1274-1287 行修改：**

```typescript
input_image: genMode === 'img2img' 
  ? inputImage.trim() || undefined  // ← img2img 模式才传
  : undefined,

character_consistency: assetRole !== 'avatar-closeup' && identityConsistencyActive,
reference_controls: {
  enabled: assetRole !== 'avatar-closeup' && identityConsistencyActive,
  // ... other options
},

// ✨ NEW: 显式控制 ip_adapter_image
ip_adapter_image: identityConsistencyActive && identityReferenceUrl
  ? identityReferenceUrl  // ← 仅在需要 ID 锁脸时启用
  : undefined,
```

**运行 Pod 中的逻辑 (`src/lib/runpod.ts`)：**

```typescript
// 当前代码 (正确)
const useIpAdapter = !!opts.ip_adapter_image && isFlux;
const effectiveInputImage = opts.input_image || sdxlReferenceImage;
```

**解释：**
- `input_image` - 仅用于 img2img 的基础图像
- `ip_adapter_image` - 仅用于脸部特征提取
- 两者应该独立控制，不能混用同一张图

---

### **方案 2: 禁用 identityConsistency 时的构图自由**

在 `ComfyConsole.tsx` 添加状态管理：

```typescript
const [compositionFreeze, setCompositionFreeze] = useState(true);

// 当用户手动调整宽高比时
const onAspectRatioChange = (width: number, height: number) => {
  setWidth(width);
  setHeight(height);
  
  // 如果启用了 compositionFreeze，则暂时禁用 identityConsistency
  if (compositionFreeze && genMode === 'img2img') {
    toast.info('构图自由度已开启，临时禁用了脸部锁定');
    setIdentityConsistency(false);
  }
};
```

---

### **方案 3: 提高 Denoise 强度以打破构图限制**

在 img2img 模式下增加 denoise 强度：

```typescript
// 默认 denoise 从 0.55 提高到 0.65-0.7
const denoiseForCompositionChange = genMode === 'img2img' && width !== originalWidth
  ? 0.65  // 更高的去噪强度允许构图变化
  : 0.55;
```

---

## 📝 **具体修改步骤**

### **Step 1: 修复参数传递逻辑**

编辑文件：`src/app/(main)/admin/comfy/ComfyConsole.tsx`

定位到 **第 1274-1288 行**，将：

```typescript
denoise: genMode === 'img2img' || inputImage ? denoise : undefined,
input_image: genMode === 'img2img' || inputImage.trim() || identityConsistencyActive
  ? inputImage.trim() || identityReferenceUrl || undefined
  : undefined,
character_consistency: (overrides?.assetRole || assetRole) !== 'avatar-closeup' && identityConsistencyActive,
```

改为：

```typescript
// ✅ 明确区分三种场景
denoise: genMode === 'img2img' || inputImage ? denoise : undefined,

// ✅ input_image ONLY for img2img base
input_image: genMode === 'img2img' 
  ? inputImage.trim() 
  : undefined,

// ✅ character_consistency controls IP-Adapter separately  
character_consistency: (overrides?.assetRole || assetRole) !== 'avatar-closeup' && identityConsistencyActive,

// ✅ NEW: Explicitly pass identity reference only when needed
...(identityConsistencyActive && identityReferenceUrl && {
  identity_reference: identityReferenceUrl,
}),
```

---

### **Step 2: 更新 RunPod 处理逻辑**

编辑文件：`src/lib/runpod.ts`

找到 IP-Adapter 相关代码，确保清晰的语义：

```typescript
// Current line 323
const useIpAdapter = !!opts.ip_adapter_image && isFlux;

// Add debug logging
if (useIpAdapter && opts.identity_reference) {
  logger.debug('[runpod] Using IP-Adapter with explicit identity reference', {
    identity_reference: opts.identity_reference,
  });
}
```

---

### **Step 3: 添加 UI 提示**

在 `AspectRatioBar.tsx` 中添加警告：

```typescript
const onSelectComposition = () => {
  if (identityConsistencyActive && genMode === 'img2img') {
    toast.warning(
      '身份锁定模式下，改变构图可能需要更高 denoise (0.65+)',
      {
        action: (
          <Button size="sm" onClick={() => setDenoise(0.65)}>
            自动调整 denoise
          </Button>
        ),
      }
    );
  }
};
```

---

## 🧪 **测试验证**

### **测试场景**

1. **纯文生图 (txt2img)**
   - 不传 `input_image`
   - 不传 `ip_adapter_image`
   - ✅ 应随机生成新面孔，新构图

2. **图生图换装 (img2img outfit)**
   - 传 `input_image` = currentPhoto
   - 不传 `ip_adapter_image`
   - ✅ 应保持原图构图，只变服装

3. **ID 一致性多姿势 (character consistency)**
   - 传 `input_image` = basePortrait
   - 传 `ip_adapter_image` = faceReference
   - ✅ 应保持人脸，可改变构图

4. **全局身份锁定 (identity lock)**
   - 传 `input_image` = identityReferenceUrl
   - `character_consistency` = true
   - ✅ 这会导致构图限制 → 需要明确告知用户

---

## 📊 **预期效果**

| 场景 | 旧行为 | 新行为 |
|------|--------|--------|
| 选全身 + identityLock | ❌ 保持半身（构图锁死） | ✅ 全身照（构图自由） |
| 换装 img2img | ⚠️ 保持构图 | ✅ 保持构图（预期） |
| 新建 txt2img | ✅ 无影响 | ✅ 无影响 |
| ID 一致性批量生成 | ⚠️ 所有图半身 | ✅ 按宽高比生成 |

---

## 🔄 **回滚方案**

如果发现新问题，可以快速回滚：

```bash
git checkout HEAD -- src/app/\(main\)/admin/comfy/ComfyConsole.tsx
git checkout HEAD -- src/lib/runpod.ts
```

---

## 💡 **长期优化建议**

1. **添加构图预设库**
   - 预定义不同用途的最佳宽高比
   - 一键切换到全身/半身/特写模式

2. **智能 denoise 推荐**
   - 根据构图变化幅度自动调整
   - 半身→全身：denoise 0.65
   - 全身→半身：denoise 0.55

3. **双参考图系统**
   - Base Image: img2img 基础图
   - Face Reference: IP-Adapter 锁脸图
   - 用户可以分别上传两张图
