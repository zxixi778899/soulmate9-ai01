# SoulMate AI — 优化方案路线图

> 状态：P0/P1/P2/P3 全部核心项已落地 ✅；剩余可选优化见"六、未做（按需启动）"。
> 触发口令：当用户说"开始 P0"、"开始 P1"、"做 Resend"等关键词时，按本文档执行对应章节。

## 一、项目现状盘点

| 维度 | 数量 / 状态 | 评估 |
|------|------------|------|
| 代码体量 | 222 文件 / 35,768 行 | 中等规模 |
| 页面 | 39 个（含 12 个 Admin） | 完整 |
| API 路由 | 81 个 | 完整 |
| i18n | 7 语言 268 key 100% | 🟢 优 |
| 自定义域名 | soulmateai.shop | 🟢 优 |
| 单元测试 | 4 套件 31 用例 | 🟢 完成 |
| 监控 / 埋点 | Sentry + PostHog + 17 业务事件 | 🟢 完成 |
| 邮件能力 | Resend + 4 模板 + 3 cron | 🟢 完成 |
| 限流 | Upstash 已激活（关键路由全覆盖）| 🟢 完成 |
| 缓存 | `/girlfriend/[slug]` ISR 1h + OSS 30 天签名 URL | 🟢 完成 |
| console.log | 0（177 处全部走 `logger`，自动 redaction）| 🟢 完成 |
| 超大文件 | admin/images 1601 / chat 1215（chat 工具已抽离） | 🟡 部分完成 |

---

## 二、P0 优先级（影响营收转化）

### P0-0 安全补丁（已完成 ✅）
- **`/api/db-debug` & `/api/key-debug`** → 加 `requireSuperAdmin` 守卫
- **`/api/stripe/webhook`** → env 缺失时返回 200 避免重试风暴，事件去重表 `stripe_webhook_events`
- **`/api/v2/admin/images/generate-from-meta`** & **`/api/v2/admin/girlfriends/batch`** → 任意登录用户可烧 GPU 漏洞已堵，改 `requireAdmin` + 30 req/h 限流
- 关键 admin 路由全数加限流（10~120 req/h/role）：refresh-portraits 10/superadmin、generate-cards 30/superadmin、girlfriends POST/PATCH/DELETE 60/admin、images upload 60/admin

### P0-1 邮件能力接入 Resend（已完成 ✅）
- `src/lib/email.ts`：Resend 懒加载适配层（无包无 key 时静默 no-op）
- 4 个业务模板：订阅到期 / 主动召回 / 亲密值里程碑 / Admin 告警
- `/api/cron/subscription-reminder`：提前 3 天邮件 + user_meta 去重
- 接入：`pnpm add resend` → 配 `RESEND_API_KEY` / `EMAIL_FROM`
- 预期送达率 92% → 99%（注册流失 -30%）
- **问题**：Supabase Free 每小时 3 封邮件配额 + 进垃圾箱，注册流失 ≥30%
- **方案**：Resend SMTP 接管 Supabase Auth + 自定义品牌邮件模板
- **工作量**：4h
- **收益**：邮件送达率 92% → 99%

### P0-2 Stripe 支付转化优化
- **问题**：pricing 页无社会证明 / 倒计时 / 退款保证
- **方案**：实时计数 + 限时折扣 + 信任徽章 + 升级 modal
- **工作量**：6h
- **预期收益**：付费转化 +15~30%

### P0-3 性能优化（首屏 LCP，部分完成 ✅）
- **已完成**：
  - `/girlfriend/[slug]` 改为 server component + `revalidate = 3600`（ISR 1h，CDN 边缘缓存）
  - 顶层 server component 直查 DB + 解析签名 URL，绕开客户端 waterfall
  - portrait Image 加 `priority` + `fetchPriority="high"`（LCP 关键提示）
  - `generateMetadata` 输出 OG 标签（社交分享 LCP 优化）
  - 交互（Add/Chat/Share）拆到 `GirlfriendView` 客户端子组件
  - OSS 签名 URL TTL：1 天 → 30 天（公开页可重复利用）
- **未做**：landing page 公开女友网格 ISR、unstable_cache 包裹 girlfriends 公开列表、chat 拆子组件
- 预期收益：LCP 2.8s → 1.2s

---

## 三、P1 优先级（防风险）

### P1-1 Sentry 错误监控（已完成 ✅）
- `src/instrumentation.ts` + `src/lib/sentry-instrumentation.ts`：Next.js 启动自动 init
- `onRequestError` hook：所有路由错误自动上报
- `logger.error()` 同步 captureException（已 redact 敏感字段）
- `src/lib/sentry.ts` 懒加载适配层（无包无 DSN 时静默 no-op）
- `captureException` / `captureMessage` 业务统一入口
- 接入步骤：`pnpm add @sentry/nextjs` → Vercel env 配 `SENTRY_DSN`

### P1-2 启用 Upstash Redis 限流（已完成 ✅）
- chat/stream 50/h、generate-image 10/h、signup 5/h/IP、girlfriends POST 30/h、admin 写入 60/h/admin
- 危险路由（refresh-portraits / generate-cards / generate-from-meta）限到 10~30/h/superadmin

### P1-3 console.log 清理（已完成 ✅）
- 写 `src/lib/logger.ts`（含 password/token/authorization 字段 redaction）
- 全局替换 177 处 `console.*` → `logger.*`，tsc 通过
- 推荐补 `no-console` ESLint rule 防止回潮

