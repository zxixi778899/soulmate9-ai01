# Soulmate9 — Vercel → Railway 迁移执行手册

> 状态:**进行中**(2026-07-14 起)
> 触发原因:Vercel 项目 `soulmate9-ao01` 在表层完全健康(Production Checklist 3/5 全绿、用量图全在配额内、无 Suspended 横幅、无未付账单),但所有部署入口(git push、Disconnect/Connect 重连、Deploy Hook)都被静默拒绝 —— Deployments 列表 21 小时没新条目。本文档记录迁移步骤。

---

## 0. TL;DR

- **保留**:Vercel 项目不动(避免破坏 `soulmateai.shop` 当前在跑的服务)
- **新建**:Railway 项目 `soulmate9-railway`,从同一个 GitHub 仓库 `zxixi778899/soulmate9-ai01` 的 `main` 分支部署
- **切换域名**:把 Cloudflare 上 `soulmateai.shop` 和 `www.soulmateai.shop` 的 DNS 从 Vercel 切到 Railway
- **保留**:GitHub 仓库、`.env.local`、本地开发流程 —— 都不变
- **替代**:Vercel Cron → GitHub Actions(已在 `.github/workflows/` 下创建)

---

## 1. 准备清单

| 项 | 状态 | 来源 |
|---|---|---|
| GitHub 仓库 | ✅ 已有 | `zxixi778899/soulmate9-ai01`,main HEAD = `3b7be21` |
| Dockerfile | ✅ 已有 | 仓库根目录,多阶段构建,Next.js standalone |
| railway.json | ✅ 已有 | 仓库根目录,Dockerfile builder + healthcheck |
| src/server.ts | ✅ 备用 | 当前未启用,Dockerfile 走 standalone(server.js) |
| 4 个 GitHub Actions cron | ✅ 已创建 | `.github/workflows/cron-*.yml` |
| CRON_SECRET | 待定 | 需在 GitHub Secrets 和 Railway 两侧同步设置 |
| Railway 账号 | 待创建 | https://railway.app(用 GitHub 登录) |
| 全部环境变量 | 部分已知 | 见下方第 3 节 |

---

## 2. Railway 一键部署(15-30 分钟)

### Step 1:登录 Railway 并新建项目

1. 打开 https://railway.app/dashboard
2. 用 **GitHub 登录**(用同一个 GitHub 账号,`zxixi778899`)
3. 点 **New Project** → **Deploy from GitHub repo**
4. 选 `zxixi778899/soulmate9-ai01`
5. Railway 检测到 `Dockerfile` → 自动开始构建

### Step 2:首次部署配置

打开新建项目的服务:

1. **Settings → General**
   - Service Name:`soulmate9-railway`
   - Region:`US West`(默认即可)

2. **Settings → Networking**
   - 点 **Generate Domain** 让 Railway 给你一个 `*.up.railway.app` 域名(临时访问用)
   - **不要急着切 soulmateai.shop**,先让 Railway 跑通

3. **Settings → Source**
   - Branch:`main`
   - **Build Command**:留空(用 Dockerfile 默认)
   - **Watch Paths**:留空(默认监控所有 push)

4. **Settings → Variables**(这是最关键的)
   - 点 **Raw Editor** → 粘贴下面的变量清单 → 填好真实值 → **Add**

### Step 3:等首次构建完成

- Build 日志会显示 `pnpm build` 跑 5-8 分钟
- 完成后 Deploy Logs 会显示 `> Server listening at http://0.0.0.0:3000`
- 临时域名(`*.up.railway.app`)应该能打开,首页可见

### Step 4:健康检查

```bash
curl -sS https://<临时域名>/api/health | python -m json.tool
```

应当看到 `ok: true`、`build.sha` 是某个 commit(不是 null,不是 dev),`checks.supabase.ok: true`。

如果 `build.sha` 是 null → 说明构建时 `VERCEL_GIT_COMMIT_SHA` 没被注入,Railway 不自动注入这个环境变量,需要靠 git commit 时间推断(后续可优化)。

