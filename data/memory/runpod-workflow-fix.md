---
name: runpod-workflow-fix
description: Fixed RunPod workflow validation error — Pony/Illustrious routing to FLUX-endpoint bug
type: project
---

Fixed RunPod workflow validation `value_not_in_list` error where `ponyRealism_V22.safetensors` was sent to an endpoint only having `flux1-dev-fp8.safetensors`.

**Root cause:** `specialistModelsReadyFromEnv()` in `image-generation-routing.ts` had a fallback that returned `true` if all SDXL env vars were *defined*, even when `RUNPOD_SDXL_MODELS_READY=false`. This caused the routing to select Pony/Illustrious model family and send requests to the SDXL endpoint, which didn't have those models.

**Fix 1:** Removed the fallback check — `specialistModelsReadyFromEnv()` now only returns `true` when `RUNPOD_SDXL_MODELS_READY === 'true'`.

**Fix 2:** Added defense-in-depth in `runpod.ts` preflight validation to remap SDXL endpoint → primary FLUX endpoint when falling back from Pony/Illustrious to FLUX.

**How to apply:** When SDXL models are actually installed on the SDXL endpoint, set `RUNPOD_SDXL_MODELS_READY=true` to enable Pony/Illustrious routing.