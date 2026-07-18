#!/usr/bin/env bash
set -Eeuo pipefail

exec /usr/local/bin/llama-server \
  --host 0.0.0.0 \
  --port 8000 \
  --model "${MODEL_PATH}" \
  --alias "${SERVED_MODEL_NAME}" \
  --ctx-size "${CONTEXT_SIZE}" \
  --parallel "${PARALLEL_SLOTS}" \
  --n-gpu-layers 99 \
  --flash-attn on \
  --cont-batching \
  --jinja \
  --metrics
