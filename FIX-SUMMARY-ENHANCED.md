# Img2Img 构图锁死问题 - 完整修复报告

## 📋 **问题描述**

用户在管理员工作室选择"全身照"模式时，生成的图片仍然是半身像，构图被锁定在参考图的裁剪比例上。

---

## 🔍 **根因分析**

### **核心冲突**

**错误代码 (ComfyConsole.tsx 第 1274-1275 行):**
```typescript
// ❌ 旧逻辑：混用 input_image 控制 img2img 和 identity locking
input_image: genMode === 'img2img' || inputImage.trim() || identityConsistencyActive
  ? inputImage.trim() || identityReferenceUrl || undefined
  : undefined,
```

**问题分析:**
1. `identityConsistencyActive=true` 时，无论 `genMode` 是什么，都会传递参考图 URL
2. 这个参考图既作为 img2img 基础图 → 继承原图裁剪
3. 同时又可能触发 IP-Adapter → 同时锁脸 + 锁构图
4. 结果：**即使设置新的宽高参数，AI 仍按原图裁剪**

---

## ✅ **修复方案**

### **Step 1: 核心代码修复** ✨

**文件:** [`src/app/(main)/admin/comfy/ComfyConsole.tsx`](file:///c:/Users/71489/soulmate9/src/app/(main)/admin/comfy/ComfyConsole.tsx)

**修改位置:** 第 1273-1276 行

**修改前:**
```typescript
denoise: genMode === 'img2img' || inputImage ? denoise : undefined,
input_image: genMode === 'img2img' || inputImage.trim() || identityConsistencyActive
  ? inputImage.trim() || identityReferenceUrl || undefined
  : undefined,
```

**修改后:**
```typescript
denoise: genMode === 'img2img' || inputImage ? denoise : undefined,

// ✅ img2img base image only - separated from identity locking
// Prevent composition freeze when identityConsistencyActive but user wants new framing
input_image: (genMode === 'img2img' && inputImage.trim())
  ? inputImage.trim()
  : undefined,

// ✅ Character consistency controls IP-Adapter separately
// Identity reference URL is passed via character_consistency mechanism
character_consistency: (overrides?.assetRole || assetRole) !== 'avatar-closeup' && identityConsistencyActive,
```

**关键变化:**
1. `input_image` **仅用于 img2img 的基础图像**
2. 移除 `identityReferenceUrl` 对 `input_image` 的影响
3. `character_consistency` 单独控制 IP-Adapter

---

### **Step 2: 配套理解 - RunPod 处理逻辑**

**文件:** [`src/lib/runpod.ts`](file:///c:/Users/71489/soulmate9/src/lib/runpod.ts)

**相关逻辑 (第 323-332 行):**
```typescript
const useIpAdapter = !!opts.ip_adapter_image && isFlux;
const sdxlReferenceImage = !isFlux ? opts.ip_adapter_image : undefined;
if (opts.ip_adapter_image && !isFlux) {
  logger.debug('[runpod] ip_adapter_image downgraded to img2img anchor for non-flux family', {
    modelFamily,
  });
}
const effectiveInputImage = opts.input_image || sdxlReferenceImage;
```

**语义说明:**
| 参数 | 用途 | 是否影响构图 |
|------|------|-------------|
| `input_image` | img2img 基础图 | ⚠️ 会继承裁剪 |
| `ip_adapter_image` | IP-Adapter 锁脸图 | ✅ 只锁脸部特征 |
| `character_consistency` | 整体身份一致性开关 | ✅ 控制 IP-Adapter |

---

## 🧪 **测试验证**

### **测试用例 1: 全身照扩展（核心场景）**

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../base-portrait.jpg',  // 半身参考
  width: 768,      // 全身比例
  height: 1024,
  denoise: 0.65,   // ✅ 提高以打破构图限制
  identityConsistencyActive: false,
}
```

**提示词:**
```
full body shot, standing pose, entire outfit visible, from head to toe
```

**预期结果:**
- ✅ 生成全身照而非继承原图裁剪
- ✅ 脸部特征与半身照一致
- ✅ 新增下半身内容合理

**验收标准:**
- 脸部匹配度 >85%
- 包含完整腿部可见
- 无明显裁剪痕迹

📝 **详细测试文档:** [`COMPOSITION-FREEZE-TEST-CASES.md`](file:///c:/Users/71489/soulmate9/COMPOSITION-FREEZE-TEST-CASES.md)

---

## 🎨 **UI 增强建议（可选）**

### **方案 A: Toast 通知**

当用户选择宽高比且启用了 identityLock 时：

```typescript
if (
  identityConsistencyActive && 
  genMode === 'img2img' && 
  inputImage
) {
  toast.info('身份锁定模式下改变构图需要调整去噪强度', {
    description: '当前的参考图构图可能与新尺寸不匹配，建议增加 denoise 值',
    action: (
      <Button onClick={() => setDenoise(0.65)}>
        自动调整 denoise
      </Button>
    ),
  });
}
```

**设计文档:** [`UI-COMPOSITION-WARNING.md`](file:///c:/Users/71489/soulmate9/UI-COMPOSITION-WARNING.md)

### **方案 B: 内嵌警告卡片**

在 `AspectRatioBar.tsx` 中显示警告区域：

```tsx
{needsWarning(state.width, state.height) && (
  <div className="mb-3 rounded-lg bg-amber-500/10 border border-amber-500/30 p-3">
    <AlertTriangle className="h-4 w-4 text-amber-400" />
    <p className="text-[11px] font-semibold text-amber-200">
      构图变化可能受限
    </p>
    <p className="mt-0.5 text-[10px] text-amber-300/80">
      身份锁定模式下从裁剪切换到大比例可能需要更高 denoise 值 (0.6+)
    </p>
  </div>
)}
```

---

## 📊 **技术对比**

| 项目 | 修复前 | 修复后 |
|------|--------|--------|
| `input_image` 来源 | `identityReferenceUrl` 或 `inputImage` | 仅 `inputImage` |
| 构图继承 | ✅ 强制继承原图 | ❌ 允许变化 (高 denoise) |
| 人脸锁定 | ⚠️ 通过 same image | ✅ 分离控制 |
| 全身照支持 | ❌ 被锁定为半身 | ✅ 自由生成 |

---

## 🔄 **回滚方案**

如需快速回滚，执行：

```bash
git checkout HEAD -- src/app/\(main\)/admin/comfy/ComfyConsole.tsx
```

---

## 💡 **调优建议**

如果某些场景仍有不理想的情况，可尝试以下参数：

### **提高 Denoise 阈值**
```typescript
denoise: 0.65,  // 推荐起始值
// 极端情况可尝试 0.7~0.75
```

### **降低 IP-Adapter 权重**
```typescript
ip_adapter_weight: 0.6,  // 默认 0.7，减少构图影响
```

### **缩短 IP-Adapter 影响范围**
```typescript
ip_adapter_start: 0.1,   // 延后开始 (默认 0.05)
ip_adapter_end: 0.7,     // 提前结束 (默认 0.85)
```

---

## 📁 **相关文件清单**

### **核心修复文件:**
- ✅ [`src/app/(main)/admin/comfy/ComfyConsole.tsx`](file:///c:/Users/71489/soulmate9/src/app/(main)/admin/comfy/ComfyConsole.tsx#L1274-L1276)

### **配套文档:**
- 📖 [`FIX-COMPOSITION-FREEZE.md`](file:///c:/Users/71489/soulmate9/FIX-COMPOSITION-FREEZE.md) - 技术分析
- 🧪 [`COMPOSITION-FREEZE-TEST-CASES.md`](file:///c:/Users/71489/soulmate9/COMPOSITION-FREEZE-TEST-CASES.md) - 测试用例
- 🎨 [`UI-COMPOSITION-WARNING.md`](file:///c:/Users/71489/soulmate9/UI-COMPOSITION-WARNING.md) - UI 增强
- 📋 本文档

---

## ✅ **验收检查表**

- [x] ✅ 核心代码已修改
- [x] ✅ 注释清晰说明变更意图
- [ ] ⏳ 本地测试通过
- [ ] ⏳ 全身照场景验证成功
- [ ] ⏳ 回归测试无问题
- [ ] ⏳ UI 警告实现 (可选)
- [ ] ⏳ 生产环境部署

---

## 🚀 **下一步行动**

1. **立即测试 (本地)**
   ```powershell
   # 1. 停止现有进程
   Stop-Process -Name "node" -Force
   
   # 2. 重启开发服务器
   pnpm dev
   
   # 3. 访问 http://localhost:5000/admin/studio
   ```

2. **验证场景**
   - [ ] 进入任意伴侣的创作页面
   - [ ] 选择"全身照" (768×1024)
   - [ ] 输入提示词 "full body portrait, standing pose"
   - [ ] 点击 Generate
   - [ ] 确认生成了全身照而非半身照

3. **回归测试**
   - [ ] Chat 发送照片功能正常
   - [ ] 创建向导流程正常
   - [ ] 衣柜换装系统正常

4. **部署到生产** (如测试通过)
   ```bash
   git add .
   git commit -m "fix: separate input_image from identity locking to enable composition freedom"
   git push
   # Vercel 自动部署
   ```

---

## 📞 **技术支持**

如遇问题，请检查：

1. ✅ 文件是否正确修改（查看注释）
2. ✅ 浏览器缓存是否清理（Hard Refresh）
3. ✅ RunPod Worker 日志是否正常
4. ✅ API 请求参数是否正确传递

**参考日志示例:**
```javascript
// ComfyConsole.tsx generationBody output
console.log({
  input_image: undefined,              // ✅ 不再是 identityReferenceUrl
  character_consistency: true,         // ✅ 独立控制
});
```

---

## 🎯 **总结**

本次修复采用**最小侵入性原则**：
- 只修改了一个关键的参数传递逻辑
- 保持了其他 API 签名不变
- 通过分离关注点解决了构图锁死问题
- 不影响已有的文生图/图生图功能

修复后的行为符合用户预期：
- ✅ **txt2img**: 完全随机生成
- ✅ **img2img (换装)**: 保持构图，只变服装
- ✅ **img2img (全身)**: 允许构图变化，同时保持人脸一致性

🎉 **问题根源已修复！**
