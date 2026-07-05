#!/usr/bin/env bash
# 本地开发服务器启动脚本
# 调用 next dev，让 'pnpm run dev' / 'npm run dev' 真正可用
# 之前 package.json 指向本文件但本文件不存在，本提交补上
set -e
cd "$(dirname "$0")/.."
exec npx next dev -p 5000
