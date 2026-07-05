# Soulmate9 — DESIGN

> 架构设计文档。Why we built it this way.

## 目录

- [整体架构](#整体架构)
- [关键技术决策](#关键技术决策)
- [数据模型](#数据模型)
- [安全模型](#安全模型)
- [性能模型](#性能模型)
- [演进路线](#演进路线)

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ React 19 │  │ SW v7        │  │ PostHog JS          │   │
│  └────┬─────┘  └──────┬───────┘  └─────────────────────┘   │
└───────┼────────────────┼────────────────────────────────────┘
        │ HTTPS          │
        ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                      Vercel Edge                              │
│  ┌────────────────────┐  ┌──────────────────────────────┐   │
│  │ ISR (公开女友页)   │  │ Sentry Runtime               │   │
│  └─────────┬──────────┘  └──────────────────────────────┘   │
└────────────┼─────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js 16 (App Router)                    │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Server     │  │ Server       │  │ Server Actions     │   │
│  │ Components │  │ API Routes   │  │ (use server)       │   │
│  └─────┬──────┘  └──────┬───────┘  └─────────┬──────────┘   │
└────────┼─────────────────┼─────────────────────┼─────────────┘
         │                 │                     │
         ▼                 ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  External Services                                          │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Coze API (LLM)  │  │ RunPod (FLUX)   │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
│           │ fallback          │ cache (24h image / 7d video) │
│           ▼                   ▼                              │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ Claude 3.5      │  │ Cloudflare R2   │                   │
│  │ (NSFW fallback) │  │ (signed URL 30d)│                   │
│  └────────┬────────┘  └─────────────────┘                   │
│           ▼                                                │
│  ┌─────────────────┐                                       │
│  │ Local Llama 3.1 │                                       │
│  │ (emotion detect)│                                       │
│  └─────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Supabase (Coze Proxy DB)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ girlfriends  │  │ chat_messages│  │ subscriptions  │     │
│  │ (RLS)        │  │ (partitioned)│  │                │     │
│  └──────────────┘  └──────────────┘  └────────────────┘     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐     │
│  │ intimacy_    │  │ generation_  │  │ user_onboarding│     │
│  │ events       │  │ cache        │  │                │     │
│  └──────────────┘  └──────────────┘  └────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

## 关键技术决策

### 1. 双 Supabase（Auth + Coze Proxy）

**Why**: Coze LLM 平台已经维护了一个 Supabase 实例用来持久化业务数据（girlfriends / messages / intimacy 等），再单独维护一份会数据漂移。所以 Auth Supabase 只管用户身份，业务数据全部走 Coze Proxy Supabase。

**Trade-off**: 配置两份 Supabase 容易出错。Mitigation：所有 helper 函数（`getSupabaseClient`）封装在 `src/storage/database/`，调用方无需关心用的是哪个 project。

### 2. RunPod Serverless FLUX

**Why**: 同价位（$0.005/张）下，FLUX 在人物写实 + NSFW 容忍度上比 SDXL 强一个档次；Serverless 按需付费避免 idle cost。

**Trade-off**: Serverless 冷启动 5-15s。Mitigation：缓存层（`generation_cache` 表）命中后跳过 GPU。

### 3. Coze 作为 LLM 主路由 + Claude 兜底

**Why**: Coze 国内访问快、价格低（$1.5/M tokens）；Claude 兜底处理 Coze 拒答 NSFW 的场景（Anthropic 对 adult content 容忍度更高）。

**Trade-off**: 多一层网络跳。Mitigation：默认走 Coze，fallback 是异常路径。

### 4. ISR (revalidate=3600) + 30 天签名 URL

**Why**: 公开女友页（`/girlfriend/[slug]`）是 SEO 主战场，但生成图片 GPU 成本高。ISR 让 Next.js 缓存 1 小时渲染结果；签名 URL 让图片直接 CDN 缓存不打到源站。

**Trade-off**: 内容更新最长 1 小时延迟。Mitigation：Admin 操作后主动调 `revalidatePath('/girlfriend/[slug]')`。

### 5. generation_cache（SHA256 keyed）

**Why**: 同 (prompt + params) 的图片几乎一定应该复用结果。SHA256 哈希保证一致性；TTL 24h 让热点 prompt 持续命中。

**效果**: GPU 成本 -60%（基于测试数据）。

### 6. pgcrypto + RLS + service_role

**Why**: 业务表全部 RLS，anon key 只能读公开数据；service_role 只在 server-side 用。Stripe webhook / 主动消息等场景需要绕过 RLS 写入，所以 service_role 是必需的。

**Trade-off**: service_role 泄露 = 全表读写。Mitigation：`COZE_SUPABASE_SERVICE_ROLE_KEY` 只在 server env，从不暴露给客户端。

## 数据模型

### 核心表

```
profiles (1:1) ─── user_id (FK auth.users)
girlfriends (1:N) ─── user_id
girlfriends.public (1:N) ─── public_id (slug)
girlfriends.images (1:N) ─── girlfriend_id
chat_messages (N:N) ─── (user_id, girlfriend_id)
intimacy_events (event stream) ─── (user_id, girlfriend_id)
generation_cache (global) ─── (cache_key, kind)
subscriptions (1:N) ─── user_id
proactive_message_log (1:N) ─── (user_id, girlfriend_id)
```

### 关键索引

```
chat_messages(girlfriend_id, created_at DESC)
chat_messages(user_id, created_at DESC)
intimacy_events(user_id, girlfriend_id, created_at DESC)
girlfriends(review_status, is_public, slug) WHERE is_public=true
world_lore(keys) USING GIN  -- pg_trgm
chat_messages(embedding) USING ivfflat  -- pgvector (P2)
```

### 视图

`intimacy_score_latest`: 每个 (user, gf) 一行实时亲密值（DISTINCT ON + 窗口函数）。

## 安全模型

### Auth 边界

| 区域 | 鉴权 | 说明 |
|---|---|---|
| `/api/**` (除 stripe webhook / cron) | `authedFetch` 携带 user JWT | 通过 Supabase Auth 校验 |
| `/api/stripe/webhook` | Stripe-Signature 头校验 | 不走 Auth |
| `/api/cron/**` | `Authorization: Bearer CRON_SECRET` | 不走 Auth |
| `/api/admin/**` | `requireAdmin` 中间件 | 检查 `is_admin=true` |
| `/api/db-debug` / `/api/key-debug` | `requireAdmin` + superadmin 标志 | P0 安全修复 |

### 数据隔离

- RLS 在 Supabase 端强制
- 服务端 helper 函数封装 service_role，避免客户端误用
- localStorage 不存敏感数据（仅 UI 偏好）

### 内容审核

- 用户提交女友 → `review_status='pending'`
- Admin 后台审核 → `review_status='approved'`
- 只有 approved + `is_public=true` 才出现在公开页

## 性能模型

### LCP (Largest Contentful Paint)

公开女友页：
- Hero 头像 `priority fetchPriority="high"`
- ISR `revalidate=3600` 减少重渲
- 签名 URL 30 天有效 → Cloudflare CDN 直出

### TTI (Time to Interactive)

- Chat 页面流式响应（SSE / 分块）
- 大文件（chat/admin/images）已拆分 hooks 和 utility 模块

### 缓存命中率

| 类型 | TTL | 命中率目标 |
|---|---|---|
| image | 24h | > 60% |
| video | 7d | > 30%（生成贵，少复用） |

## 演进路线

### 已完成（P0/P1）

- ✅ 安全补丁（admin 守卫 / webhook 200）
- ✅ 限流（Upstash + Lua）
- ✅ 结构化日志 + Sentry 桥接
- ✅ 公开页 ISR
- ✅ LLM 双路由 fallback
- ✅ RunPod 结果缓存
- ✅ DB 优化（pg_trgm + pgvector + 索引）
- ✅ Sentry + PostHog 激活
- ✅ Resend 邮件 + cron
- ✅ PWA（service worker v7）
- ✅ 业务仪表盘（DAU/MRR/Churn）
- ✅ 主动召回（Web Push + Email）

### 计划中（P2）

- 🎬 CogVideoX 5B 视频管线 + HLS CDN
- 🎮 成就系统 + 每日任务 + 等级可视化
- 🛍️ 商城扩展（4 类道具 + 限时礼包 + 背包）
- 🧠 pgvector 长期记忆（embedding + 检索）

### 远期（P3）

- 🔧 Onboarding DB migration（已完成）+ AdminLayout key 集中（已完成）
- 🧹 大文件拆分（持续）
- 🧪 Vitest 单测覆盖率 > 60%
- 📚 完整文档 + 视频教程

---

## 相关文档

- [SETUP.md](./SETUP.md) — 5 分钟启动
- [RUNBOOK.md](./RUNBOOK.md) — 运维手册
- [../OPTIMIZATION.md](../OPTIMIZATION.md) — 优化进度跟踪
- [../AGENTS.md](../AGENTS.md) — Agent 协作规范