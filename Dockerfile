# ============================================================
# Soulmate9 — Production Dockerfile
# 多阶段构建：deps → build → runner
# 目标平台：Railway / 自托管 VPS
# 输出镜像：node:20-alpine，~150MB
# ============================================================

# ─────────────────────────── Stage 1: deps ───────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 单独拷贝 lockfile 利用 Docker 层缓存
COPY package.json pnpm-lock.yaml* ./
# Railway build 不能用 frozen-lockfile（worktree 可能跟 HEAD lockfile 不一致），
# 用普通 install，pnpm 会自动同步 lockfile 然后 install
RUN pnpm install --prefer-offline


# ─────────────────────────── Stage 2: builder ───────────────────────────
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 从 deps 复制 node_modules（已包含 devDeps）
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js standalone 构建需要 telemetry 关掉
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# ── Plan G: Bake NEXT_PUBLIC_* vars into the client bundle at build time ──
# Without these, createClient(undefined) throws on hydration.
# Railway passes ARGs via "Builder ENV" in service settings, OR via API/programmatic deploys.
# We default them to empty so standalone build always succeeds.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_COZE_SUPABASE_URL
ARG NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_GA_ID
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST

ENV NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL} \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_COZE_SUPABASE_URL=${NEXT_PUBLIC_COZE_SUPABASE_URL} \
    NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY=${NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY} \
    NEXT_PUBLIC_GA_ID=${NEXT_PUBLIC_GA_ID} \
    NEXT_PUBLIC_POSTHOG_KEY=${NEXT_PUBLIC_POSTHOG_KEY} \
    NEXT_PUBLIC_POSTHOG_HOST=${NEXT_PUBLIC_POSTHOG_HOST}

# 构建（standalone 输出在 .next/standalone）
RUN pnpm build


# ─────────────────────────── Stage 3: runner ───────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# 基础系统依赖（curl 用于 healthcheck，wget 作为 fallback）
RUN apk add --no-cache curl dumb-init

# 非 root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# 复制 standalone 输出（包含 server.js + node_modules 子集）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 复制 public + .next/static（standalone 不会自动包含）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Railway / 自托管默认 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# Use sh -c to override PORT before launching server.js
# Railway injects PORT=8080 by default; our Dockerfile healthcheck assumes 3000,
# so we explicitly set PORT=3000 to make standalone use the same port as healthcheck.
CMD ["sh", "-c", "PORT=3000 HOSTNAME=0.0.0.0 exec node server.js"]


# ─────────────────────────── Healthcheck ───────────────────────────
# Railway 用此判断容器健康
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
