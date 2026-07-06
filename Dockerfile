# ============================================================
# Soulmate9 �?Production Dockerfile
# 多阶段构建：deps �?build �?runner
# 目标平台：Railway / 自托�?VPS
# 输出镜像：node:20-alpine，~150MB
# ============================================================

# ─────────────────────────── Stage 1: deps ───────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 单独拷贝 lockfile 利用 Docker 层缓�?COPY package.json pnpm-lock.yaml* ./
# Railway build 不能�?frozen-lockfile（worktree 可能�?HEAD lockfile 不一致）�?# 用普�?install，pnpm 会自动同�?lockfile 然后 install
RUN pnpm install --prefer-offline


# ─────────────────────────── Stage 2: builder ───────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# �?deps 复制 node_modules（已包含 devDeps�?COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js standalone 构建需�?telemetry 关掉
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# ── Plan K: Bake NEXT_PUBLIC_* into the client bundle ──
# Railway does NOT auto-pass NEXT_PUBLIC_* vars to Docker build ARGs
# (only DOCKERFILE BUILDKIT args, not service env).
# Strategy: printenv �?grep NEXT_PUBLIC_ �?write .env.production.
# Next.js automatically loads .env.production at build time, which causes
# it to inline NEXT_PUBLIC_* values into the client bundle (correct behavior).
#
# All NEXT_PUBLIC_* vars must be set as Service Variables on Railway
# (Settings �?Variables). They become part of the build ENV.
RUN printenv | grep -E '^NEXT_PUBLIC_' | tee .env.production && echo "=== .env.production has $(wc -l < .env.production) lines ==="

# 构建（standalone 输出�?.next/standalone�?# 清掉 Next.js build cache，避�?Railway builder image cache 提供�?source
# NUCLEAR: Force cache miss with timestamp
ARG CACHE_BUST=unknown
RUN echo "Cache bust: $CACHE_BUST $(date)" && rm -rf .next node_modules/.cache && pnpm build


# ─────────────────────────── Stage 3: runner ───────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# 基础系统依赖（curl 用于 healthcheck，wget 作为 fallback�?RUN apk add --no-cache curl dumb-init

# �?root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# 复制 standalone 输出（包�?server.js + node_modules 子集�?COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 复制 public + .next/static（standalone 不会自动包含�?COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Railway / 自托管默�?3000
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
