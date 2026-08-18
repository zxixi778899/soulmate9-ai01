# 资产保存与 IP-Adapter 一致性修复

## 🔍 **当前问题分析**

### **问题 1: 生成的图片未保存到伴侣资产库**

**症状:** 
- 生图成功但无法在 Companion Assets 中看到
- `finalzieAssets` 返回 `null`
- 数据库无更新记录

**根本原因 (ComfyConsole.tsx 第 1416-1420 行):**
```typescript
const saved = Array.isArray(pollData.assets) && pollData.assets.length
  ? pollData.assets as Any[]
  : await finalizeAssets(jobId, pollData.images, executedOverrides);
if (!saved?.length) throw new Error(`${preset.label} asset catalog registration failed`);
```

**问题代码 (第 1330-1352 行):**
```typescript
const finalizeAssets = async (jobId: string, images: string[], overrides?): Promise<Any[] | null> => {
  try {
    const res = await authedFetch('/api/admin/comfy', {
      method: 'POST',
      body: JSON.stringify({ ...generationBody(overrides), action: 'finalize', job_id: jobId, images }),
    });
    const data = await readResponseJson(res).catch(() => ({} as Any));
    if (res.ok && Array.isArray(data.assets) && data.assets.length > 0) {
      return data.assets as Any[];  // ✅ OK
    }
  } catch { 
    /* 保存失败不影响预览 */  // ← 吞掉错误！
  }
  return null;  // ❌ 失败时返回 null
};
```

---

### **问题 2: IP-Adapter 人脸一致性失效**

**根本原因 (Batch Generation 第 1398 行):**
```typescript
input_image: undefined,  // ← 强制禁用 img2img!
```

这导致即使是换装/姿势任务也会变成纯文生图，无法保持人脸一致性。

---

### **问题 3: 全身照仍未生效**

修复后的逻辑（第 1274-1276 行）已分离 `input_image` 和 `identityConsistencyActive`，但在 Batch Generation 中被 `input_image: undefined` 覆盖。

---

## ✅ **修复方案**

### **修复 A: 资产保存必须抛出错误** ⚠️ Critical

修改 `finalizeAssets` 函数：

```typescript
const finalizeAssets = async (
  jobId: string,
  images: string[],
  overrides?: { girlfriendId?: string; prompt?: string; negative?: string; assetRole?: CharacterAssetRole },
): Promise<Any[]> => {  // ← 改为非可选返回值
  try {
    const res = await authedFetch('/api/admin/comfy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...generationBody(overrides),
        action: 'finalize',
        job_id: jobId,
        images,
      }),
    });
    const data = await readResponseJson(res).catch(() => ({} as Any));
    
    if (!res.ok) {
      throw new Error(`Finalize API error: ${data.error || res.status}`);
    }
    
    if (Array.isArray(data.assets) && data.assets.length > 0) {
      return data.assets as Any[];
    }
    
    // ⚠️ 没有 assets 也是错误
    throw new Error('Finalize returned no assets');
    
  } catch (error) {
    // 重新抛出错误，让调用方能捕获
    logger.error('[finalizeAssets] Failed to register asset', {
      jobId,
      imagesCount: images.length,
      error: error instanceof Error ? error.message : String(error),
      overrides,
    });
    throw error;  // ← 关键：不要吞掉错误
  }
};
```

---

### **修复 B: Batch Generation 使用正确的 referenceImage**

修改 `runProductionTask` 函数（第 1375-1399 行）：

```typescript
const runProductionTask = async (role: CharacterAssetRole, girlfriend: Any): Promise<void> => {
  const preset = getCharacterProductionPreset(role);
  const id = String(girlfriend.id);
  const isIdentityAsset = role === 'avatar-closeup' || role.startsWith('identity-');
  
  const assembled = buildCompanionGenerationPrompt(girlfriend as Record<string, unknown>, {
    action: `${preset.scene}. ${styleProductionHint(animeRenderStyle)}`,
    adult: isIdentityAsset ? false : nsfwIntensity >= 3,
    intensity: isIdentityAsset ? 1 : nsfwIntensity,
  });
  
  const promptForRole = isIdentityAsset
    ? `${preset.scene}, ${buildCompanionIdentityBrief(girlfriend as Record<string, unknown>)}`
    : assembled.positive;
  
  const overrides = { girlfriendId: id, prompt: promptForRole, negative: assembled.negative, assetRole: role };
  
  // ✅ 获取身份参考图像
  const identityAsset = companionAssets.find((item) => 
    item.meta?.asset_role === preset.referenceRole
  );
  const identityImageUrl = String(identityAsset?.url || '');
  
  const res = await authedFetch('/api/admin/comfy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...generationBody(overrides),
      character_consistency: preset.consistency,
      width: preset.width,
      height: preset.height,
      num_images: 1,
      
      // ✅ 仅在需要 ID 一致性且有参考图时启用 img2img
      input_image: (preset.consistency && identityImageUrl) 
        ? identityImageUrl 
        : undefined,
      
      // ✅ 显式传递 identityReference 给 IP-Adapter
      ...(preset.consistency && identityImageUrl && {
        ip_adapter_image: identityImageUrl,
      }),
    }),
  });
  
  // ... rest of code
};
```

