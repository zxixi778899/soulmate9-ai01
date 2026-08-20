# SoulMate AI - Multi-Endpoint Generation System Deployment Guide

## 🎯 Overview

This guide provides the complete deployment plan for the new multi-endpoint image generation system with three dedicated RunPod Serverless workers:

1. **FLUX Premium** (RTX 4090) - High-quality portrait SFW/NSFW
2. **SDXL Pony Realism** (RTX 3090) - Fast anime & western realistic characters  
3. **SDXL Illustrious** (RTX 3090) - Illustration & fantasy art style

---

## 📋 Pre-deployment Checklist

### Environment Variables Required

Add these to your `.env.local` and Vercel production environment:

```bash
# ============================================
# FLUX PREMIUM ENDPOINT (RTX 4090)
# ============================================
RUNPOD_ENDPOINT_ID_FLUX=wozrrlcdipyl3p
RUNPOD_FLUX_CHECKPOINT=flux1-dev-fp8.safetensors

# FLUX LoRA inventory (comma-separated filenames)
RUNPOD_INSTALLED_LORAS_FLUX=flux_style_photoreal_v1.safetensors,flux_detail_skin_v1.safetensors,flux_lewd_v1.safetensors,...

# Category-specific LoRAs for FLUX
RUNPOD_FLUX_FEMALE_LORAS=flux_style_photoreal_v1.safetensors,flux_detail_skin_v1.safetensors
RUNPOD_FLUX_MALE_LORAS=flux_male_masc_v1.safetensors,flux_male_muscle_v1.safetensors
RUNPOD_FLUX_2D_LORAS=rdanimefluxv1rapid.safetensors
RUNPOD_FLUX_3D_LORAS=flux_3d_render_v1.safetensors
RUNPOD_FLUX_NSFW_LORAS=flux_lewd_v1.safetensors,flux_pose_nsfw_dynamic_v1.safetensors,flux_face_ahegao_v1.safetensors

# ============================================
# SDXL PONY REALISM ENDPOINT (RTX 3090)
# ============================================
RUNPOD_ENDPOINT_ID_SDXL_PONY=<your-sdxl-pony-endpoint-id>
RUNPOD_SDXL_CHECKPOINTS=ponyDiffusionV6XL_pngpt.safetensors,waiMatureIllustrious_v20.safetensors

# SDXL total LoRA inventory
RUNPOD_INSTALLED_LORAS_SDXL=pony_detailifier_v5.safetensors,pony_mature_female_slider_v2.safetensors,...

# Pony category-specific LoRAs
RUNPOD_PONY_FEMALE_LORAS=pony_detailifier_v5.safetensors,pony_mature_female_slider_v2.safetensors
RUNPOD_PONY_MALE_LORAS=pony_detailifier_v5.safetensors,pony_gender_transition_slider.safetensors
RUNPOD_PONY_NSFW_LORAS=BackgroundDetailerV3-000004.safetensors

# ============================================
# SDXL ILLUSTRIOUS ENDPOINT (RTX 3090)  
# ============================================
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS=<your-illustrious-endpoint-id>

# Illustrious category LoRAs
RUNPOD_ILLUSTRIOUS_FEMALE_LORAS=AddMicroDetails_Illustrious_v6.safetensors,illustrious_nsfw_slider_v1.safetensors
RUNPOD_ILLUSTRIOUS_NSFW_LORAS=illustrious_nsfw_slider_v1.safetensors

# ============================================
# FEATURE FLAGS
# ============================================
RUNPOD_SDXL_MODELS_READY=false  # Set to 'true' when both SDXL endpoints are ready
```

---

## 🔧 Step-by-Step Deployment

### Step 1: Build FLUX Premium Docker Image

**File**: `runpod/comfyui-worker/Dockerfile.flux`

```dockerfile
FROM runpod/worker-comfyui:5.8.6-flux1-dev-fp8

USER root
ENV PATH="/opt/venv/bin:${PATH}"
ENV PIP_NO_INPUT=1

# Install IP-Adapter Flux
RUN git clone --depth 1 https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git \
      /comfyui/custom_nodes/comfyui-ipadapter-flux \
    && python -m pip install --no-cache-dir \
      -r /comfyui/custom_nodes/comfyui-ipadapter-flux/requirements.txt \
    && python -m pip install --no-cache-dir "transformers>=4.50.3,<5" "huggingface-hub<1.0"

# Apply compatibility patches for ComfyUI 5.8.6
RUN sed -i "s/self.flipped_img_txt = original_block.flipped_img_txt/self.flipped_img_txt = getattr(original_block, 'flipped_img_txt', False)/" \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/flux/layers.py

RUN sed -i 's/^    control=None,$/    control=None,\n    timestep_zero_index=None,/' \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/utils.py

# Link model directories to network volume
RUN mkdir -p /comfyui/models/ipadapter-flux \
    && ln -s /runpod-volume/models/ipadapter-flux /comfyui/models/ipadapter-flux \
    && mkdir -p /comfyui/models/clip_vision \
    && ln -s /runpod-volume/models/clip_vision/siglip-so400m-patch14-384 \
      /comfyui/models/clip_vision/siglip-so400m-patch14-384

# Install ControlNet & ADetailer
RUN git clone --branch v2 https://github.com/Mikubill/sd-webui-controlnet.git \
      /comfyui/custom_nodes/sd-webui-controlnet \
    && git clone https://github.com/Gourieff/ComfyUI-ADetailer.git \
      /comfyui/custom_nodes/ComfyUI-ADetailer \
    && python -m pip install --no-cache-dir \
      torch-sampler==1.0.3 opencv-python-headless==4.8.0.74 \
      ultralytics==8.3.0 Pillow==10.2.0 einops==0.7.0 \
      numpy>=1.24,<2.0 onnxruntime-gpu==1.18.0 --quiet

CMD ["python", "main.py"]
```