---

## 3. 环境变量清单

> **策略**:从 Vercel 项目 `soulmate9-ao01` → Settings → Environment Variables 把现有变量**全部**复制过来。Railway 与 Vercel 不共享环境变量,必须重新填一遍。

### 3.1 必须设置(否则核心功能挂)

#### Supabase Auth(浏览器登录用)
```
NEXT_PUBLIC_SUPABASE_URL=https://vvblrkngzuyxeeoslzkl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_7YIlnWCPFcTez5gK6pvRtA_zNPFC8LX
```

#### Supabase 数据(走 Coze proxy,服务端用)
```
NEXT_PUBLIC_COZE_SUPABASE_URL=https://vvblrkngzuyxeeoslzkl.supabase.co
NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY=sb_publishable_7YIlnWCPFcTez5gK6pvRtA_zNPFC8LX
COZE_SUPABASE_URL=https://vvblrkngzuyxeeoslzkl.supabase.co
COZE_SUPABASE_ANON_KEY=sb_publishable_7YIlnWCPFcTez5gK6pvRtA_zNPFC8LX
COZE_SUPABASE_SERVICE_ROLE_KEY=<从 Vercel 复制,或用 Supabase Dashboard → Settings → API → service_role 重新生成>
COZE_SUPABASE_DB_URL=placeholder_postgres_connection_string
```

#### RunPod(图生 / LLM)
```
RUNPOD_API_KEY=rpa_...
RUNPOD_ENDPOINT_ID=...
RUNPOD_VLLM_URL=https://api.runpod.ai/v2/t3epwpytfgadr5
RUNPOD_VLLM_API_KEY=rpa_...
RUNPOD_VLLM_MODEL=NeverSleep/Llama-3-Lumimaid-8B-v0.1
```

#### Coze LLM 主路由
```
COZE_WORKLOAD_IDENTITY_API_KEY=...
COZE_WORKLOAD_IDENTITY_CLIENT_SECRET=...
COZE_AUTH_BASE_URL=https://api.coze.cn
COZE_INTEGRATION_BASE_URL=https://integration.coze.cn
COZE_INTEGRATION_MODEL_BASE_URL=https://integration.coze.cn
```

#### Stripe
```
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
```

#### App URLs
```
NEXT_PUBLIC_APP_URL=https://www.soulmateai.shop
NEXT_PUBLIC_SITE_URL=https://www.soulmateai.shop
```

#### Cron 鉴权(自己生成)
```bash
openssl rand -hex 32
# 把输出设到:
CRON_SECRET=<刚生成的 hex>
```

#### 运行时
```
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0
LOG_LEVEL=info
ENABLE_DEBUG_ROUTES=false
```

### 3.2 强烈建议(否则降级但能用)

```
# LLM 兜底
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_FALLBACK_MODEL=claude-3-5-haiku-20241022

# Upstash Redis(限流,否则单实例内存限流)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...

# Resend 邮件
RESEND_API_KEY=re_...
EMAIL_FROM=...
ADMIN_ALERT_EMAIL=...
```

### 3.3 可选(无则功能关闭)

```
# Sentry
SENTRY_DSN=https://...@sentry.io/...
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_TRACES_SAMPLE_RATE=0.1

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Web Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@soulmateai.shop

# NOWPayments(加密支付)
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...
NOWPAYMENTS_PAY_CURRENCY=usdttrc20
```

完整变量名清单(无值)见 `docs/railway-env-template.env`,以及仓库根 `.env.example`。

---

## 4. GitHub Actions cron 配置

4 个 yml 文件已在 `.github/workflows/` 下创建。每个 yml 需要 2 个 GitHub Secrets:

### Step 1:添加 Secrets

打开 https://github.com/zxixi778899/soulmate9-ai01/settings/secrets/actions → **New repository secret**:

