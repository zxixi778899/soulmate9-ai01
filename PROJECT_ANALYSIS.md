# SoulMate AI — 项目检查与分析报告

> 生成时间：2026-07-02
> 工作目录：`C:\Users\71489\soulmate9`
> 整体健康度：**B+**（基础框架扎实，工程化有亮点，但存在几处需要尽快处理的风险点和大量可优化空间）

---

## 一、项目总览

| 维度 | 数值 / 状态 | 评估 |
|------|------------|------|
| 总代码量 | **231 个 .ts/.tsx 文件 / ~37,367 行**（`src/` 内） | 中等规模、略偏大 |
| App Router 页面 | 44 个 `page.tsx` | 完整，含 14 个 admin 页 |
| API 路由 | 90 个 `route.ts` | 完整，覆盖全部业务 |
| 第三方 SDK | Supabase / Stripe / RunPod / Coze LLM / AWS S3 SDK / Upstash（已写未启用） | 完整 |
| i18n | 7 语言 / 263 唯一 key，Allowlist 标记借词 | 🟢 成熟 |
| 测试 | **0** 个单测 / 0 个 E2E | 🔴 缺失 |
| 监控 | 0（Sentry/PostHog 未接入） | 🔴 缺失 |
| 邮件 | 未接入（Supabase 默认 SMTP） | 🔴 缺失 |
| 限流 | Upstash 实现已写，**仅 5 个路由接入** | 🟡 严重不足 |
| 缓存 | API 几乎无 `unstable_cache` / ISR | 🟡 待优化 |
| `console.*` | **177 处**（其中 `console.error` 31 处、`console.log` 散落） | 🟡 噪音 + 潜在泄漏 |
| 大文件 | `admin/images` 1601 行 / `chat/[id]` 1215 行 / `translations.ts` 1912 行 | 🟡 维护难 |
| `as any` | 12 处；`@ts-ignore` 0 | 🟢 类型基本严格 |
| 鉴权一致性 | `getAuthUser` + `requireAdmin` 抽象良好 | 🟢 |

---

## 二、架构亮点

### 1. 清晰的双 Supabase 隔离
- **Auth Supabase**（`NEXT_PUBLIC_SUPABASE_URL`）— 登录、邮箱、JWT 签发
- **Data Supabase**（`COZE_SUPABASE_URL`）— 通过 `coze_workload_identity` 经 Python 代理，绕过公网，service_role 访问完整 schema
- `getAuthUser(req)` 先用 Public Supabase 校验 token，再返回 Coze Proxy 数据客户端 — 隔离清晰
- `supabase.ts`（client）/ `supabase-server.ts`（server）模块边界严格

### 2. LLM 路由分层
- `llm-router.ts` 支持 6 种 TaskType（chat / emotion / metadata / prompt / image / complex_reasoning）
- 管理员可在 `models` 配置中覆盖每种任务的 model + temperature
- `analyzeAndRoute()` 一次性输出 `RouterDecision`，调用方零分支

### 3. OSS / Stripe / RunPod 集成度完整
- `lib/storage.ts` 统一处理 OSS 签名 URL 缓存、data URL 解析、key 生成
- Stripe webhook 走 `stripe_webhook_events` 表去重（unique constraint on event_id），防重放
- RunPod 提供 `generate / batch / test-generate` 三档端点

### 4. i18n 工程化
- 7 语言 263 唯一 key + 配套脚本：`i18n:check / i18n:sync / i18n:extract` + allowlist
- 比硬编码英文 + ad-hoc 翻译强很多

### 5. 鉴权与角色
- `requireAdmin` 支持 `reviewer / admin / superadmin` 三级 RBAC
- 开发环境 `ALLOWED_ADMIN_EMAILS` 兜底，**生产自动关闭**（避免白名单泄漏越权）
- 关键 admin 路由全部走 `requireAdmin`

---

## 三、风险与问题（按严重程度）

### 🔴 P0 — 必须尽快处理

#### 1. 生产环境 debug 路由未受保护
- `src/app/api/admin/db-debug/route.ts` 与 `src/app/api/admin/key-debug/route.ts` 直接 query `pg_namespace` / `pg_tables` / 解析 JWT payload 并返回密钥前缀
- `require-admin.ts` 中只有 `ENABLE_DEBUG_ROUTES` 环境变量开关，但**这两个路由并未调用 `requireAdmin`**，仅靠环境变量兜底
- **风险**：生产一旦忘记设置 `ENABLE_DEBUG_ROUTES=false`，任何能访问 admin 路径的人（或目录扫描器）即可拿到 DB schema、密钥长度与 role

