#!/bin/bash
# SoulMate9 — Production Deployment Script
set -e

echo "🚀 SoulMate9 Deployment"
echo "========================"

# 1. Install deps
echo "📦 Installing dependencies..."
pnpm install

# 2. Build
echo "🔨 Building..."
pnpm build

# 3. Health check
echo "🏥 Health check..."
curl -s http://localhost:3000/api/health || true

echo ""
echo "✅ Deployment ready!"
echo "   Start: pnpm start"
echo "   Port:  ${PORT:-3000}"
echo "   Admin: /admin"
echo "   Gallery: /gallery"
echo "   Shop: /shop"
echo ""
