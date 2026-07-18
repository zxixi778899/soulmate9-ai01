FROM vllm/vllm-openai:v0.10.2

USER root

RUN apt-get update \
    && apt-get install -y --no-install-recommends nginx curl \
    && rm -rf /var/lib/apt/lists/*

COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /opt/soulmate/start.sh

RUN chmod 0755 /opt/soulmate/start.sh

ENV HF_HUB_ENABLE_HF_TRANSFER=1 \
    VLLM_WORKER_MULTIPROC_METHOD=spawn

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=1800s --retries=20 \
    CMD curl --fail --silent http://127.0.0.1/ping || exit 1

ENTRYPOINT ["/opt/soulmate/start.sh"]
