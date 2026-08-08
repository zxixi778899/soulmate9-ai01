# Image and Video Generation Routing Blueprint

## Product benchmark

Public competitor behavior supports a character-first pipeline rather than a
single universal model: select a persistent character, choose structured
outfit/action/pose/scene controls, generate several image candidates, then
animate a selected image into a 5s or 10s clip. Competitors do not disclose
their private checkpoint names, so the model mapping below is an engineering
inference based on those observable capabilities and our adult-content needs.

## Production topology

Use three isolated RunPod Serverless endpoints:

| Endpoint | Models | User-facing workload | Worker policy |
|---|---|---|---|
| FLUX image | FLUX.1-dev fp8, optional FLUX Unchained | SFW realism, identity portraits, 3D, outfits, props, adverts | 48GB, min 0, max 2 |
| SDXL image | Pony Realism V2.2, WAI Mature Illustrious V2 | Realistic NSFW, transgender, complex adult composition, 2D/anime | 48GB preferred, min 0, max 2 |
| WAN video | Wan 2.2 14B I2V/T2V | Selected-image animation, 5s/10s clips | 48GB, min 0, max 1 |

Chat is isolated from media generation: Free/Basic/Pro standard chat and Pro
adult chat use `vLLM-Qwen3-8B-Pro-NSFW` (`m4va2u0uqugd9v`); Unlimited uses
`vLLM-Qwen3-30B-Unlimited` (`pe83m495wybb9d`) for both standard and adult
long-context roleplay. Provider fallbacks remain configured only for endpoint
failure, not normal scene selection.

Do not route FLUX LoRAs into SDXL or SDXL LoRAs into FLUX. A LoRA inventory
variable is not proof that the matching checkpoint is mounted. The SDXL route
is enabled only when `RUNPOD_ENDPOINT_ID_SDXL` is configured.

## Automatic image routing

| Feature | Model | Default parameters | LoRA policy |
|---|---|---|---|
| Identity anchor / initial portrait | FLUX.1-dev | 832x1216, 24 steps, Euler/simple | Base checkpoint only; no style/adult LoRA |
| SFW chat selfie | FLUX.1-dev | 832x1216, 24 steps | Verified FLUX skin/body/style, max 3 |
| Outfit/prop/advert | FLUX.1-dev | 1024 square, 24 steps | Page-scoped FLUX outfit/product LoRA |
| 3D companion | FLUX.1-dev | 832x1216, 24 steps | FLUX 3D LoRA |
| Realistic NSFW level 3-5 | Pony Realism V2.2 | 832x1216, 28 steps, CFG 6, DPM++ 2M SDE/Karras | Pony-only, max 2 |
| Complex pair/group/SM | Pony Realism V2.2 | 832x1216, 32 steps, CFG 6 | Pony detail/anatomy LoRA, max 2 |
| Realistic transgender | Pony Realism V2.2 | 832x1216, 28-32 steps | Pony-compatible only |
| 2D/anime | WAI Mature Illustrious V2 | 832x1216, 28-32 steps, CFG 6 | Illustrious-only, max 2 |

For the first SDXL rollout, use the base checkpoints plus the verified detail
LoRAs already listed in `scripts/runpod/cd2-essential-loras.txt`. Do not add a
large adult-pose stack before an A/B benchmark: checkpoint quality, prompt
format and identity reference usually have more impact, while stacked pose
LoRAs often increase anatomy failures.

## Video routing

WAN 2.2 is the only production user route. Always prefer image-to-video from a
generated/approved character frame; text-to-video remains admin-only because
identity drift is much higher.

| Preset | Frames / FPS | Use |
|---|---|---|
| Standard | 81 / 16 | 5-second subtle motion |
| Premium | 161 / 16 | 10-second clip |

SVD is legacy-only and must be explicitly requested with `video_model=svd`.
AnimateDiff has been retired; every user and admin video path uses Wan2.2.

## Required environment

```env
RUNPOD_ENDPOINT_ID_FLUX=<existing FLUX endpoint>
RUNPOD_ENDPOINT_ID=<same FLUX endpoint during migration>
RUNPOD_ENDPOINT_ID_SDXL=<new SDXL endpoint>
RUNPOD_WAN_VIDEO_ENDPOINT=<existing WAN 2.2 endpoint>
RUNPOD_PRO_CHAT_URL=https://api.runpod.ai/v2/m4va2u0uqugd9v/openai/v1
RUNPOD_UNLIMITED_CHAT_URL=https://api.runpod.ai/v2/pe83m495wybb9d/openai/v1

RUNPOD_CHECKPOINT_FLUX=flux1-dev-fp8.safetensors
RUNPOD_CHECKPOINT_PONY=ponyRealism_V22.safetensors
RUNPOD_CHECKPOINT_ILLUSTRIOUS=waiMatureIllustrious_v20.safetensors

RUNPOD_INSTALLED_LORAS_FLUX=<verified FLUX inventory>
RUNPOD_INSTALLED_LORAS_PONY=pony_detailifier_v5.safetensors,BackgroundDetailerV3-000004.safetensors
RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS=AddMicroDetails_Illustrious_v6.safetensors,StS-Illustrious-Detail-Slider-v1.0.safetensors

VIDEO_DEFAULT_MODEL=wan22
```

## Deployment and retirement order

1. Create the SDXL network volume and install checkpoints with
   `scripts/runpod/install-cd2-models.sh`.
2. Install verified LoRAs with `scripts/runpod/install-cd2-loras.sh`.
3. Create the SDXL ComfyUI endpoint and confirm `CheckpointLoaderSimple` lists
   both checkpoint filenames.
4. Set the SDXL environment variables and canary 20 prompts per route.
5. Connect the existing WAN endpoint and canary 5s image-to-video first.
6. After seven days above 95% successful jobs, disable the SVD endpoint.
7. Keep the retired AnimateDiff endpoint and environment variable absent.

Never delete an endpoint before its environment variable is removed and its
stored job IDs have reached a terminal state.
