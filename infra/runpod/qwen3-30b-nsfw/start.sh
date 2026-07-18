#!/usr/bin/env bash
set -Eeuo pipefail

readonly MODEL_ID="TheHighKage/Qwen3-30B-A3B-abliterated-erotic"
readonly MODEL_REVISION="b207f2bc7564af696607f4b24e1f728b07af5392"
readonly SERVED_MODEL_NAME="soulmate-qwen3-30b-roleplay"

cleanup() {
  if [[ -n "${VLLM_PID:-}" ]]; then
    kill "${VLLM_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

python3 -m vllm.entrypoints.openai.api_server \
  --host 127.0.0.1 \
  --port 8000 \
  --model "${MODEL_ID}" \
  --revision "${MODEL_REVISION}" \
  --tokenizer "${MODEL_ID}" \
  --tokenizer-revision "${MODEL_REVISION}" \
  --served-model-name "${SERVED_MODEL_NAME}" \
  --max-model-len 8192 \
  --max-num-seqs 16 \
  --gpu-memory-utilization 0.90 \
  --dtype auto \
  --enable-prefix-caching \
  --trust-remote-code &
VLLM_PID=$!

exec nginx -g 'daemon off;'
