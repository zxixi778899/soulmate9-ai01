# SoulMate AI - SDXL Matrix Endpoints

## Overview: Why SDXL Matrix?

To optimize costs and performance, we use a **multi-model routing strategy**:

- **FLUX**: Premium quality for realistic/anime portraits
- **SDXL Pony**: Fast, cost-effective for anime styles  
- **SDXL Illustrious**: Specialized for illustration art

---

## Endpoint Configuration A: SDXL Pony Realism

### Primary Use Case
- Western-style realistic characters
- Fashion photography
- Casual portraits

### Specifications

| 字段 | Value |
|------|-------|
| **Name** | sdxl-pony-realism |
| **GPU** | NVIDIA RTX 3090 24GB |
| **Checkpoint** | ponyDiffusionV6XL_pngpt.safetensors |
| **Workflow** | txt2img + img2img |

### Required Models

```bash
# Checkpoint (~6 GB)
wget https://huggingface.co/Linaqruf/pony_diffusion_v6_release/resolve/main/ponyDiffusionV6XL_pngpt.safetensors

# Popular LoRAs (optional)
wget https://civitai.com/api/download/models/123456  # EpicRealism
wget https://civitai.com/api/download/models/789012  # RealisticVision
```

### Workflow Template

```python
{
  "checkpoint": "ponyDiffusionV6XL",
  "params": {
    "steps": 20,
    "cfg": 5.5,
    "width": 896,
    "height": 1152
  },
  "sampler": "dpmpp_2m_karras",
  "scheduler": "karras",
  "loras": [
    {"id": "epicrealism", "weight": 0.6}
  ]
}
```

---

## Endpoint Configuration B: SDXL Illustrious

### Primary Use Case
- Japanese anime style
- Manga illustrations  
- Studio Ghibli-like aesthetics

### Specifications

| 字段 | Value |
|------|-------|
| **Name** | sdxl-illustrious |
| **GPU** | NVIDIA RTX 3090 24GB |
| **Checkpoint** | illustriousMajinMix.safetensors |
| **Specialization** | Anime/Manga/Art |

### Required Models

```bash
# Core checkpoint (~6 GB)
wget https://civitai.com/api/download/models/234567

# Anime-specific Loras
git clone https://github.com/user/ComfyUI-anime-loras.git \
  /comfyui/custom_nodes/anime-loras
```

### Workflow Template

```python
{
  "checkpoint": "illustriousMajinMix",
  "params": {
    "steps": 24,
    "cfg": 6.0,
    "guidance_anime_boost": true,
    "width": 832,
    "height": 1216
  },
  "sampler": "euler_ancestral",
  "scheduler": "simple"
}
```

---

## Routing Logic

### Decision Matrix

| Style Category | Render Style | Quality Requirement | Endpoint Selected |
|---------------|-------------|-------------------|------------------|
| female/male | realistic | high | FLUX Main |
| female/male | realistic | draft | SDXL Pony |
| female/male | anime | production | SDXL Illustrious |
| female/male | semi_real | medium | FLUX Main |
| Androgynous | oil_paint | artistic | FLUX Main |
| All | outfit_change | any | FLUX Img2Img |
| All | pose_change | any | FLUX ControlNet |

### Implementation Snippet

```typescript
// src/lib/model-routing.ts

interface RouteDecision {
  endpoint: 'flux-main' | 'sdxl-pony' | 'sdxl-illustrious';
  workflow_type: string;
  fallback_to: 'flux-main';
}

export function resolveEndpoint(request: GenerationRequest): RouteDecision {
  const { category, render_style, requirements } = request;

  // Priority 1: Portrait generation always uses FLUX
  if (requirements.use_portrait === true) {
    return {
      endpoint: 'flux-main',
      workflow_type: 'portrait_workflow',
      fallback_to: 'flux-main'
    };
  }

  // Priority 2: Anime styles → SDXL Illustrious
  if (render_style === 'anime') {
    return {
      endpoint: 'sdxl-illustrious',
      workflow_type: 'anime_workflow',
      fallback_to: 'flux-main'
    };
  }

  // Priority 3: Quick drafts → SDXL Pony
  if (requirements.preview_mode || requirements.fast_output) {
    return {
      endpoint: 'sdxl-pony',
      workflow_type: 'fast_workflow',
      fallback_to: 'flux-main'
    };
  }

  // Default: FLUX for best quality
  return {
    endpoint: 'flux-main',
    workflow_type: 'standard_workflow',
    fallback_to: null
  };
}
```

---

## Cost-Benefit Analysis

| Endpoint | GPU Type | Time/Image | Cost/Image | Best For |
|----------|---------|-----------|-----------|----------|
| **FLUX Main** | RTX 4090 | 15-25s | ~$0.08 | High-quality portraits |
| **SDXL Pony** | RTX 3090 | 8-12s | ~$0.03 | Drafts & previews |
| **SDXL Illustrious** | RTX 3090 | 10-15s | ~$0.04 | Anime styles |

**ROI Impact**: 
- Using SDXL for drafts saves ~60% cost
- Only production-quality images use FLUX

---

## Fallback Strategy

All endpoints support automatic fallback to FLUX Main:

```json
{
  "fallback_config": {
    "enabled": true,
    "max_fallback_attempts": 2,
    "trigger_conditions": [
      "timeout > 60s",
      "error_code 500",
      "out_of_memory"
    ],
    "exponential_backoff": true
  }
}
```

---

## Deployment Checklist

For each SDXL endpoint:

- [ ] Build dedicated Docker image
- [ ] Push to GHCR
- [ ] Create RunPod Serverless endpoint
- [ ] Configure network volume (50GB min)
- [ ] Download base checkpoint
- [ ] Test basic generation
- [ ] Set up monitoring alerts
- [ ] Configure auto-scaling rules
- [ ] Implement health checks

---

**Status**: Optional optimization layer  
**Priority**: Phase 2 implementation  
**Estimated ROI**: 30-40% cost savings on high-volume usage