**Build & Push**:

```powershell
cd runpod/comfyui-worker
docker build -t ghcr.io/yourorg/soulmate-flux-premium:latest .
docker login ghcr.io
docker push ghcr.io/yourorg/soulmate-flux-premium:latest
```

---

### Step 2: Build SDXL Pony Docker Image

**File**: `runpod/comfyui-worker/Dockerfile.sdxl-pony`

```dockerfile
FROM runpod/base-cuda:12.1-runtime

USER root
ENV PATH="/opt/venv/bin:${PATH}"

# Install ComfyUI + SDXL dependencies
RUN git clone https://github.com/comfyanonymous/ComfyUI.git /comfyui \
    && cd /comfyui \
    && pip install torch torchvision torchaudio xformers==0.0.23 \
       diffusers transformers accelerate --upgrade

# Install ControlNet & Custom Nodes
RUN cd /comfyui/custom_nodes \
    && git clone --branch v2 https://github.com/Mikubill/sd-webui-controlnet.git \
    && git clone https://github.com/Gourieff/ComfyUI-ADetailer.git \
    && pip install opencv-python-headless==4.8.0.74 ultralytics==8.3.0

# Link models
RUN mkdir -p /comfyui/models/controlnet/preprocessors \
    && ln -s /runpod-volume/models/controlnet/preprocessors \
      /comfyui/models/controlnet/preprocessors \
    && mkdir -p /comfyui/models/adetailer/checkpoints \
    && ln -s /runpod-volume/models/adetailer/checkpoints \
      /comfyui/models/adetailer/checkpoints

CMD ["python", "/comfyui/main.py"]
```

**Checkpoint Requirements**:
- `ponyDiffusionV6XL_pngpt.safetensors` (~6GB)

**Build**:

```powershell
cd runpod/comfyui-worker
docker build -f Dockerfile.sdxl-pony -t ghcr.io/yourorg/soulmate-sdxl-pony:latest .
docker push ghcr.io/yourorg/soulmate-sdxl-pony:latest
```

---

### Step 3: Build SDXL Illustrious Docker Image

Same as SDXL Pony but with different checkpoint:

**Checkpoint**: `waiMatureIllustrious_v20.safetensors` (~6GB)

**Build**:

```powershell
docker build -f Dockerfile.sdxl-illustrious -t ghcr.io/yourorg/soulmate-sdxl-illustrious:latest .
docker push ghcr.io/yourorg/soulmate-sdxl-illustrious:latest
```

---

### Step 4: Create RunPod Serverless Endpoints

#### Endpoint A: FLUX Premium

- **Name**: `soulmate-flux-premium`
- **GPU**: NVIDIA RTX 4090 24GB
- **Image**: `ghcr.io/yourorg/soulmate-flux-premium:latest`
- **Type**: Serverless
- **Min Pods**: 1
- **Max Pods**: 5
- **Storage**: 100 GB SSD
- **Network Volume**: ✅ Enable
- **Environment Variables**: See Section "Environment Variables" above

#### Endpoint B: SDXL Pony Realism

- **Name**: `soulmate-sdxl-pony`
- **GPU**: NVIDIA RTX 3090 24GB
- **Image**: `ghcr.io/yourorg/soulmate-sdxl-pony:latest`
- **Type**: Serverless
- **Min Pods**: 1
- **Max Pods**: 3
- **Storage**: 80 GB SSD
- **Network Volume**: ✅ Enable

#### Endpoint C: SDXL Illustrious

- **Name**: `soulmate-sdxl-illustrious`
- **GPU**: NVIDIA RTX 3090 24GB
- **Image**: `ghcr.io/yourorg/soulmate-sdxl-illustrious:latest`
- **Type**: Serverless
- **Min Pods**: 1
- **Max Pods**: 2
- **Storage**: 80 GB SSD
- **Network Volume**: ✅ Enable

---

### Step 5: Download Models to Network Volumes

Connect to each endpoint's container console and execute:

#### For FLUX Endpoint:

```bash
mkdir -p /runpod-volume/models/{ipadapter-flux,clip_vision/siglip-so400m-patch14-384}

# Download IP-Adapter Flux
wget "https://huggingface.co/shakker-labs/IP-Adapter-Flux/resolve/main/ip-adapter-flux.bin" \
  -O /runpod-volume/models/ipadapter-flux/ip-adapter-flux.bin

# Download SigLIP Clip Vision
wget "https://huggingface.co/shakker-labs/IP-Adapter-Flux/resolve/main/clip_vision/siglip-so400m-patch14-384/model.safetensors" \
  -O /runpod-volume/models/clip_vision/siglip-so400m-patch14-384/model.safetensors
```

#### For SDXL Endpoints:

```bash
# Download Pony Checkpoint
mkdir -p /runpod-volume/models/checkpoints
wget "https://huggingface.co/Linaqruf/pony_diffusion_v6_release/resolve/main/ponyDiffusionV6XL_pngpt.safetensors" \
  -O /runpod-volume/models/checkpoints/ponyDiffusionV6XL_pngpt.safetensors

# Download Illustrious Checkpoint (for Illustrious endpoint)
wget "https://huggingface.co/guoyww/diffusers/resolve/main/waiMatureIllustrious_v20.safetensors" \
  -O /runpod-volume/models/checkpoints/waiMatureIllustrious_v20.safetensors
```

---

### Step 6: Update Routing Configuration

Update `src/lib/image-generation-routing.ts` with new endpoint IDs from RunPod Console:

```typescript
// After creating endpoints, copy their IDs here:
export const FLUX_ENDPOINT_ID = '<copied-from-runpod-console>';
export const SDXL_PONY_ENDPOINT_ID = '<copied-from-runpod-console>';
export const SDXL_ILLUSTRIOUS_ENDPOINT_ID = '<copied-from-runpod-console>';
```

---

## ✅ Post-Deployment Verification

### Health Check Script

Create `scripts/verify-endpoints.sh`:

```bash
#!/bin/bash

echo "🔍 Verifying SoulMate AI Endpoints..."

# Test FLUX endpoint
curl -X POST "https://<flux-endpoint-id>.serverless.runpod/workflow/health" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' && echo "✅ FLUX endpoint healthy"

# Test SDXL Pony endpoint  
curl -X POST "https://<pony-endpoint-id>.serverless.runpod/workflow/health" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' && echo "✅ SDXL Pony endpoint healthy"

# Test SDXL Illustrious endpoint
curl -X POST "https://<illustrious-endpoint-id>.serverless.runpod/workflow/health" \
  -H "Content-Type: application/json" \
  -d '{"test": true}' && echo "✅ SDXL Illustrious endpoint healthy"

echo "🎉 All endpoints verified!"
```

### Runtime Verification

In the Next.js admin panel at `/admin/comfy`, check:

1. ✅ All three endpoints appear in dropdown
2. ✅ Model inventory shows correct checkpoints
3. ✅ LoRA catalogs load without errors
4. ✅ Test generation succeeds on each endpoint

---

## 🚀 Rollout Strategy

### Phase 1: FLUX Only (Week 1)

- Enable FLUX endpoint only
- Route all portrait SFW/NSFW traffic
- Monitor GPU utilization & cold starts
- Adjust Min/Max pods based on demand

### Phase 2: SDXL Matrix Beta (Week 2)

- Set `RUNPOD_SDXL_MODELS_READY=true`
- Enable Pony Realism for female characters
- Gradually route anime styles to SDXL

### Phase 3: Full Multi-Endpoint (Week 3)

- Activate Illustrious endpoint
- Complete auto-routing based on renderStyle
- A/B test quality vs cost metrics

---

## 💰 Cost Optimization Tips

1. **Auto-scaling thresholds**: Set scale-up at 70% GPU utilization, scale-down at 30%
2. **Cold start mitigation**: Keep Min Pods = 1 for FLUX endpoint
3. **Model caching**: Use Network Volume to persist models across pod restarts
4. **Peak hour scaling**: Manually increase Max Pods during promotional periods

---

## 📊 Monitoring Dashboard

Set up CloudWatch/Vercel analytics for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Cold Start Duration | > 30s | Increase Min Pods |
| GPU Utilization | < 20% | Scale down |
| Request Queue Depth | > 10 | Scale up |
| Error Rate | > 5% | Investigate logs |

---

## 🔗 Related Documentation

- [ENDPOINT-CONFIG-FLUX.md](./ENDPOINT-CONFIG-FLUX.md) - FLUX endpoint details
- [ENDPOINT-CONFIG-SDXL-MATRIX.md](./ENDPOINT-CONFIG-SDXL-MATRIX.md) - SDXL matrix strategy
- [COMFYUI-NODES-GUIDE.md](./COMFYUI-NODES-GUIDE.md) - Node installation guide
- [DEPLOYMENT-GUIDE.md](./DEPLOYMENT-GUIDE.md) - Legacy deployment (obsolete)

---

**Last Updated**: August 20, 2026
**Version**: 2.0 (Multi-Endpoint Edition)