| Name | Value | 说明 |
|---|---|---|
| `CRON_SECRET` | 同 Railway 上的 `CRON_SECRET` | GitHub Actions 调用 /api/cron 时附 `Authorization: Bearer <CRON_SECRET>`,必须与服务器一致 |
| `APP_URL` | `https://www.soulmateai.shop` | 服务器 base URL。**等域名切到 Railway 之后再设**,否则会打到旧 Vercel |

### Step 2:首次手动触发测试

打开任一 workflow(例如 `.github/workflows/cron-cleanup-cache.yml`)→ 点 **Run workflow** → 检查日志 → 应看到 `HTTP=200` 或类似的成功响应。

### Step 3:等待定时触发

cron 触发时间:
| Workflow | 时间(UTC) | 北京时间 |
|---|---|---|
| cron-subscription-reminder | 09:00 | 17:00 |
| cron-re-engagement | 14:00 | 22:00 |
| cron-daily-proactive | 08:00 / 14:00 / 20:00 | 16:00 / 22:00 / 04:00 |
| cron-cleanup-cache | 03:00 | 11:00 |

---

## 5. 域名切换(等 Railway 跑稳后做)

### Step 1:Cloudflare 添加新记录

打开 https://dash.cloudflare.com → 选 `soulmateai.shop` → DNS → Records:

**新增**:
```
类型: CNAME
名称: @
内容: <Railway 提供的 *.up.railway.app 域名>
代理: 开(橙色云朵)
TTL: Auto
```

```
类型: CNAME
名称: www
内容: <Railway 提供的 *.up.railway.app 域名>
代理: 开(橙色云朵)
TTL: Auto
```

**保留**(暂时)**:**Vercel 的 A 记录不动**,等切完确认 OK 再删。

### Step 2:Railway 加自定义域名

1. Railway 项目 → Settings → Networking → Custom Domain
2. 添加 `soulmateai.shop` 和 `www.soulmateai.shop`
3. Railway 会要求 DNS 已经指向它,验证通过即可

### Step 3:验证

- `curl https://www.soulmateai.shop/api/health` → `build.sha` 应该是 Railway 最新部署的 commit
- `curl https://www.soulmateai.shop/api/gifts` → 应该返回完整礼物数据
- 浏览器硬刷新 `Ctrl+Shift+R`,确认 UI 是新版本

### Step 4:删除 Cloudflare 上的 Vercel 记录

等验证 1-2 天没问题后,删除 Cloudflare 上指向 Vercel 的 A 记录。

---

## 6. Stripe webhook 重新配置

Vercel 项目里 Stripe webhook 指向 `https://www.soulmateai.shop/api/stripe/webhook`。Railway 上同样路径仍然有效,**只要域名不变,webhook URL 就不用改**。

但:
- Stripe webhook secret 取决于 endpoint,理论上不变
- 如果之后切换到 Railway 专有域名(不是 `soulmateai.shop`),需要去 Stripe Dashboard 改 endpoint

---

## 7. Vercel 项目处置

**不建议立刻删 Vercel**,因为:
- 域名 DNS 切换需要时间(Cloudflare 缓存)
- 保留 Vercel 作为应急回滚(如果 Railway 出问题,切回 Vercel)

