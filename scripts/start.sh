#!/bin/sh
# Production start script — used by `npm start` and as a fallback when Railway
# ignores the Dockerfile CMD and railway.json startCommand.
#
# This script is intentionally minimal: it just exec's the standalone
# Next.js server with dumb-init so PID 1 / signal handling works correctly.

set -e

# PORT default 3000 (overridden by Railway env at runtime)
PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"

echo "[start.sh] Booting Next.js standalone server on ${HOSTNAME}:${PORT}"

exec dumb-init -- node server.js