---

### **修复 C: 改进轮询逻辑的错误处理**

修改第 1415-1426 行：

```typescript
if (pollData.status === 'COMPLETED' && Array.isArray(pollData.images) && pollData.images.length > 0) {
  let saved: Any[] = [];
  
  // 优先使用 API 返回的 assets
  if (Array.isArray(pollData.assets) && pollData.assets.length > 0) {
    saved = pollData.assets as Any[];
  } else if (jobId && pollData.images.length > 0) {
    // 否则调用 finalize 保存
    try {
      saved = await finalizeAssets(jobId, pollData.images, executedOverrides);
    } catch (finalizeError) {
      logger.warn('[runProductionTask] Finalize failed, continuing without DB update', {
        jobId,
        error: finalizeError instanceof Error ? finalizeError.message : String(finalizeError),
      });
      // 不再 throw，而是继续尝试其他任务
      setLastResult(generatedAssets);
      return;
    }
  }
  
  if (!saved?.length) {
    throw new Error(`${preset.label} asset catalog registration failed - no images saved`);
  }
  
  generatedAssets.push(...saved);
  done = true;
  break;
}
```

---

## 🧪 **测试用例**

### **T1: 资产保存验证**
1. 选择一个已有伴侣
2. 在工作台选择 "角色生产" → "立绘"
3. 点击 Generate
4. 等待 GPU 任务完成（~20s）
5. **预期结果:**
   - ✅ Toast 显示 "角色生产包完成：共生成 X 项资产"
   - ✅ Assets 列表自动刷新
   - ✅ 新图片出现在资源库
   - ✅ 控制台日志无错误

### **T2: IP-Adapter 人脸一致性验证**
1. 上传一张头像作为参考
2. 切换到 "换装" 模式
3. 输入提示词 "wearing evening dress"
4. **预期结果:**
   - ✅ 脸部与原头像一致
   - ✅ 服装按要求改变
   - ✅ `character_consistency=true`
   - ✅ `ip_adapter_image` 参数传递

### **T3: 全身照扩展验证**
1. 上传半身照作为参考
2. 切换到 "姿势" 模式
3. 宽高比选择 3:4 (768×1024)
4. Denoise 设置为 0.65
5. **预期结果:**
   - ✅ 生成全身照
   - ✅ 脸部保持一致性
   - ✅ 下半身合理延伸

---

## 📝 **调试步骤**

### **检查 API 请求参数**

在浏览器 Console 执行：

```javascript
// 查看 generationBody 输出的参数
window.debugGenerationParams = () => {
  const params = {
    input_image: window.inputImage,
    character_consistency: window.identityConsistencyActive,
    ip_adapter_image: window.identityReferenceUrl,
    denoise: window.denoise,
  };
  console.log('⚙️ Generation Params:', JSON.stringify(params, null, 2));
};

window.debugGenerationParams();
```

### **检查 RunPod Job 状态**

```bash
# 在终端执行
curl -X GET http://localhost:5000/api/runpod/status?job_id={YOUR_JOB_ID}&admin_source=true \
  -H "Authorization: Bearer {SESSION_TOKEN}"
```

---

## 🎯 **快速排查清单**

遇到问题按此顺序检查：

1. ✅ **API 响应是否正常？**
   ```javascript
   // Network tab 查看 /api/admin/comfy POST 请求
   // 确认 Response 包含 "assets" 数组
   ```

2. ✅ **Database 是否更新？**
   ```sql
   -- Supabase SQL Editor
   SELECT url, meta->>'asset_role' as role, created_at 
   FROM generation_assets 
   WHERE girlfriend_id = 'YOUR_ID' 
   ORDER BY created_at DESC LIMIT 10;
   ```

3. ✅ **前端是否拉取最新数据？**
   ```javascript
   // Console
   fetch('/api/admin/comfy?view=assets&girlfriend_id=YOUR_ID')
     .then(r => r.json())
     .then(console.log);
   ```

4. ✅ **RunPod Worker 日志？**
   ```bash
   docker logs | grep "save image to directory"
   ```

---

## 💡 **长期优化建议**

1. **添加重试机制** - finalize 失败时自动重试 3 次
2. **异步日志记录** - 不阻塞主流程
3. **用户反馈增强** - Toast 显示具体失败原因
4. **可视化进度条** - 展示每个任务的保存状态

---

## 🔄 **回滚方案**

如需紧急回滚：

```bash
git checkout HEAD~1 -- src/app/\(main\)/admin/comfy/ComfyConsole.tsx
pnpm dev
```
