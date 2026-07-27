# RunPod Endpoint Setup Guide

## Existing Endpoints (DO NOT MODIFY)
| Service | Endpoint ID | Worker | GPU | Status |
|---------|-------------|--------|-----|--------|
| vLLM Chat (DC2) | 7dacw6sk3tp1vi | Qwen3-8B | 24GB | Active |
| ComfyUI Image Gen | comfyui-wozrrlcdipyl3p | FLUX+Pony+Illustrious | 24GB | Active |

## New Endpoints to Create

### 1. TTS - Fish-Speech
- Template: runpod/fish-speech (or custom with fish-speech 1.5)
- GPU: 24GB (RTX 4090 / A5000)
- minWorkers: 0 (on-demand)
- maxWorkers: 2
- idleTimeout: 120s
- Flash Boot: enabled
- Network Volume: NOT needed (model fits in container)
- Env vars on worker: none special
- Expected input: { "text": "...", "reference_audio": "base64...", "format": "opus" }
- Expected output: { "audio": "base64...", "duration_ms": 1234 }

### 2. AnimateDiff - Dynamic Portraits
- Template: runpod/comfyui (with AnimateDiff extension installed)
- GPU: 24GB minimum (A5000 / RTX 4090)
- minWorkers: 0 (on-demand)
- maxWorkers: 1
- idleTimeout: 300s
- Network Volume: soulmate-model (mount at /runpod-volume) for checkpoints + motion modules
- Required models on volume:
  - models/checkpoints/realisticVisionV60B1_v51VAE.safetensors
  - models/animatediff_models/mm_sd_v15_v2.ckpt
- Env vars: none
- Expected input: { "workflow": { ...comfyui node graph... } }
- Expected output: { "images": [{ "data": "base64...", "filename": "..." }] } (animated webm/mp4)

### 3. (Future) Wan 2.1 Video Generation
- Template: custom (wan2.1 14B)
- GPU: 48GB+ (A6000 / A100)
- minWorkers: 0
- maxWorkers: 1
- idleTimeout: 600s
- NOT YET CREATED - Phase 2

## Cost Estimates (On-Demand)
| Service | $/hr | Est. requests/day | Est. monthly cost |
|---------|------|-------------------|-------------------|
| TTS Fish-Speech | $0.34 | 200 | ~$15-30 |
| AnimateDiff | $0.44 | 50 | ~$10-20 |
| vLLM Chat (existing) | $0.34 | 1000 | ~$100-200 |
| ComfyUI Image (existing) | $0.44 | 300 | ~$80-150 |
