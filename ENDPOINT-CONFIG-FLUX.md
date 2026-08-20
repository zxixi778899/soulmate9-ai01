# SoulMate AI - RunPod Endpoint Configuration: FLUX Main

## Endpoint Overview

| 字段 | 值 | 说明 |
|------|-----|------|
| **名称** | soulmate-flux-main | Primary generation endpoint |
| **GPU** | NVIDIA RTX 4090 24GB | High-performance for FLUX |
| **Type** | Serverless | Auto-scaling based on demand |
| **Pods** | Min: 1, Max: 5 | Handle concurrent requests |
| **Storage** | 100 GB SSD | Models cache |
| **Network Volume** | Yes | Enable model persistence |

---

## Model Architecture

```
┌─────────────────────────────────────────────────┐
│              ComfyUI Worker                      │
├─────────────────────────────────────────────────┤
│  Checkpoint: flux1-dev-fp8 (~6.4GB)             │
│  CLIP Vision: SigLIP-so400m (~65MB)             │
│  IP-Adapter: Flux-specific SigLIP adapter       │
├─────────────────────────────────────────────────┤
│  Custom Nodes:                                   │
│  ├─ comfyui-ipadapter-flux ✅                   │
│  ├─ sd-webui-controlnet ✅                       │
│  ├─ ComfyUI-ADetailer ✅                         │
│  ├─ ComfyUI-KJNodes ✅                           │
│  └─ ComfyUI-Flex-Lora-Manager ✅                 │
├─────────────────────────────────────────────────┤
│  Preprocessors:                                  │
│  ├─ OpenPose (DW Pose v2) ✅                     │
│  ├─ Depth (Zoe-Depth) ⚠️  Optional              │
│  ├─ Canny Edge ✅                                │
│  └─ LineArt ✅                                   │
├─────────────────────────────────────────────────┤
│  ADetailer Checkpoints:                          │
│  ├─ YOLOv8n-face.pt ✅                           │
│  ├─ YOLOv8m-face.pt ✅                           │
│  └─ YOLOv8n-hand.pt ✅                           │
├─────────────────────────────────────────────────┤
│  Upscaler Models:                                │
│  ├─ RealESRGAN_x4plus.pth ✅                     │
│  ├─ ESRGAN_x4.pth ⚠️                             │
│  └─ 4x-UltraSharp.pth ✅                         │
└─────────────────────────────────────────────────┘
```

---

## Workflow Strategy

### Primary Workflows

#### 1. Portrait Generation (Default)
```python
{
  "type": "txt2img",
  "workflow": "flux_portrait",
  "params": {
    "steps": 20,
    "cfg": 1,
    "guidance": 3.5,
    "resolution": "832x1216"
  },
  "enabled_nodes": {
    "ip_adapter": true,
    "controlnet": {"type": "openpose", "strength": 0.8},
    "adetailer": true,
    "upscale": false
  }
}
```

#### 2. Img2Img Transformations
```python
{
  "type": "img2img",
  "denoise": 0.72,  # Outfit change default
  "workflow": "flux_img2img",
  "enabled_nodes": {
    "ip_adapter": true,
    "controlnet": {"type": "canny", "strength": 0.4},
    "adetailer": false
  }
}
```

#### 3. Production Quality
```python
{
  "type": "multi-stage",
  "stages": [
    {"stage": "generate", "steps": 24},
    {"stage": "adetailer", "model": "yolov8m-face"},
    {"stage": "upscale", "scale": 4}
  ]
}
```

---

## Deployment Steps

### Step 1: Build Docker Image
```bash
cd runpod/comfyui-worker
docker build -t ghcr.io/yourorg/soulmate-flux:latest .
```

### Step 2: Push to GHCR
```bash
docker login ghcr.io
docker push ghcr.io/yourorg/soulmate-flux:latest
```

### Step 3: Deploy in RunPod Console

**Configuration:**
```yaml
image: ghcr.io/yourorg/soulmate-flux:latest
gpu: NVIDIA RTX 4090 24GB
network_volume:
  enabled: true
  path: /runpod-volume
  size_gb: 100
min_pods: 1
max_pods: 5
idle_timeout: 300
```

### Step 4: Initialize Models

Create a one-time initialization job:

```bash
docker run --rm \
  -v $(pwd)/models:/runpod-volume/models \
  ghcr.io/yourorg/soulmate-flux:latest \
  bash /scripts/runpod/install-comfyui-complete.sh
```

---

## Performance Metrics

| Metric | Value | Notes |
|--------|-------|-------|
| **Memory Usage** | ~13-15 GB VRAM | With all nodes active |
| **Time per Image** | 15-25s | Standard portrait |
| **Throughput** | 2-3 imgs/min | Single pod |
| **Batch Capacity** | Up to 5 concurrent | With scaling |

---

## Monitoring & Maintenance

### Health Checks
- Daily uptime monitoring (>99%)
- GPU utilization tracking (<80% target)
- Queue depth alerts (>10 items trigger scale-up)

### Model Updates
- Weekly dependency checks
- Monthly security patches
- Quarterly version upgrades

---

## Cost Analysis

**Estimated Monthly Cost (Serverless):**
- Active time: ~10 hours/day × $0.003/sec = ~$108/month
- Idle pods (if any): Minimal cost
- Storage (100GB): ~$5/month

**Cost per Generation**: ~$0.05-0.10 depending on complexity

---

## Troubleshooting

### Issue: Slow Start Time
**Solution**: Increase min_pods to 2-3 for faster bootup

### Issue: OOM Errors
**Solution**: 
- Use fp8 checkpoint
- Disable upscale in first pass
- Enable `--lowvram` flag

### Issue: Missing Models
**Solution**: Re-run initialization script from step 4

---

## Next Steps

1. ✅ Configure this FLUX endpoint
2. ➡️ Set up SDXL matrix endpoints (optional)
3. ➡️ Implement load balancing logic
4. ➡️ Create admin dashboard for monitoring

---

**Last Updated**: 2026-08-20  
**Status**: Ready for Deployment  
**Maintainer**: SoulMate AI Dev Team