**建议**：把这两个路由的 handler 头部加：
```ts
const guard = await requireAdmin(req, 'superadmin');
if (guard.error) return guard.error;
```

#### 2. Stripe Webhook 可能被 env 错配导致查错 DB
- `src/app/api/stripe/webhook/route.ts` 注释里提到"原实现错配 Auth Supabase URL + Coze service_role key" — 已修
- 但**未配置 `STRIPE_WEBHOOK_SECRET` 时**会 `console.error` 然后返回 500，Stripe 看到 500 会**指数退避重试**，事件堆积
- 建议：env 缺失时直接返回 200（让 Stripe 不再重试） + Sentry 告警

#### 3. 限流严重覆盖不足
- `rate-limit.ts` 已写好 Upstash 实现（带 Lua 原子计数），**但只在 5 个路由接入**：
  - `/api/auth/signin` / `/api/auth/signup` / `/api/chat/stream` / `/api/shop/v2/purchase` / `/api/shop/v2/products`
- **未限流的关键路由**（脚本刷能直接烧钱 / 刷数据）：
  - `POST /api/girlfriends` — 创建女友（涉及 RunPod portrait）
  - `POST /api/chat/generate-image` 与 `/api/generate-image` — RunPod FLUX
  - `POST /api/girlfriends/generate-portrait`
  - `POST /api/chat/regenerate`
  - 全部 admin 写入路由
- 建议：按 `OPTIMIZATION.md` P1-2 计划立即补齐，阈值参考：chat 50/h、image 10/h、girlfriends POST 30/h、signup 5/h/IP

#### 4. 邮件能力未接入 Resend
- Supabase Free tier：3 封/小时 + 进垃圾箱
- 已在 `OPTIMIZATION.md` P0-1 标定（4h 工作量），但目前未做
- 风险：注册邮件失败 / 找回密码失败 → 用户流失

---

### 🟡 P1 — 建议 1-2 周内处理

#### 5. `console.*` 177 处 — token / email 泄漏风险
- 散落样例：
  - `console.error('Failed to fetch crypto orders', e)` — 可能含 user_id
  - `console.log(rawPrompt); console.log(finalNegativePrompt);` — 在 `v2/admin/images/generate-from-meta` 把用户上传的原始 prompt 直接打印
  - 多处 `console.error('[AUTH]...', error)` 在 catch 中打印原始 error 对象
- 已有 `lib/logger.ts` 实现 redact（自动屏蔽 `password / token / authorization / x-session` 等 11 个 key），但**只在新代码用**
- 建议：执行 `OPTIMIZATION.md` P1-3（3h）：grep 替换 + ESLint `no-console` rule

#### 6. 超大文件难维护
| 文件 | 行数 | 建议 |
|------|------|------|
| `app/(main)/admin/images/page.tsx` | 1601 | 拆 `ImageGrid / FilterBar / GenerateModal / EditDrawer` |
| `app/(main)/chat/[id]/page.tsx` | 1215 | 抽 `useChatStream` hook + 子组件 |
| `lib/i18n/translations.ts` | 1912 | 拆 7 个 JSON（动态 import 或 build-time 合并） |
| `app/api/v2/admin/images/generate-from-meta/route.ts` | 793 | 同上 |
| `app/api/chat/stream/route.ts` | 622 | 抽 `buildCharacterPrompt` / `callLLMStream` |

#### 7. LCP / 性能未优化
- `landing` 页（`app/page.tsx` 748 行）未启用 ISR，每次 SSR
- `/girlfriend/[slug]` 公开页未启用 ISR
- OSS 签名 URL 每次 1 天 TTL（`URL_TTL_SEC = 86400`），DB 查 OSS 解析串行 `Promise.all` 等待
- 建议：`export const revalidate = 300` + `unstable_cache` 包公开 API + TTL 提升到 7-30 天（数据更新通过 webhook 失效）

#### 8. DB 索引未审查
- `girlfriends(user_id)` / `(review_status, is_public)` / `messages(gf_id, created_at DESC)` / `intimacy(user_id, gf_id)` 4 个核心索引未确认
- 当前公开列表每次 `select *` 全表扫描
- 建议：执行 P1-4（2h）

---

### 🟢 P2 — 中期优化

#### 9. 缺少测试
- 0 单测 / 0 E2E
- 建议从 P3-1 起步（6h）：覆盖 `requireAdmin` / intimacy 公式 / Stripe webhook 签名 / i18n fallback
- P3-2 Playwright 跑核心漏斗：18+ → 注册 → 创建 → 上限 → 升级

