# Soulmate9 — DEPLOY

> 生产部署手册。目标平台：**Railway** + 域名 **soulmateai.shop**
> 假设：你已经在本地能跑 `pnpm dev`（参见 [SETUP.md](./SETUP.md)）

---

## 目录

1. [为什么选 Railway](#1-为什么选-railway)
2. [前置条件](#2-前置条件)
3. [一键部署步骤](#3-一键部署步骤)
4. [环境变量完整清单](#4-环境变量完整清单)
5. [域名 soulmateai.shop 绑定](#5-域名-soulmateaishop-绑定)
6. [Stripe webhook 重新配置](#6-stripe-webhook-重新配置)
7. [首发验证清单](#7-首发验证清单)
8. [回滚方案](#8-回滚方案)
9. [NSFW 内容合规](#9-nsfw-内容合规)

---

## 1. 为什么选 Railway

| 维度 | Railway | Vercel |
|---|---|---|
| **DMCA / NSFW 内容处理** | 宽松，给申诉窗口 | 严格，首次举报暂停 |
| **流式聊天（SSE）超时** | 无限制 | 60s |
| **函数内存** | 32GB | 3GB |
| **冷启动** | 几乎无 | Serverless 5-15s |
| **Cron** | ✅ | ✅ |
| **NSFW 政策** | **ToS 只禁违法内容** | 明确禁成人内容变现 |
| **月成本（1000 MAU）** | $25-50 | $20-25 |

**关键决策点**：soulmate9 定位 "AI 女友 + 高 NSFW"，Vercel 收到一次举报即可能封号；Railway 给我们申诉窗口。**代价是多花 $5/月 + 容器化思维**（Dockerfile 已在仓库根目录）。

---

## 2. 前置条件

| 工具 | 版本 | 用途 |
|---|---|---|
| GitHub 账号 | 任意 | 源码托管 + Railway 自动部署 |
| Railway 账号 | https://railway.app | 部署平台 |
| Cloudflare 账号 | 已有 soulmateai.shop 域名 | DNS 解析 + 代理 |
| Stripe 账号 | 已有 webhook 代码 | 支付 |
| Coze / Supabase / RunPod / Resend | 各自账号 | 第三方服务 |

---

## 3. 一键部署步骤

### Step 1：推送代码到 GitHub

```bash
cd C:\Users\71489\soulmate9
git init   # 如果还没初始化
git add .
git commit -m "feat: production ready"
git branch -M main
git remote add origin https://github.com/你的用户名/soulmate9.git
git push -u origin main
```

### Step 2：Railway 创建项目

1. 打开 https://railway.app/dashboard
2. **New Project** → **Deploy from GitHub repo**
3. 选择 `soulmate9` 仓库 → **Deploy Now**
4. Railway 自动检测到 `Dockerfile`，开始构建

### Step 3：配置环境变量

详见 [第 4 节](#4-环境变量完整清单)。

进入 Railway 项目 → **Variables** → **Raw Editor** → 粘贴所有变量 → **Add**。

### Step 4：等待首次部署完成

构建日志窗口会显示：
```
=> [builder 6/6] RUN pnpm build
✓ Compiled successfully
✓ Build successful
=> [runner] starting container
Server listening on port 3000
```

部署完成 → Railway 给一个 `xxx.up.railway.app` 临时域名。

### Step 5：触发健康检查

```bash
curl https://xxx.up.railway.app/api/health
# 期望：{"ok":true,"ts":...}
```

如果没 `/api/health` 路由，先用首页 `/` 验证。

---

## 4. 环境变量完整清单

> Railway Variables 页面 → Raw Editor 一次性粘贴所有 KEY=VALUE 行（每行一个）。

### Auth Supabase（用户登录）

```env
NEXT_PUBLIC_AUTH_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_AUTH_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...   # 仅 server-side，RLS bypass
```

### Coze Proxy Supabase（业务数据）

```env
NEXT_PUBLIC_COZE_SUPABASE_URL=https://yyy.supabase.co
COZE_SUPABASE_URL=https://yyy.supabase.co
COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
COZE_WORKLOAD_IDENTITY_API_KEY=pat_xxx
```

### Coze SDK 必需

```env
COZE_INTEGRATION_BASE_URL=https://integration.coze.cn
COZE_INTEGRATION_MODEL_BASE_URL=https://integration.coze.cn
COZE_BUCKET_ENDPOINT_URL=https://yyy.r2.cloudflarestorage.com
COZE_BUCKET_NAME=soulmate9-media
OSS_ENDPOINT=https://yyy.r2.cloudflarestorage.com
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=soulmate9-media
```

### LLM 主路由（Coze）

```env
COZE_BOT_ID=xxx
COZE_DEFAULT_MODEL=doubao-seed-2-0-pro-250715
COZE_LITE_MODEL=doubao-seed-2-0-lite-250715
COZE_MINI_MODEL=doubao-seed-2-0-mini-250715
```

### LLM 兜底（Claude，可选）

```env
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_FALLBACK_MODEL=claude-3-5-haiku-20241022
```

### 本地 Llama（可选，情绪检测）

```env
LOCAL_LLAMA_BASE_URL=http://localhost:11434
LOCAL_LLAMA_MODEL=llama3.1:8b
```

### RunPod FLUX 图片生成

```env
RUNPOD_API_KEY=rpa_xxx
RUNPOD_ENDPOINT_ID=xxxxxxxx
RUNPOD_POLL_TIMEOUT_MS=360000
RUNPOD_POLL_INTERVAL_MS=3000
```

### Stripe 订阅

```env
STRIPE_SECRET_KEY=sk_live_xxx   # 生产用 live key
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_PRICE_PRO=price_xxx
STRIPE_PRICE_UNLIMITED=price_xxx
```

### Cron 鉴权

```env
CRON_SECRET=$(openssl rand -hex 32)   # 生成 64 位随机串
```

### 可选：监控 & 通知

```env
# Sentry（可选）
SENTRY_DSN=https://xxx@sentry.io/123
SENTRY_AUTH_TOKEN=sntrys_xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/123

# PostHog（可选）
POSTHOG_API_KEY=phc_xxx
POSTHOG_HOST=https://us.i.posthog.com
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Resend 邮件（强烈建议开）
RESEND_API_KEY=re_xxx
EMAIL_FROM=Soulmate9 <hello@soulmateai.shop>
ADMIN_ALERT_EMAIL=admin@soulmateai.shop

# Web Push（可选）
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BP...
VAPID_PRIVATE_KEY=xxx
VAPID_SUBJECT=mailto:admin@soulmateai.shop

# Google Analytics（可选）
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

### 应用配置

```env
NEXT_PUBLIC_APP_URL=https://soulmateai.shop
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
ENABLE_DEBUG_ROUTES=false   # 生产必须 false
```

> ⚠️ **生产环境务必设置 `ENABLE_DEBUG_ROUTES=false`**，否则 `/api/admin/db-debug` 和 `/api/admin/key-debug` 会暴露 DB schema 和密钥前缀。

### 变量验证脚本

部署后跑：
```bash
curl https://soulmateai.shop/api/admin/env-check  # 如果有这个路由
```

或者本地：
```bash
node -e "require('dotenv').config(); Object.keys(process.env).filter(k=>k.startsWith('NEXT_PUBLIC')||k.startsWith('STRIPE')||k.startsWith('COZE')).forEach(k=>console.log(k, '=', process.env[k]?.slice(0,20)+'...'))"
```

---

## 5. 域名 soulmateai.shop 绑定

### 方案 A：通过 Cloudflare 代理（推荐）

1. Cloudflare Dashboard → 选中 `soulmateai.shop`
2. **DNS** → 添加记录：
   ```
   类型: CNAME
   名称: @
   目标: xxx.up.railway.app
   代理状态: 已代理（橙色云朵）
   ```
3. Railway Dashboard → Project → **Settings** → **Domains**
4. **Custom Domain** → 输入 `soulmateai.shop` → **Add**
5. Railway 自动签发 Let's Encrypt 证书
6. 等待 5-10 分钟 DNS 传播

### 方案 B：不通过 Cloudflare

1. 域名注册商（Namecheap / Porkbun 等）→ DNS 设置
2. 添加 CNAME：`@` → `xxx.up.railway.app`
3. Railway 加 Custom Domain（同上步骤 3-5）

### 子域名约定

| 子域 | 用途 |
|---|---|
| `soulmateai.shop` | 主站 |
| `api.soulmateai.shop` | API（可选，简化 CORS） |
| `admin.soulmateai.shop` | 管理后台（建议 IP 白名单） |
| `cdn.soulmateai.shop` | 自建 CDN（可选） |

---

## 6. Stripe webhook 重新配置

部署到生产后，Stripe webhook 必须重新指向新域名：

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add Endpoint**
2. **Endpoint URL**: `https://soulmateai.shop/api/stripe/webhook`
3. **Events to send**: 勾选
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. 保存后复制 **Signing secret**（`whsec_xxx`）
5. 回到 Railway Variables，更新 `STRIPE_WEBHOOK_SECRET`

### 测试 webhook

```bash
stripe trigger checkout.session.completed
# 观察 Railway 日志应该有：
# [stripe-webhook] processed checkout.session.completed
```

或在 Stripe Dashboard → Webhooks → 选 endpoint → **Send test event**。

---

## 7. 首发验证清单

按顺序跑，每步通过再下一步：

### 7.1 基础健康

```bash
curl -I https://soulmateai.shop
# 期望：200 OK
```

### 7.2 数据库迁移（生产 Supabase）

第一次部署必须跑迁移：

```bash
# 方式 1：psql 直连
psql $COZE_SUPABASE_URL -f db/migrations/0001_generation_cache.sql
psql $COZE_SUPABASE_URL -f db/migrations/0002_db_optimization.sql
psql $COZE_SUPABASE_URL -f db/migrations/0003_user_onboarding.sql

# 方式 2：Supabase SQL Editor 逐个执行
```

### 7.3 Auth 流

- [ ] 访问 `/register` → 注册新账号
- [ ] 邮箱收到验证邮件（确认 Resend 配置）
- [ ] 登录后跳转到 `/onboarding` 或首页
- [ ] 退出登录后访问 `/chat` → 跳到 `/login`

### 7.4 LLM 对话

- [ ] 创建/选择一个女友
- [ ] 发送"hello"消息
- [ ] 收到流式回复（SSE / 打字机效果）
- [ ] PostHog 收到 `chat_message_sent` 事件

### 7.5 图片生成

- [ ] 在聊天里触发图片生成
- [ ] 等待 RunPod 返回（30-60s）
- [ ] 图片显示在对话流
- [ ] 第二次相同 prompt → 命中缓存（< 5s 返回）

### 7.6 Stripe 订阅

- [ ] 进入 `/pricing` 或 `/subscription`
- [ ] 点击 Subscribe → 跳转 Stripe Checkout
- [ ] 用测试卡 `4242 4242 4242 4242` 完成支付
- [ ] 跳回网站，订阅状态变 `active`
- [ ] Webhook 收到 `checkout.session.completed`
- [ ] PostHog 收到 `subscription_started`

### 7.7 PWA

- [ ] Chrome DevTools → Application → Service Workers → 看到 `/sw.js` 已激活
- [ ] 断网后刷新 → 显示离线页面
- [ ] Lighthouse PWA 评分 > 90

### 7.8 Cron 触发

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://soulmateai.shop/api/cron/cleanup-cache
# 期望：{"ok":true,"deleted":N}
```

### 7.9 监控接入

- [ ] Sentry Dashboard → Issues → 故意制造 500 → 确认收到
- [ ] PostHog Dashboard → Activity → 看到页面浏览事件

### 7.10 性能冒烟

```bash
# 首页 LCP
curl -o /dev/null -s -w "%{time_total}s\n" https://soulmateai.shop
# 期望 < 3s

# 公开女友页 ISR
curl -o /dev/null -s -w "%{time_total}s\n" https://soulmateai.shop/girlfriend/some-slug
# 期望 < 1.5s（缓存命中）
```

---

## 8. 回滚方案

### 8.1 Railway 回滚（代码）

Railway Dashboard → Deployments → 选上一个稳定版本 → **Redeploy**

回滚时间：30 秒（容器重建）

### 8.2 数据库回滚

每次迁移前自动备份（Supabase 项目设置 → Database → Backups）。

```sql
-- 假设回滚 0003_user_onboarding
DROP TABLE IF EXISTS user_onboarding;
```

### 8.3 环境变量回滚

Railway Variables → Raw Editor → 有版本历史 → 选上一个 → Restore

---

## 9. NSFW 内容合规

soulmate9 定位包含 **高 NSFW 对话与图片**。部署层面做了 3 层防护：

### 9.1 内容存储私有化

所有用户上传 / AI 生成的图片存储在 **Cloudflare R2 私有 bucket**，**仅签名 URL 访问**，未授权第三方 CDN 不会扫描：

- ✅ R2 私有 bucket 不被 Cloudflare 图像审核扫描
- ✅ `next/image` 设 `unoptimized: true`（已在 `next.config.ts`），图片不经过 Vercel 优化 CDN
- ✅ 30 天签名 URL 缓存层（`src/lib/storage.ts`）避免重复打源

### 9.2 LLM 输出端

- 主路由 **Coze Doubao Pro** — 对 NSFW 容忍度高
- 兜底 **Claude 3.5 Haiku** — Anthropic 对成人内容容忍度高于 OpenAI
- 极端情况降级到 **本地 Llama 3.1 8B** — 完全自由

### 9.3 用户协议层

- `/terms` 页面已声明：仅限 18+ 用户、内容为虚构角色、所有对话不构成真实关系
- `/privacy` 页面声明：NSFW 内容存储在加密私有 bucket、不会用于训练、用户可随时删除

### 9.4 平台政策风险

| 平台 | NSFW 政策 | 风险等级 |
|---|---|---|
| Railway | 允许合法成人内容 | 🟢 低 |
| Stripe | NSFW 灰色地带，可能封号 | 🟡 中 — 必须有 Crypto 备选 |
| Cloudflare R2 | 私有 bucket 不扫描 | 🟢 低 |
| Resend | 允许 | 🟢 低 |

**应对策略**：
- Stripe 为主，但保留 `crypto/initiate / orders / submit` 3 个端点作为 NSFW 高消费用户备选
- 不主动宣传"高 NSFW" 字眼（避免 Stripe 风控关键词触发）
- 预留迁移到 CCBill / SegPay 的接口（`/api/payment/alt`）

---

## 相关文档

- [SETUP.md](./SETUP.md) — 本地开发环境
- [RUNBOOK.md](./RUNBOOK.md) — 运维手册
- [DESIGN.md](./DESIGN.md) — 架构设计
- [../OPTIMIZATION.md](../OPTIMIZATION.md) — 优化进度