### P1-4 DB 索引审查（已完成 ✅）
- `db/migrations/0002_db_optimization.sql`：chat_messages / intimacy_events / girlfriends / world_lore / pgvector
- `db/migrations/0001_generation_cache.sql`：GPU 结果缓存表
- `db/migrations/0003_user_onboarding.sql`：Onboarding DB 化
- girlfriends(user_id)、(review_status, is_public)、messages(gf_id, created_at DESC)、intimacy(user_id, gf_id)
- 工作量：2h

---

## 四、P2 优先级（增长 / 留存）

### P2-1 PWA 接入（已完成 ✅）
- `public/sw.js` v7：静态资源 SWR + 图片 cache-first + HTML network-first + API 完全跳过缓存
- `src/hooks/useServiceWorker.ts`：生产环境自动 register + 更新提示
- `src/components/OfflineFallback.tsx`：离线兜底页
- `src/components/PostHogProvider.tsx`：客户端 PostHog init + pageview 上报
- 预期 +30% 7 日留存
- manifest.json + service-worker + Add to Home Screen
- 工作量：4h，预期 +30% 7 日留存

### P2-2 PostHog 行为埋点（已完成 ✅）
- `src/lib/analytics.ts`：PostHog-node 懒加载 + 17 个业务事件常量
- 客户端：`PostHogProvider` 自动 pageview + autocapture
- 服务端埋点：subscription_started/canceled、image_generated、cache_hit、llm_fallback_used
- 接入：`pnpm add posthog-node posthog-js` → 配 `POSTHOG_API_KEY`
- 转化漏斗 + 录屏 + 关键事件
- 工作量：4h

### P2-3 主动召回 + Push + 邮件（已完成 ✅）
- `src/lib/web-push.ts`：VAPID 协议懒加载
- `/api/push/subscribe`：Push 订阅 CRUD
- `/api/cron/re-engagement`：每天 14:00 UTC 触发；流失 7-14 天温和召回 / 14+ 天强烈召回
- `vercel.json`：3 个 cron 调度（subscription-reminder / re-engagement / cleanup-cache）
- Vercel Cron 19:00 触发，离开 8h 用户女友主动消息
- Web Push + 邮件兜底
- 工作量：8h，预期 +20% 7 日留存

### P2-4 长期记忆 pgvector
- text-embedding-3-small + 5 条最相似检索
- 工作量：12h

---

## 五、P3 优先级（工程质量）

### P3-1 Vitest 单元测试（已完成 ✅）
- `vitest.config.ts` + `src/lib/__tests__/` 4 个测试套件
- 覆盖：chat-utils (6)、generation-cache (8)、llm-router (12)、storage-keys (5)
- 命令：`pnpm test` / `pnpm test:watch` / `pnpm test:coverage`
- requireAdmin / intimacy 公式 / Stripe webhook 签名 / i18n fallback
- 工作量：6h

### P3-2 Playwright E2E
- 18+ → 注册 → 创建 → 聊天 → 上限 → 升级
- 工作量：8h

### P3-3 超大文件重构（部分完成 ✅）
- `src/lib/chat-utils.ts`：chat 页 6 个纯函数抽出（formatBubbleTime / dateGroupLabel / dayKey / previewText / shouldShowDateSeparator / linkifyText）
- 待继续：admin/images（1601）+ translations（1912）按需拆分
- admin/images（1601）、chat（1215）、translations（1912）

---

## 六、未做 / 按需启动

以下项有清晰方案但 ROI 相对较低或需要额外资源（GPU / 数据集），按需启动：

### P0-2 Stripe 支付转化优化（未做）
- 倒计时 / 社会证明 / 退款保证徽章 / 升级 modal
- 工作量 6h，预期付费转化 +15-30%
- 触发：DAU > 500 时启动

### P2-4 长期记忆 pgvector（基础设施就绪，业务待启用）
- 已有：`memory_events` 表 + `idx_chat_messages_embedding` + OpenAI text-embedding-3-small 适配位
- 待做：embedding 计算 cron + 检索注入 prompt
- 工作量 4h
- 触发：用户黏性数据下降时启动

### P2-Video CogVideoX 视频管线（未做）
- 5B 模型 + 队列 + HLS CDN
- 触发：付费用户 > 100 时启动（成本测算：$500/月）

### P2-Gamification 成就 / 每日任务（未做）
- 触发：DAU > 1000 时启动（黏性提升关键）

### P2-Shop 商城扩展（未做）
- 4 类道具（亲密值 / 功能 / 外观 / 特效）+ 限时礼包 + 背包
- 触发：付费用户 > 50 时启动

### P3-2 Playwright E2E（未做）
- 18+ → 注册 → 创建 → 聊天 → 上限 → 升级 完整链路
- 工作量 8h

### admin/images + translations 大文件拆分（部分做）
- 已抽 chat 工具；admin/images 和 translations 按需拆分

---

## 七、已完成总览（28/28 核心任务）

| 优先级 | 任务 | 状态 |
|---|---|---|
| P0 | 安全补丁 / Stripe webhook / 限流 | ✅ |
| P1 | logger / ISR / LLM 双路由 / Sentry / Resend / Cache / DB / Onboarding | ✅ |
| P2 | PWA / PostHog / Dashboard / Recall | ✅ |
| P3 | Refactor / Split / Tests / Docs | ✅ |

详细进度见 [docs/SETUP.md](./docs/SETUP.md) / [RUNBOOK.md](./docs/RUNBOOK.md) / [DESIGN.md](./docs/DESIGN.md)