**30 天后如果 Railway 稳定**:
1. 把 Vercel 项目 `soulmate9-ao01` 的 Environment Variables 备份到本地
2. Vercel 项目 → Settings → General → 最下方 **Delete Project**
3. 删除 GitHub 上的 Vercel GitHub App 授权(去 https://github.com/settings/installations)

**保留**:
- `vercel.json`(如果以后切回 Vercel 还能用)
- `Dockerfile`(标准化,任何平台都能用)

---

## 8. 首发验证清单(必跑)

迁移后**第一天**跑完这些,确认无回归:

### 8.1 健康与版本
```bash
# 健康检查
curl -sS https://www.soulmateai.shop/api/health | python -m json.tool

# 应当看到:
# - ok: true
# - build.sha: <7位 commit hash>
# - build.branch: "main"
# - build.environment: "production"   ← 注意不是 "development"
# - checks.supabase.ok: true
# - checks.upstash: 没有 error 或 ok:true
```

### 8.2 核心 API
```bash
# 礼物 API(应返回 11+ 条礼物)
curl -sS https://www.soulmateai.shop/api/gifts | python -c "import sys,json; d=json.load(sys.stdin); print(f'gifts count: {len(d[\"gifts\"])}')"

# 公开女友列表
curl -sS https://www.soulmateai.shop/api/girlfriends/public | python -c "import sys,json; d=json.load(sys.stdin); print(f'public GFs: {len(d.get(\"girlfriends\", []))}')"
```

### 8.3 浏览器 smoke test
1. 打开 https://www.soulmateai.shop(硬刷新 `Ctrl+Shift+R`)
2. 18+ 年龄验证弹窗
3. 落地页 → 看到 10+ 个女友卡
4. 选一个女友 → 进入详情页
5. 注册/登录 → 进聊天
6. 发送一条消息 → 看到流式回复

### 8.4 Cron 验证
1. GitHub Actions 手动触发 `cron-cleanup-cache`
2. 日志应显示 `HTTP=200` 或类似成功
3. 之后等定时触发,确认 Actions 列表出现绿色 ✓

### 8.5 Railway Logs
1. Railway Dashboard → 项目 → Logs
2. 看是否有红色 error
3. Function logs(如果有)应该看到 /api/gifts 等成功响应

---

## 9. 应急回滚(如果 Railway 出问题)

1. 打开 Cloudflare DNS → 暂时改回 Vercel 记录(或者改 TTL 让它快速失效)
2. 在 Vercel 项目 `soulmate9-ao01` → Deployments → 找到最新 Ready 部署 → ⋯ → **Promote to Production**
3. Vercel 域名解析通常 5-10 分钟生效
4. **注意**:Vercel 上还是 `bf04888` 的产物(老代码),不能拿到最新改动,但至少站点能访问

如果 Railway 严重故障(完全不能启动),可以:
1. 在 Railway 项目 → Settings → Danger → **Delete Service**
2. 重新按本文档 Step 2 部署

---

## 10. 长期优化(可选,不紧急)

### 10.1 数据持久化

当前 6 个 admin 文件用 `data/*.json` 写到容器磁盘。容器重启数据丢失,但都有 DB 兜底。

**优化**:挂 Railway Volume
1. Railway → 服务 → Settings → Volumes → Add Volume
2. Mount Path: `/app/data`
3. Size: 1 GB(够用很久)
4. 重启服务

这样 admin 配置持久化。

### 10.2 减少冷启动

Railway Hobby 默认会空闲时休眠 → 冷启动 1-3 秒。
- 升 Pro($5/月)→ 持续运行
- 或者用 cron-job.org 每 5 分钟 ping 一次 `/api/health`,保持唤醒

### 10.3 镜像瘦身

Dockerfile 当前 ~150MB。可以优化:
- 用 `output: 'standalone'` + `outputFileTracingIncludes` 排除 node_modules 子集
- 用 multi-stage 把 devDependencies 剔除

但当前 150MB 在 Railway 上完全够用,不急。

---

## 11. 不要做的事

- ❌ **不要删 Vercel 项目**,至少保留 30 天作为回滚
- ❌ **不要立刻切域名**,先用 Railway 的 `*.up.railway.app` 临时域名验证
- ❌ **不要在 Railway 上覆盖 Dockerfile**,Dockerfile 已经为 Railway 设计过(`Plan K: Bake NEXT_PUBLIC_*` 的 printenv 逻辑)
- ❌ **不要在 GitHub Actions 里硬编码 CRON_SECRET**,用 Secrets
- ❌ **不要让多个 Railway 服务共享同一个 GitHub 仓库分支**,会触发竞态构建