#### 10. Sentry 错误监控未接
- 500 错误完全无告警
- 建议 P1-1（3h）：`@sentry/nextjs` 免费版 5K/月

#### 11. PWA / PostHog / 主动召回 / pgvector 长期记忆均未做
- 已在 `OPTIMIZATION.md` P2 列出，预期总收益 7 日留存 +50%、续费 +10%
- 工作量合计约 28h

#### 12. `Onboarding 状态存 localStorage`
- `app/(main)/layout.tsx` 用 `localStorage.getItem('soulmate_onboarding_complete')` 判断
- 风险：换设备/清缓存/隐身模式 → 重复引导
- 建议：迁到 `profiles` 表字段

#### 13. `AdminLayout` 硬编码 localStorage key
- `src/app/(main)/admin/layout.tsx` 第 49 行写死 `sb-ywktqpaycmuoxnzxxlbr-auth-token`
- 项目名 `soulmate9` 变化或 Supabase project 重命名会失效
- 建议：用 `getSessionToken()` 统一抽象

#### 14. i18n 类型 vs 实际 key 数量不完全一致
- `types.ts` 有 267 个 `|` 联合项；`translations.ts` 实际 263 个独立 key
- 4 个 key 可能在 types 中有但 translations 漏了（或者相反）
- 建议：跑 `pnpm i18n:check` 验证

---

## 四、按业务模块评估

| 模块 | 完成度 | 主要问题 |
|------|--------|----------|
| **女友 CRUD** | 🟢 完整 | `POST /api/girlfriends` 内联组装 `character_card` JSON，220 行混在一起，难复用 |
| **聊天流式 (chat/stream)** | 🟢 完整 | 622 行混杂 prompt 构造 / LLM 调用 / SSE 包装 / 限流，应拆 hook |
| **亲密值系统 (intimacy)** | 🟢 完整 | 公式 6 级在多处硬编码（`lib/constants.ts` / `route.ts` / `useMembership.ts`）— 单一来源不一致风险 |
| **LLM 路由** | 🟢 完整 | 模型配置落盘 `/tmp/llm_router_config.json` — Vercel 部署重启会丢失，prod 应存 DB |
| **RunPod 图像生成** | 🟢 完整 | 与 `v2/admin/images/generate-from-meta` 重复实现 FLUX 调用 |
| **审核工作流** | 🟢 完整 | `slug` 字段用 `id.slice(0,8)` 生成，**碰撞风险** + 公开页 URL 不可读 |
| **Stripe 支付** | 🟢 完整 | webhook 去重到位；webhook secret 缺失时返回 500（见 P0-2） |
| **Admin 后台** | 🟢 14 子页 | 缺统一列表/筛选/分页抽象，每个页面都重写一遍 |
| **Auth** | 🟢 完整 | Google OAuth 端点存在，未确认生产配置 |
| **i18n** | 🟢 完整 | 见 P2-14 |
| **Crypto 支付** | 🟡 半完成 | API 完整但 UI 流不完整（`/api/crypto/{initiate,orders,submit}` 3 个端点）|
| **主动召回** | 🟡 框架已有 | `/api/proactive/check` 有，但缺 Vercel Cron 触发（见 P2-3）|

---

## 五、安全审计

| 项 | 状态 | 备注 |
|----|------|------|
| SQL 注入 | 🟢 | 全走 Supabase client，无裸 SQL（除 db-debug）|
| XSS | 🟢 | React 默认转义；无 `dangerouslySetInnerHTML` 滥用 |
| CSRF | 🟡 | `x-session` header 由 `authedFetch` 注入，可控；**建议**对写操作加 CSRF token 或 Origin 校验 |
| Admin 鉴权 | 🟡 | 大部分走 `requireAdmin`；db-debug / key-debug 漏（见 P0-1）|
| 速率限制 | 🔴 | 严重不足（见 P0-3）|
| Secrets 泄漏 | 🟡 | 177 处 console + db-debug 暴露密钥前缀 |
| OSS 签名 URL | 🟢 | 1 天 TTL + 内存缓存 |
| Stripe Webhook 签名 | 🟢 | `constructEvent` 校验 |
| 年龄验证 | 🟢 | `AgeVerification` 全屏 z-9999，localStorage 标记 |
| Onboarding / auth bypass | 🟢 | 强制走 onboarding 流程 |

---

## 六、CI/CD 与工程化

