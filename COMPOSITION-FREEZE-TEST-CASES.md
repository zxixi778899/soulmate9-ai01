# Img2Img 构图自由 - 完整测试用例

## 📋 **测试目标**

验证修复后的 img2img 生成行为符合以下预期：
1. ✅ **文生图 (txt2img)** → 随机新面孔 + 新构图
2. ✅ **图生图换装** → 保持原图构图，只变服装
3. ✅ **全身照切换** → 可打破原始构图限制
4. ✅ **ID 一致性** → 人脸锁定但构图可自由变化

---

## 🧪 **测试场景对照表**

| ID | 场景 | Mode | input_image | ip_adapter_image | character_consistency | 预期构图 | 预期人脸 |
|----|------|------|-------------|------------------|---------------------|---------|---------|
| **T1** | 纯文生图（新建） | txt2img | ❌ 无 | ❌ 无 | false | 随机 | 随机 |
| **T2** | 换装 img2img | img2img | ✓ currentPhoto | ❌ 无 | false | 保持原图 | 保持原脸 |
| **T3** | 全身照扩展 | img2img | ✓ basePortrait | ❌ 无 | false | 改为全身 | 保持原脸 |
| **T4** | ID 批量生成 | img2img | ✓ basePortrait | ✓ faceRef | true | 按指定宽高 | 保持一致 |
| **T5** | 姿势改变 | img2img | ✓ poseRef | ❌ 无 | false | 可能变化 | 保持原脸 |
| **T6** | 背景替换 | img2img | ✓ bgRef | ❌ 无 | false | 可能变化 | 保持原脸 |

---

## 🔬 **详细测试步骤**

### **场景 T1: 纯文生图（新建角色）**

**配置:**
```typescript
{
  genMode: 'txt2img',
  width: 768,
  height: 1024,
  identityConsistencyActive: false,
  inputImage: '',
}
```

**API 参数 (generationBody):**
```json
{
  "action": "generate",
  "prompt": "young woman with long blonde hair, blue eyes, smile",
  "width": 768,
  "height": 1024,
  "input_image": undefined,
  "character_consistency": false
}
```

**预期结果:**
- ✅ 生成全新的随机面孔
- ✅ 使用指定宽高比 (3:4)
- ✅ 不包含任何参考图逻辑
- 📝 **验收标准**: 不同次生成得到完全不同的人物

---

### **场景 T2: 换装 img2img（保持构图）**

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../current-photo.jpg',  // 当前照片 URL
  denoise: 0.55,  // 保持构图
  identityConsistencyActive: false,
}
```

**提示词:**
```
wearing elegant evening dress, dinner date setting, soft lighting
```

**API 参数:**
```json
{
  "gen_mode": "img2img",
  "input_image": "https://.../current-photo.jpg",
  "denoise": 0.55,
  "character_consistency": false
}
```

**预期结果:**
- ✅ 构图比例与原图完全一致
- ✅ 只改变服装和场景细节
- ✅ 脸部特征保持不变
- 📝 **验收标准**: 新旧图片的人脸相似度 >90%，身体姿势基本不变

---

### **场景 T3: 全身照扩展（打破构图限制）** ⭐核心修复验证

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../base-portrait.jpg',  // 半身参考图
  width: 768,    // 全身比例
  height: 1024,
  denoise: 0.65,  // ✅ 提高 denoise 以允许构图变化
  identityConsistencyActive: false,
}
```

**提示词:**
```
full body shot, standing pose, entire outfit visible, from head to toe
```

**API 参数:**
```json
{
  "gen_mode": "img2img",
  "input_image": "https://.../base-portrait.jpg",
  "width": 768,
  "height": 1024,
  "denoise": 0.65,
  "character_consistency": false
}
```

**预期结果:**
- ✅ 生成全身照而非继承原图裁剪
- ✅ 脸部特征与原半身照一致
- ✅ 新增下半身内容合理
- 📝 **验收标准**: 
  - 脸部与原图匹配度 >85%
  - 包含完整腿部可见
  - 没有明显的裁剪痕迹

