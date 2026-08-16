# SoulMate9 SDXL bundle installer worker (serverless, one-shot provisioning)
# Implements the RunPod serverless handler protocol so jobs actually execute
# (plain ubuntu dockerArgs pods never run commands on this account).
FROM python:3.11-slim

RUN pip install --no-cache-dir runpod requests

COPY handler.py /handler.py

CMD ["python", "-u", "/handler.py"]
