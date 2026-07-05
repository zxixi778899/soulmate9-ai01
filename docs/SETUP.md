# Soulmate9 — SETUP

> 5 分钟启动开发环境。所有命令假定你在项目根目录。

## 1. 环境要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | Next.js 16 + React 19 |
| pnpm | ≥ 9 | 包管理（仓库强制 pnpm） |
| Docker | latest | 本地 Postgres + Redis（可选） |

## 2. 克隆 + 安装

```bash
git clone <repo-url> soulmate9
cd soulmate9
pnpm install
```

## 3. 环境变量

复制 `.env.example` → `.env.local`，填入以下必填项：

```env
# === Auth Supabase（用户登录） ===
NEXT_PUBLIC_AUTH_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_AUTH_SUPABASE_ANON_KEY=eyJhbGc...

# === Coze Proxy Supabase（业务数据） ===
NEXT_PUBLIC_COZE_SUPABASE_URL=https://yyy.supabase.co
COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
COZE_WORKLOAD_IDENTITY_API_KEY=pat_xxx

# === LLM 主路由（Coze） ===
COZE_INTEGRATION_BASE_URL=https://integration.coze.cn
COZE_INTEGRATION_MODEL_BASE_URL=https://integration.coze.cn

# === LLM 兜底（Claude，可选） ===
ANTHROPIC_API_KEY=sk-ant-xxx
CLAUDE_FALLBACK_MODEL=claude-3-5-haiku-20241022

# === 本地 Llama（可选，情绪检测） ===
LOCAL_LLAMA_BASE_URL=http://localhost:11434
LOCAL_LLAMA_MODEL=llama3.1:8b

# === RunPod FLUX 图片生成 ===
RUNPOD_API_KEY=rpa_xxx
RUNPOD_ENDPOINT_ID=xxxxxxxx

# === Stripe 订阅 ===
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx

# === 存储（OSS / R2） ===
OSS_ENDPOINT=https://xxx.r2.cloudflarestorage.com
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=soulmate9-media

# === Cron 鉴权 ===
CRON_SECRET=$(openssl rand -hex 32)

# === 可选：Sentry / PostHog / Resend / Web Push ===
SENTRY_DSN=https://xxx@sentry.io/123
POSTHOG_API_KEY=phc_xxx
NEXT_PUBLIC_POSTHOG_KEY=phc_xxx
RESEND_API_KEY=re_xxx
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BP...
VAPID_PRIVATE_KEY=xxx
```

## 4. 数据库迁移

```bash
# 跑全部 migration
psql $DATABASE_URL -f db/migrations/0001_generation_cache.sql
psql $DATABASE_URL -f db/migrations/0002_db_optimization.sql
psql $DATABASE_URL -f db/migrations/0003_user_onboarding.sql

# 或者通过 Supabase SQL Editor 逐个执行
```

## 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:3000

## 6. 验证

```bash
pnpm ts-check         # TypeScript 编译检查
pnpm lint             # ESLint
pnpm test             # Vitest 单测
pnpm build            # 生产构建
```

## 7. 常见问题

### Q: Coze API 报 "Failed to authenticate"
A: 检查 `COZE_WORKLOAD_IDENTITY_API_KEY` 是否设置。也可以走 Python SDK：
```bash
pip install coze-workload-identity
```

### Q: RunPod 提交后超时
A: 检查 endpoint 是否活跃；FLUX 模型约需 30-60s/张。轮询间隔 3s × 120 = 6min 上限。

### Q: 公开页图片不显示
A: 检查 `OSS_ACCESS_KEY_*` 配置；签名 URL 30 天有效。

---

下一步：[RUNBOOK.md](./RUNBOOK.md)（运维手册）/ [DESIGN.md](./DESIGN.md)（架构设计）