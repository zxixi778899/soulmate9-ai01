# ============================================================
# Soulmate9 生产 Dockerfile
# 多阶段构建：deps → builder → runner
# 目标平台：Railway / 自托管 VPS
# 输出镜像：node:20-alpine，~150MB
# ============================================================

# ─────────────────────────── Stage 1: deps ───────────────────────────
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 单独拷贝 lockfile 利用 Docker 层缓存
COPY package.json pnpm-lock.yaml* ./
RUN rm -rf /app/node_modules/.cache && pnpm install --prefer-offline

# ─────────────────────────── Stage 2: builder ───────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# 将 deps 复制 node_modules（已包含 devDeps）
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 确保依赖项完整
RUN pnpm install && pnpm list

# Next.js standalone 构建需要关闭 telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV SOULMATE_STANDALONE=1

# ── Plan K: Bake NEXT_PUBLIC_* into the client bundle ──
# Railway does NOT auto-pass NEXT_PUBLIC_* vars to Docker build ARGs
# (only Dockerfile BUILDKIT args, not service env).
# Strategy: printenv | grep NEXT_PUBLIC_ -> write .env.production.
# Next.js automatically loads .env.production at build time, which causes
# it to inline NEXT_PUBLIC_* values into the client bundle (correct behavior).
#
# All NEXT_PUBLIC_* vars must be set as Service Variables on Railway
# (Settings -> Variables). They become part of the build ENV.
RUN printenv | grep -E '^NEXT_PUBLIC_' | tee .env.production && echo "=== .env.production has $(wc -l < .env.production) lines ==="

# 构建
ARG CACHE_BUST=unknown
RUN echo "Cache bust: $CACHE_BUST $(date)" && rm -rf .next node_modules/.cache && pnpm build

# ─────────────────────────── Stage 3: runner ───────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# 基础系统依赖（curl 用于 healthcheck，dumb-init 用于正确的 PID 1 信号处理）
RUN apk add --no-cache curl dumb-init

# 使用非 root 用户运行（安全最佳实践）
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# 复制 standalone 输出（包含 server.js + node_modules 子集）
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
# 复制 public + .next/static（standalone 不会自动包含这两者，缺失会导致静态资源 404）
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

# Railway / 自托管默认的 PORT=3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE 3000

# 启动命令
CMD ["sh", "-c", "PORT=3000 HOSTNAME=0.0.0.0 exec dumb-init node server.js"]

# ─────────────────────────── Healthcheck ───────────────────────────
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1
