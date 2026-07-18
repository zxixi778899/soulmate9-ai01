FROM python:3.12-slim AS model

ARG MODEL_REPO=lukey03/Qwen3.5-9B-abliterated-GGUF
ARG MODEL_FILE=Qwen3.5-9B-abliterated-Q4_K_M.gguf
ARG MODEL_REVISION=dac35c6

RUN pip install --no-cache-dir "huggingface_hub==0.36.0"
RUN python -c "from huggingface_hub import hf_hub_download; hf_hub_download(repo_id='${MODEL_REPO}', filename='${MODEL_FILE}', revision='${MODEL_REVISION}', local_dir='/models')"

FROM nvidia/cuda:12.8.1-devel-ubuntu22.04 AS builder

ARG LLAMA_CPP_VERSION=b9445

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates cmake git \
    && git clone --depth 1 --branch "${LLAMA_CPP_VERSION}" https://github.com/ggml-org/llama.cpp.git /src \
    && cmake -S /src -B /src/build -DGGML_CUDA=ON -DLLAMA_CURL=OFF -DBUILD_SHARED_LIBS=OFF -DCMAKE_BUILD_TYPE=Release \
    && cmake --build /src/build --config Release --target llama-server -j2 \
    && strip /src/build/bin/llama-server

FROM nvidia/cuda:12.8.1-runtime-ubuntu22.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /src/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=model /models/Qwen3.5-9B-abliterated-Q4_K_M.gguf /models/model.gguf
COPY start.sh /opt/soulmate/start.sh

RUN chmod 0755 /opt/soulmate/start.sh

ENV MODEL_PATH=/models/model.gguf \
    SERVED_MODEL_NAME=soulmate-qwen35-9b-nsfw \
    CONTEXT_SIZE=8192 \
    PARALLEL_SLOTS=4

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=30 \
    CMD curl --fail --silent http://127.0.0.1:8000/health || exit 1

ENTRYPOINT ["/opt/soulmate/start.sh"]
