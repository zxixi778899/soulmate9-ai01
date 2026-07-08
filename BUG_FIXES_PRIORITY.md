# SoulMate9 Bug修复优先级清单 & 执行进度

**文档生成时间**: 2026-07-08  
**状态**: 正在批量修复中

---

## 第一批：P0 紧急修复（核心功能必要）

### [P0-1] 环境变量配置缺失与错误命名

**位置**: `.env.example`, `.env.local`, `src/lib/coze-auth.ts:33-40`

**问题描述**:
- `.env.example` 里定义了无人使用的 `COZE_API_KEY`（代码已无引用）
- 真正需要的 `COZE_WORKLOAD_IDENTITY_API_KEY` 和 `COZE_WORKLOAD_IDENTITY_CLIENT_SECRET` 完全缺失于示例文件
- `.env.local` 中 `COZE_SUPABASE_ANON_KEY`（无前缀版本）缺失，导致服务端数据库初始化失败
- 多个其他功能变量（ANTHROPIC_API_KEY, TOGETHER_API_KEY, RUNPOD_VLLM_URL, CRON_SECRET等）未收录在 `.env.example`

**影响范围**: 
- 聊天功能（LLM调用）: 100% 不可用
- 所有后台API（admin路由、model-usage）: 100% 不可用
- 定时任务（cron）: 100% 不可用

**修复方案**:
```bash
# Step 1: 更新 .env.example
# 删除无用项: COZE_API_KEY
# 添加必需项:
COZE_WORKLOAD_IDENTITY_API_KEY=your_api_key
COZE_WORKLOAD_IDENTITY_CLIENT_SECRET=your_secret
COZE_SUPABASE_ANON_KEY=your_anon_key

# Step 2: 更新 .env.local（需用户提供真实密钥）
# 同步更新所有Supabase/Coze/RunPod变量
```

**✅ 修复状态**: ⏳ 等待用户提供真实密钥

---

### [P0-2] RunPod图片生成核心功能崩溃

**位置**: `src/lib/runpod.ts:282,284,298,329`, `src/app/api/runpod/test-generate/route.ts:7-61`

**问题描述**:
调试代码残留，多处无保护的 `fs.appendFileSync('/app/work/logs/bypass//dev.log', ...)`调用：
- 第282行、284行、298行在主 `generate()` 方法中无try/catch
- 仅第329行的FAILED分支有保护
- 路径包含双斜杠 `bypass//`（明确的调试遗留）
- Vercel/Railway环境中该目录不存在，导致 ENOENT 异常

**影响范围**: 所有图片生成功能（头像、自拍、角色生成图等）必然失败

**修复方案**:
```typescript
// 删除所有 fs.appendFileSync 调用
// 改用已有的 logger 工具:
import { logger } from '@/lib/logger';

// 示例修复 (line 282):
// 删除: fs.appendFileSync(LOG, `[${new Date().toISOString()}] Submitting task...\n`);
// 改为: logger.debug('[runpod] Submitting task', { taskId });
```

**✅ 修复状态**: ⏳ 即将执行

---

### [P0-3] RunPod批量操作越权漏洞

**位置**: `src/app/api/runpod/batch/route.ts:141-149, 174-178`

**问题描述**:
- 路由仅有 `getAuthUser` 校验，缺少 `requireAdmin` 检查
- 功能：无过滤地批量扫描全库女友并生成头像（`select('id, name, personality, avatar_url').limit(20)` 无 `.eq('user_id', ...)`）
- 任何登录用户可触发，消耗GPU资源、污染全库数据

**影响范围**: 安全与成本（GPU资源滥用、数据一致性风险）

**修复方案**:
```typescript
// 改为:
const guard = await requireAdmin(req);
if (guard.error) return guard.error;

// 添加用户过滤:
.eq('user_id', currentUserId)  // 仅限当前用户
// 或标记为真正的系统管理任务，受管理员账号限制
```

**✅ 修复状态**: ⏳ 即将执行

---

### [P0-4] 图片上传URL对象序列化bug

**位置**: `src/app/api/runpod/batch/route.ts:208-211`

**问题描述**:
```typescript
// 错误代码:
const url = await uploadFile(buffer, filename, 'image/png', folder);
avatar_url: url  // 把整个对象 {key, url} 当字符串存储 → "[object Object]"

// 正确用法对比 (runpod.ts:381):
const { url } = await uploadFile(buffer, filename, 'image/png', folder);
```

**影响范围**: 批量生成的图片URL全部损坏，前端显示为"[object Object]"