| 项 | 状态 |
|----|------|
| `pnpm` 强制 | ✅ `preinstall: npx only-allow pnpm` |
| TypeScript strict | ✅ `tsconfig.json` |
| ESLint 配置 | ✅ 含 Next 16 + `no-restricted-syntax` 防 `head` 标签 + 绝对路径 |
| `no-explicit-any` | 🟡 已降级为 warn，建议关键模块（auth / payment / admin）升 error |
| `ts-check` 脚本 | ✅ `pnpm ts-check` |
| `i18n:check` | ✅ 自带工具链 |
| `smoke` 脚本 | ✅ `post-deploy-smoke.mjs` |
| 单测 / E2E | 🔴 缺失 |
| 部署 | Vercel（推断，无 vercel.json 见到）|
| `output: 'standalone'` | ❌ 未配置，无法自托管 Docker |

---

## 七、关键文件清单（优先级排序）

### 必须读懂
- `src/lib/supabase-server.ts`（43 行）— 鉴权核心
- `src/lib/require-admin.ts`（约 100 行）— RBAC
- `src/lib/rate-limit.ts`（206 行）— 限流
- `src/lib/llm-router.ts`（201 行）— 模型路由
- `src/lib/storage.ts`（197 行）— OSS
- `src/lib/logger.ts`（约 100 行）— 日志 + redact
- `src/storage/database/supabase-client.ts`（约 200 行）— Coze Proxy

### 必须修复
- `src/app/api/admin/db-debug/route.ts`（30+ 行）— 加 `requireAdmin`
- `src/app/api/admin/key-debug/route.ts`（30+ 行）— 加 `requireAdmin`
- `src/app/(main)/admin/layout.tsx`（50+ 行）— 替换硬编码 localStorage key
- `src/app/api/stripe/webhook/route.ts`（约 100 行）— env 缺失时返回 200

### 建议拆分
- `src/app/(main)/admin/images/page.tsx`（1601）
- `src/app/(main)/chat/[id]/page.tsx`（1215）
- `src/lib/i18n/translations.ts`（1912）
- `src/app/api/v2/admin/images/generate-from-meta/route.ts`（793）
- `src/app/api/chat/stream/route.ts`（622）

---

## 八、推荐的下一步行动（按 ROI 排序）

| 优先级 | 项 | 工时 | 预期收益 | 来源 |
|--------|----|------|---------|------|
| 🔴 本周 | 给 db-debug / key-debug 加 `requireAdmin('superadmin')` | 0.5h | 关掉生产密钥泄漏口 | 本报告 P0-1 |
| 🔴 本周 | Stripe webhook env 缺失返回 200 + Sentry | 1h | 避免事件堆积 | 本报告 P0-2 |
| 🔴 本周 | 给关键写入路由补限流 | 2h | 防 $50+ 单次刷单 | OPTIMIZATION P1-2 |
| 🔴 本周 | 接 Resend 邮件 | 4h | 注册流失 -30% | OPTIMIZATION P0-1 |
| 🟡 下周 | 公开页 ISR + `unstable_cache` + 签名 TTL 30 天 | 8h | LCP 2.8s → 1.2s | OPTIMIZATION P0-3 |
| 🟡 下周 | console.* 替换为 logger + lint 规则 | 3h | 杜绝 token 泄漏 | OPTIMIZATION P1-3 |
| 🟡 下周 | Stripe 转化优化（社会证明 + 倒计时 + 升级 modal）| 6h | 付费 +15~30% | OPTIMIZATION P0-2 |
| 🟡 下周 | Sentry 接入 | 3h | 故障分钟级感知 | OPTIMIZATION P1-1 |
| 🟡 第 3 周 | DB 索引审查 | 2h | P95 200ms → 20ms | OPTIMIZATION P1-4 |
| 🟢 第 4 周 | 拆 3 个超大文件 | 10h | 长期可维护性 | OPTIMIZATION P3-3 |
| 🟢 第 4 周 | Vitest 关键单测 | 6h | 防止回归 | OPTIMIZATION P3-1 |
| 🟢 第 5 周 | PWA + PostHog + 主动召回 | 16h | 7 日留存 +50% | OPTIMIZATION P2-1/2/3 |
| 🟢 第 6 周 | pgvector 长期记忆 | 12h | 续费率 +10% | OPTIMIZATION P2-4 |

**总计 4 周 ≈ 70 小时**，与 `OPTIMIZATION.md` 排期一致。

---

## 九、一句话总结

项目在 **业务广度、鉴权分层、第三方集成、i18n 工程化** 方面已经相当成熟，最关键的两个立即可做的高 ROI 修正是：**给 db-debug / key-debug 加 superadmin 守卫** 和 **补齐关键写入路由的限流**。其余 95% 的优化都在 `OPTIMIZATION.md` 里已写明，照着执行即可。
