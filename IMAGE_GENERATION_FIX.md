# 🔧 生图失败问题修复报告

## ❌ 原始错误

```
ERROR [Chat Generate] Failed to load girlfriend 
{
  "userId": "8c5f8edb-cfcd-406c-9dc6-b01400a5e042",
  "girlfriendId": "4fefbce2-9e55-4998-a283-f1dd4fb42a4e",
  "error": "column girlfriends.visual_style does not exist"
}
```

**HTTP 状态码**: 404 (Not Found)

---

## ✅ 修复内容

### 问题原因
`/api/chat/generate-image` 路由查询了 `girlfriends` 表中不存在的列 `visual_style`。

### 修复方案
将查询的列从 `visual_style` 改为实际存在的列，并使用默认值。

### 修改的文件

**文件**: `src/app/api/chat/generate-image/route.ts`

**修改点 1** (第 77 行 - 数据库查询):
```typescript
// ❌ 修改前
.select('face_reference_url, portrait_url, gender, visual_style, nsfw_allowed, name')

// ✅ 修改后  
.select('face_reference_url, portrait_url, gender, name, appearance_prompt, nsfw_allowed')
```

**修改点 2** (第 125 行 - Prompt 构建):
```typescript
// ❌ 修改前
const visualStyle = String((gfRow as Record<string, unknown>).visual_style || 'realistic');
const basePrompt = `professional portrait photo of ${name}, ${visualStyle} style, studio lighting`;

// ✅ 修改后
const appearancePrompt = String((gfRow as Record<string, unknown>).appearance_prompt || '');
const basePrompt = `professional portrait photo of ${name}, realistic style, studio lighting${appearancePrompt ? ', ' + appearancePrompt : ''}`;
```

**修改点 3** (第 138 行 - 渲染样式):
```typescript
// ❌ 修改前
const renderStyle = String((gfRow as Record<string, unknown>).visual_style || 'realistic').toLowerCase();

// ✅ 修改后
const renderStyle = 'realistic'; // Default to realistic for chat generation
```

---

## 🧪 验证测试

### Step 1: 重启开发服务器
```bash
# 在终端按 Ctrl+C 停止当前服务器
# 然后重新启动
pnpm dev
```

### Step 2: 测试生成功能
1. 打开预览浏览器 (http://localhost:5000)
2. 登录账号
3. 进入 Gallery → 选择一个女友 → Chat
4. 点击生成图片按钮
5. 观察控制台日志

### 预期结果

**成功日志**:
```
[Chat Generate] Starting generation {
  userId: '8c5f8edb-cfcd-406c-9dc6-b01400a5e042',
  girlfriendId: '4fefbce2-9e55-4998-a283-f1dd4fb42a4e',
  hasReference: true/false,
  denoise: 0.65,
  ipAdapterWeight: 0.65,
  route: {
    checkpoint: 'flux1-dev-fp8.safetensors',
    steps: 24,
    fluxGuidance: 3.5
  }
}

[Chat Generate] Success {
  userId: '...',
  girlfriendId: '...',
  latencyMs: 8500,
  hasReference: true,
  ipAdapterUsed: true
}
```

**失败情况**（如果仍然失败）:
- 检查 RunPod API Key 是否配置
- 检查 RunPod Endpoint ID 是否正确
- 查看完整的错误堆栈信息

---

## 📊 girlfriends 表结构

根据修复，girlfriends 表应该包含以下列：

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | UUID | 主键 |
| `user_id` | UUID | 外键 → auth.users |
| `name` | VARCHAR | 女友名称 |
| `gender` | VARCHAR | 性别 |
| `appearance_prompt` | TEXT | 外观描述提示词 |
| `face_reference_url` | TEXT | 面部参考图 URL |
| `portrait_url` | TEXT | 头像 URL |
| `nsfw_allowed` | BOOLEAN | 是否允许 NSFW |
| `created_at` | TIMESTAMPTZ | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 更新时间 |

**注意**：`visual_style` 列不存在，改用 `appearance_prompt` 或默认 'realistic'

---

## 🐛 其他可能的错误

### 错误 1: `column girlfriends.appearance_prompt does not exist`
```sql
-- 解决：添加列（如果不存在）
ALTER TABLE girlfriends 
  ADD COLUMN IF NOT EXISTS appearance_prompt TEXT;
```

### 错误 2: `column girlfriends.nsfw_allowed does not exist`
```sql
-- 解决：添加列
ALTER TABLE girlfriends 
  ADD COLUMN IF NOT EXISTS nsfw_allowed BOOLEAN DEFAULT false;
```

### 错误 3: `RunPod is not configured`
```bash
# 解决：配置环境变量
# 在 .env.local 中添加：
RUNPOD_API_KEY=your_api_key_here
RUNPOD_ENDPOINT_ID=your_endpoint_id_here
```

### 错误 4: `No images returned from generation`
```
原因：RunPod endpoint 未响应或队列太长
解决：
1. 检查 RunPod Dashboard 确认 endpoint 状态
2. 增加 poll_budget_ms（默认 150000ms）
3. 或等待几分钟后重试
```

---

## 📝 数据库迁移检查清单

确保以下迁移已执行：

- [x] `20260813100000_tokens_system.sql` - 代币系统
- [x] `20260813200000_visual_memory_recall.sql` - 视觉记忆
- [ ] `girlfriends` 表基础迁移（应该已存在）

验证 girlfriends 表：
```sql
-- 检查表是否存在
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'girlfriends';

-- 检查列是否存在
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'girlfriends'
ORDER BY ordinal_position;
```

---

## 🎯 下一步

修复完成后：

1. ✅ 重启开发服务器
2. ✅ 清除浏览器缓存（Ctrl+Shift+Delete）
3. ✅ 重新登录并测试生成功能
4. ✅ 观察代币余额是否扣除
5. ✅ 检查 face_reference_url 是否自动填充

### 如果仍然失败

请提供以下信息：

1. 完整的错误日志（从终端复制）
2. 浏览器控制台的错误信息
3. `.env.local` 中的 RunPod 配置（隐藏 API Key）
4. girlfriends 表的列列表（从数据库查询）

---

## 🔗 相关文件

- [src/app/api/chat/generate-image/route.ts](file:///c:/Users/71489/soulmate9/src/app/api/chat/generate-image/route.ts) - 修复的路由文件
- [src/lib/runpod.ts](file:///c:/Users/71489/soulmate9/src/lib/runpod.ts) - RunPod 客户端
- [src/lib/image-generation-routing.ts](file:///c:/Users/71489/soulmate9/src/lib/image-generation-routing.ts) - 生图路由

---

现在重启服务器并重新测试生成功能应该可以工作了！🚀