**修复方案**:
```typescript
const { url } = await uploadFile(buffer, filename, 'image/png', folder);
// 或:
const uploadResult = await uploadFile(...);
avatar_url: uploadResult.url
```

**✅ 修复状态**: ⏳ 即将执行

---

### [P0-5] NSFW内容合规风险

**位置**: `src/lib/llm-service.ts:317-357`

**问题描述**:
NSFW请求在RunPod/Together失败后，代码会静默fallback到不支持NSFW的 Coze（中国审查模型）和 Claude（明确禁NSFW）：
```typescript
// 当前逻辑:
if (isNsfw && runpodAvailable) { ... }
else if (isNsfw && togetherAvailable) { ... }
else {
  // ⚠️ NSFW请求也会走这里，被发给Coze/Claude!
  return callLLM(messages, model, ...);  
}
```

**影响范围**: 
- 账号风险：上游服务商（Claude/Coze）可能因违反使用政策而封禁账号
- 用户体验：NSFW请求返回拒答或被过度审查

**修复方案**:
```typescript
if (isNsfw) {
  if (!runpodAvailable && !togetherAvailable) {
    return NextResponse.json(
      { error: 'NSFW generation currently unavailable' },
      { status: 503 }
    );
  }
}
```

**✅ 修复状态**: ⏳ 即待执行

---

## 第二批：P1 高优先级修复（系统稳定性）

### [P1-1] LLM调用链缺少超时控制

**位置**: `src/lib/coze-auth.ts`, `src/lib/llm-service.ts` (全部callXXX函数)

**问题**: 所有fetch调用无 AbortSignal.timeout，上游卡死会占满并发连接

**修复**: 为所有fetch加 `signal: AbortSignal.timeout(15000)`

---

### [P1-2] Coze Token刷新缺少并发去重 & 重试

**位置**: `src/lib/coze-auth.ts:27-76`

**问题**: 多个并发请求会同时打token端点，网络抖动导致全部失败

**修复**: 添加 in-flight Promise复用 + 指数退避重试

---

### [P1-3] RunPod轮询超时配置不合理

**位置**: `src/lib/runpod.ts:253-339`

**问题**: 6分钟超时远超Serverless平台限制，导致真实错误被掩盖

**修复**: 改为90秒超时+异步查询模式 (返回job_id，让客户端轮询查询)

---

## 第三批：P2 中等优先级修复（代码质量）

### [P2-1] 环境变量与文件系统配置不持久

**位置**: `src/app/api/admin/prompts/route.ts`, `src/lib/llm-router.ts`

**问题**: `/tmp/prompts_presets.json` 和 `/tmp/llm_router_config.json` 在Serverless环境不持久

**修复**: 迁移到Supabase数据库表

---

### [P2-2] API错误处理不一致

**位置**: `src/app/api/wardrobe/route.ts:47`, `src/app/api/notifications/route.ts:41`

**问题**: 请求体json()解析无catch，畸形请求返回裸500

**修复**: 统一添加 `.catch(() => null)` 兜底

---

### [P2-3] Stripe Webhook缺少事件处理

**位置**: `src/app/api/stripe/webhook/route.ts`

**问题**: 缺少 `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.past_due` 的处理

**修复**: 补充三个事件handler

---

## 修复执行计划

| 优先级 | 问题数 | 预计时间 | 状态 |
|------|------|--------|------|
| **P0** | 5项 | 2小时 | ⏳ 下一步执行 |
| **P1** | 3项 | 3小时 | ⏳ 后续 |
| **P2** | 3项 | 2小时 | ⏳ 后续 |
| **其他中低** | 13项 | 4小时 | ⏳ 后续 |

**总计**: ~28项bug，预计6-8小时全部完成修复

---

## 需要用户配合的项

### 待确认事项清单（后续会提示）

1. **真实环境密钥**：Coze API密钥、Supabase项目密钥、RunPod Key等
2. **NSFW合规**：确认Stripe账户是否过NSFW资质审核
3. **基础设施**：部署平台（Railway/其他）、CDN配置
4. **大奖规则**：苹果手机兑换的法律/地域/运营细节

---

## 修复进度跟踪

| Bug ID | 文件 | 状态 | 完成时间 | 备注 |
|-------|------|------|--------|------|
| P0-1 | .env.example | ⏳ Pending | — | 等待用户密钥 |
| P0-2 | runpod.ts | ⏳ Pending | — | 即将执行 |
| P0-3 | runpod/batch/route.ts | ⏳ Pending | — | 即将执行 |
| P0-4 | runpod/batch/route.ts | ⏳ Pending | — | 即将执行 |
| P0-5 | llm-service.ts | ⏳ Pending | — | 即将执行 |