**关键修复点:**
- `input_image` 现在是纯 img2img 基础图
- 不会因为 `identityConsistencyActive=true` 而强制使用同一张图作为 IP-Adapter
- 构图的改变通过提高 `denoise=0.65` 来实现

---

### **场景 T4: ID 批量生成（人脸锁定）**

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../base-portrait.jpg',
  identityReferenceUrl: 'https://.../face-reference.jpg',
  character_consistency: true,
  identityConsistencyActive: true,
}
```

**批量任务示例:**
```typescript
const variations = [
  { prompt: 'office worker, business suit', width: 768, height: 1024 },
  { prompt: 'gym workout, athletic wear', width: 832, height: 1216 },
  { prompt: 'vacation beach, summer dress', width: 1024, height: 768 },
];
```

**API 参数 (每个 variation):**
```json
{
  "gen_mode": "img2img",
  "input_image": "https://.../base-portrait.jpg",
  "character_consistency": true,
  "reference_controls": {
    "enabled": true,
    "identityStrength": 0.82,
    "maxReferences": 4
  }
}
```

**预期结果:**
- ✅ 所有生成的图片脸部一致
- ✅ 每张图可以使用不同的宽高比
- ✅ 不受单一参考图构图限制
- 📝 **验收标准**: 
  - 三张图片的脸部可以识别为同一个人
  - 每张图的构图符合其指定的宽高比
  - 服装和场景与提示词匹配

---

### **场景 T5: 姿势改变（ControlNet）**

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../original-photo.jpg',
  controlImage: 'https://.../pose-reference.jpg',  // ControlNet 输入
  denoise: 0.6,
}
```

**API 参数:**
```json
{
  "gen_mode": "img2img",
  "input_image": "https://.../original-photo.jpg",
  "control_image": "https://.../pose-reference.jpg",
  "character_consistency": false,
  "enhancers": {
    "controlnet_strength": 0.7
  }
}
```

**预期结果:**
- ✅ 人物采用新的姿势
- ✅ 脸部保持一致性
- ✅ 身体动作流畅自然
- 📝 **验收标准**: 
  - 姿势与 ControlNet 参考图匹配
  - 脸部无明显扭曲
  - 衣物褶皱合理

---

### **场景 T6: 背景替换**

**配置:**
```typescript
{
  genMode: 'img2img',
  inputImage: 'https://.../original-background.jpg',
  denoise: 0.65,
}
```

**提示词:**
```
sunset at the beach, ocean waves in background, golden hour lighting
```

**API 参数:**
```json
{
  "gen_mode": "img2img",
  "input_image": "https://.../original-background.jpg",
  "denoise": 0.65
}
```

**预期结果:**
- ✅ 背景完全改变为新场景
- ✅ 主体人物清晰可见
- ✅ 光线与新世界观一致
- 📝 **验收标准**: 
  - 背景与人物融合自然
  - 没有明显的光影冲突
  - 人脸不受影响

---

## 🚨 **回归测试检查点**

修复后需要确保以下功能未受影响：

### **R1: Chat 发送照片**
```typescript
// src/app/api/chat/stream/route.ts
await smartGenerate({
  prompt: 'smiling happily',
  referenceImage: girlfriend.portraitUrl,  // ← 仍应工作
  mode: 'img2img',
});
```
✅ **预期**: 保持原有逻辑，仅改进后台 API 传递

### **R2: 创建向导**
```typescript
// src/components/CreateWizard.tsx
await generateGirlfriendPreview({
  portraitUrl: initialImage,
  composition: 'portrait',
});
```
✅ **预期**: 头像生成流程不受影响

### **R3: 衣柜系统**
```typescript
// src/components/WardrobeCarousel.tsx
await tryOnOutfit(outfitId, girlId);
```
✅ **预期**: 换装展示逻辑正常工作

---

## 📊 **测试结果记录模板**

