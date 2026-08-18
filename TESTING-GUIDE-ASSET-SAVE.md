# 🧪 Img2Img 资产保存与 IP-Adapter 一致性测试指南

## ✅ **已实施的修复**

### **修复 A: finalizeAssets 不再吞掉错误** ⚠️ Critical
- ✅ 修改返回类型从 `Promise<Any[] | null>` → `Promise<Any[]>`
- ✅ 所有错误都会抛出，便于调试
- ✅ 添加详细的 logger.error 日志

### **修复 B: Batch Generation 启用 IP-Adapter** ✨
- ✅ 根据 `preset.referenceRole` 动态查找参考图
- ✅ 仅在需要且存在参考图时传递 `input_image`
- ✅ 显式传递 `ip_adapter_image` 给 RunPod API

### **修复 C: 改进轮询逻辑的错误处理** 🛡️
- ✅ 优先使用 API 返回的 assets（如果有）
- ✅ finalize 失败时记录警告但继续执行其他任务
- ✅ 明确的错误消息

---

## 🎯 **测试场景对照表**

| ID | 场景 | 预期行为 | 验收标准 |
|----|------|---------|---------|
| **T1** | 批量生成 - 立绘 | ✅ 图片保存到数据库 | Toast 成功 + Assets 刷新 |
| **T2** | 换装 img2img | ✅ 保持人脸一致性 | 脸部与原头像匹配 >85% |
| **T3** | 姿势改变 | ✅ 打破构图限制 | 全身照而非继承半身裁剪 |
| **T4** | 背景替换 | ✅ 新背景合理融合 | 光线一致、无明显接缝 |
| **T5** | 缺失参考图 | ✅ 降级为 txt2img | 不报错，生成随机图 |
| **T6** | finalize 失败 | ✅ 记录警告继续 | Toast 警告 + 控制台日志 |

---

## 📝 **详细测试步骤**

### **T1: 批量生成 - 立绘（资产保存验证）**

**前提条件:**
- 已有伴侣账号 (girlfriend_id)
- 至少有一个半身头像资产

**步骤:**
1. 访问 http://localhost:5000/admin/studio
2. 选择目标伴侣
3. 切换到 "角色生产" tab
4. 点击 "立绘" preset
5. 配置参数:
   - Width: 768
   - Height: 1024
   - GenMode: auto (should be img2img if reference exists)
6. 点击 "Generate"

**预期结果:**
```
✅ Toast: "角色生产包完成：共生成 X 项资产"
✅ Assets 列表自动刷新
✅ 新图片出现在资源库
✅ Database entry: generation_assets table updated
✅ Console: No errors, see logs with [finalizeAssets] success
```

**检查方法:**
```sql
-- Supabase SQL Editor
SELECT url, meta->>'asset_role' as role, created_at 
FROM generation_assets 
WHERE girlfriend_id = 'YOUR_ID' 
ORDER BY created_at DESC LIMIT 5;
```

---

### **T2: 换装 img2img（人脸一致性验证）**

**前提条件:**
- 上传一张清晰的半身头像作为参考
- `identity_consistency=true`

**步骤:**
1. 在工作台左侧切换任务类型 → "换装"
2. 确认 Identity Reference 已加载
3. 宽高比选择 3:4 (832×1216)
4. 提示词："wearing elegant evening dress, dinner date setting"
5. Denoise: 0.55
6. 点击 Generate

**API 参数验证:**
```json
{
  "input_image": "https://.../face-reference.jpg",  // ✓ NOT undefined
  "character_consistency": true,                    // ✓
  "ip_adapter_image": "https://.../face-reference.jpg" // ✓ EXPLICIT
}
```

**预期结果:**
```
✅ 脸部与原头像高度一致（>85%）
✅ 服装按要求改变
✅ 身体姿势基本不变
✅ 光线与环境自然融合
```

**对比方法:**
- 打开原头像和新生成的换装图
- 并排对比眼部特征、发型、肤色
- 评估相似度

---

### **T3: 姿势改变（构图自由验证）**⭐ **核心修复**

**前提条件:**
- 半身头像作为参考
- `identityConsistencyActive=true`

**步骤:**
1. 切换到 "姿势" tab
2. 宽高比选择 **3:4 (768×1024)** ← 注意尺寸
3. 提示词："standing full body pose, wearing casual outfit"
4. Denoise: **0.65** ← **提高以打破构图限制**
5. 点击 Generate

**关键配置:**
```typescript
{
  width: 768,
  height: 1024,
  denoise: 0.65,  // ↑ Higher than default 0.55
  input_image: identityImageUrl,  // ✓ NOT undefined
  character_consistency: true,
}
```

**预期结果:**
```
✅ 生成全身照（包含完整腿部）
✅ 脸部保持一致性
✅ 下半身延伸合理
✅ 无明显裁剪痕迹或重复图案
```

**验收标准:**
- 画面包含从头顶到脚底的完整人物
- 双足完全可见
- 脸部特征与参考图一致

---

### **T4: 背景替换（环境融合验证）**

**步骤:**
1. 切换到 "背景" tab
2. 提示词："sunset at the beach, ocean waves in background, golden hour lighting"
3. Denoise: 0.65

**预期结果:**
```
✅ 背景完全改变为新场景
✅ 主体人物清晰可见
✅ 光线与新世界观一致（夕阳暖色调）
✅ 没有明显的光影冲突
```

---

### **T5: 缺失参考图（降级测试）**

**前提条件:**
- 清除或跳过上传参考图
- `identity_consistency=false`

**步骤:**
1. 切换任何任务类型
2. 确保没有显示 Identity Reference
3. 点击 Generate

**预期结果:**
```
✅ 不报错
✅ 降级为纯文生图模式 (txt2img)
✅ 生成随机面孔的新图片
✅ Console: "input_image is undefined - using txt2img mode"
```

---

### **T6: finalize 失败容忍度（健壮性测试）**

**模拟方法:**
```bash
# 临时修改 API 路径使其指向错误的端点
# /api/admin/comfy → /api/fake-endpoint
```

**预期结果:**
```
✅ Toast: "Finalize failed, continuing without DB update"
✅ 当前任务跳过，但不阻塞后续任务
✅ Console: Warning level log with details
✅ UI 仍显示"部分成功"
```

---

## 🔍 **调试技巧**

### **1. 检查运行时参数**

在浏览器 Console 添加调试:

```javascript
// 临时 monkey-patch 查看参数
const originalFetch = window.authedFetch;
window.debugParams = () => {
  window.authedFetch = async (...args) => {
    const [url, options] = args;
    if (url.includes('/api/admin/comfy') && options?.body) {
      const body = JSON.parse(options.body);
      console.log('🔍 API Request:', {
        url,
        action: body.action,
        input_image: body.input_image?.substring(0, 50) + '...',
        ip_adapter_image: body.ip_adapter_image?.substring(0, 50) + '...',
        character_consistency: body.character_consistency,
        width: body.width,
        height: body.height,
      });
    }
    return originalFetch.call(this, ...args);
  };
};
window.debugParams();
```

### **2. 检查 RunPod Job 状态**

```bash
# 获取最新 job_id
grep -r "job_id" .vercel/output/json/*.json

# 查询状态
curl -X GET \
  "http://localhost:5000/api/runpod/status?job_id={YOUR_JOB_ID}&admin_source=true" \
  -H "Authorization: Bearer {SESSION_TOKEN}" | jq
```

### **3. 数据库实时监听**

```sql
-- 监听 generation_assets 表变化
LISTEN generation_assets_changes;

NOTIFY generation_assets_changes;

SELECT * FROM generation_assets 
WHERE girlfriend_id = 'YOUR_ID' 
ORDER BY created_at DESC LIMIT 10;
```

---

## 📊 **测试结果记录模板**

```markdown
## 测试日期：[YYYY-MM-DD]
## 测试者：[Name]
## 环境：[Dev/Staging/Production]

### 核心功能测试
- [ ] T1 批量生成资产保存 ✅/❌ 备注：
- [ ] T2 换装人脸一致性 ✅/❌ 备注：
- [ ] T3 全身照构图自由 ✅/❌ 备注：⭐关键修复
- [ ] T4 背景环境融合 ✅/❌ 备注：
- [ ] T5 降级为 txt2img ✅/❌ 备注：
- [ ] T6 finalize 容错 ✅/❌ 备注：

### 性能指标
- GPU 排队时间：__秒
- 单图生成时间：__秒
- DB 插入延迟：__ms
- Frontend refresh: __ms

### 问题记录
1. [问题描述]
   - 发现时间：
   - 复现步骤：
   - 影响范围：
   - 建议修复：
   
2. ...

### 总体评估
- 通过率：__/6
- 是否需要回滚：是/否
- 下一步行动：
```

---

## 🚀 **快速启动测试套件**

```powershell
# 1. 确保开发服务器运行
cd c:\Users\71489\soulmate9
pnpm dev

# 2. 访问管理面板
Start-Process "http://localhost:5000/admin/studio"

# 3. 准备测试数据
# - 选择已有伴侣
# - 确认有头像参考图

# 4. 依次执行测试用例
# - T1 先跑一遍批量生成
# - T2-T4 分别测试不同任务类型
# - T5 模拟无参考图场景
# - T6 (可选) 测试容错性
```

---

## 💡 **常见问题排查**

### **Q1: 生成的图片仍为半身像？**

**检查清单:**
- [ ] `denoise ≥ 0.6`？
- [ ] 宽高比为 768×1024？
- [ ] `input_image` 非空？
- [ ] 提示词包含 "full body"？

**解决方案:**
```typescript
// 手动调整 denoise
setDenoise(0.65);

// 确认宽高比
setWidth(768);
setHeight(1024);
```

---

### **Q2: 脸部一致性差？**

**检查清单:**
- [ ] 参考图清晰度 >512px？
- [ ] `ip_adapter_weight ≥ 0.7`？
- [ ] `denoise ≤ 0.6`？
- [ ] 参考图为正面照？

**解决方案:**
```typescript
// 提高 IP-Adapter 权重
// 在 generationBody 中
ip_adapter_weight: 0.8,  // 默认 0.7
ip_adapter_start: 0.05,  // 延后开始
ip_adapter_end: 0.85,    // 提前结束
```

---

### **Q3: Toast 显示失败但没有具体错误？**

**检查清单:**
- [ ] Network tab 的 POST 请求响应
- [ ] Server logs (`docker logs`)
- [ ] Browser Console 的 Logger 输出

**解决方案:**
```javascript
// 查看详细错误
console.log(lastGenerationTrace);
```

---

## 🎯 **总结**

本次测试重点验证三个修复点：

1. ✅ **资产保存** - finalizeAssets 不再吞错误
2. ✅ **IP-Adapter** - 正确启用人脸一致性  
3. ✅ **构图自由** - 全身照可打破裁剪限制

请按顺序执行测试用例，并记录结果！🎉