```markdown
## 测试日期：[YYYY-MM-DD]
## 测试者：[Name]
## 环境：[Dev/Staging/Production]

### 核心场景测试
- [ ] T1 纯文生图 ✅/❌ 备注：
- [ ] T2 换装 img2img ✅/❌ 备注：
- [ ] T3 全身照扩展 ✅/❌ 备注：⭐关键修复验证
- [ ] T4 ID 批量生成 ✅/❌ 备注：
- [ ] T5 姿势改变 ✅/❌ 备注：
- [ ] T6 背景替换 ✅/❌ 备注：

### 回归测试
- [ ] R1 Chat 发送照片 ✅/❌ 备注：
- [ ] R2 创建向导 ✅/❌ 备注：
- [ ] R3 衣柜系统 ✅/❌ 备注：

### 问题记录
1. [问题描述]
   - 发现时间：
   - 影响范围：
   - 建议修复：
   
2. ...

### 总体评估
- 通过率：__/10
- 是否需要回滚：是/否
- 下一步行动：
```

---

## 🎯 **自动化测试建议**

将来可以考虑添加单元测试：

```typescript
// __tests__/composition-freeze.test.ts

describe('Img2Img Composition Freedom', () => {
  test('generationBody should not pass identityReferenceUrl as input_image', () => {
    const params = generationBody({
      genMode: 'img2img',
      inputImage: 'test-image.jpg',
      identityConsistencyActive: true,
      identityReferenceUrl: 'face-ref.jpg',
    });
    
    expect(params.input_image).toBe('test-image.jpg');
    expect(params.character_consistency).toBe(true);
    // 不再混用 identityReferenceUrl 在 input_image 中
  });
  
  test('high denoise enables composition change', () => {
    const fullBodyParams = generationBody({
      genMode: 'img2img',
      inputImage: 'base.jpg',
      width: 768,
      height: 1024,
      denoise: 0.65,
    });
    
    expect(fullBodyParams.denoise).toBe(0.65);
    // 高 denoise 应该允许构图变化
  });
});
```

---

## 💡 **调优建议**

如果测试中发现某些场景仍不理想，可以尝试以下调整：

### **1. 提高 Denoise 阈值**
```typescript
// 从 0.55 → 0.65 → 0.75 逐步尝试
denoise: 0.65,  // 推荐起始值
```

### **2. 减少 IP-Adapter 权重**
```typescript
ip_adapter_weight: 0.6,  // 默认 0.7，降低可减少构图影响
```

### **3. 缩短 IP-Adapter 影响范围**
```typescript
ip_adapter_start: 0.1,   // 默认 0.05，延后开始
ip_adapter_end: 0.7,     // 默认 0.85，提前结束
```

### **4. 使用专用参考图**
```typescript
// Base image 用于构图参考
input_image: 'base-photo.jpg';

// Face ref 仅用于人脸提取
ip_adapter_image: 'face-closeup.jpg';
```

---

## 📞 **问题排查清单**

如果遇到异常，按此顺序检查：

1. ✅ **确认修复已生效**
   ```bash
   # 查看文件最后修改时间
   stat src/app/\(main\)/admin/comfy/ComfyConsole.tsx
   
   # 确认代码包含注释
   grep -A 3 "img2img base image only" src/app/\(main\)/admin/comfy/ComfyConsole.tsx
   ```

2. ✅ **清理浏览器缓存**
   ```typescript
   // Hard refresh: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)
   ```

3. ✅ **检查控制台日志**
   ```javascript
   // 在运行前打印参数
   console.log('generationBody params:', generationBody());
   ```

4. ✅ **验证 RunPod Worker**
   ```bash
   # Docker logs
   docker logs | grep runpod
   ```

5. ✅ **测试直接 API 调用**
   ```bash
   curl -X POST http://localhost:5000/api/admin/comfy \
     -H "Content-Type: application/json" \
     -d '{"gen_mode":"img2img","input_image":"..."}'
   ```
