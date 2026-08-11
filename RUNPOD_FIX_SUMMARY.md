# RunPod Workflow Validation Error - Fix Summary

## Problem
RunPod job failed with:
```
Workflow validation failed: • Node 1 (errors): [{'type': 'value_not_in_list', ...
ckpt_name: 'ponyRealism_V22.safetensors' not in ['flux1-dev-fp8.safetensors']
...
lora_name: 'pony_detailifier_v5.safetensors' not in []
lora_name: 'pony_mature_female_slider_v2.safetensors' not in []
```

## Root Cause
The image generation routing was selecting Pony model family even though `RUNPOD_SDXL_MODELS_READY=false`. 

In `image-generation-routing.ts`, the `specialistModelsReadyFromEnv()` function had a fallback check that returned `true` if all the SDXL environment variables were *defined*, regardless of the `RUNPOD_SDXL_MODELS_READY` flag being `false`:

```typescript
// OLD CODE (BUGGY)
export function specialistModelsReadyFromEnv(): boolean {
  if (process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true') return true;
  return Boolean(
    optionalEnv('RUNPOD_ENDPOINT_ID_SDXL') &&  // ← This was making it return true
    optionalEnv('RUNPOD_CHECKPOINT_PONY') &&
    optionalEnv('RUNPOD_CHECKPOINT_ILLUSTRIOUS') &&
    optionalEnv('RUNPOD_INSTALLED_LORAS_PONY') &&
    optionalEnv('RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS')
  );
}
```

Since all these env vars were defined in `.env.local`, the function returned `true` even though the user explicitly set `RUNPOD_SDXL_MODELS_READY=false`. This caused:
1. The routing to select `modelFamily: 'pony'` with the SDXL endpoint
2. The request to go to the SDXL endpoint with Pony checkpoint + Pony LoRAs
3. The SDXL endpoint to fail validation because it only had FLUX models available

## Fixes Applied

### Fix 1: Route Layer - `src/lib/image-generation-routing.ts`
Changed `specialistModelsReadyFromEnv()` to only return `true` when `RUNPOD_SDXL_MODELS_READY === 'true'`:

```typescript
// NEW CODE (FIXED)
export function specialistModelsReadyFromEnv(): boolean {
  // Only return true if explicitly set to 'true'. Env vars existing is not sufficient —
  // we must have a positive confirmation that the SDXL endpoint has the models installed.
  // This prevents auto-routing to Pony/Illustrious when they're not actually available.
  return process.env.RUNPOD_SDXL_MODELS_READY?.trim().toLowerCase() === 'true';
}
```

This ensures that:
- If `RUNPOD_SDXL_MODELS_READY=false` (or unset), specialist models are disabled
- Pony/Illustrious routing is only selected when explicitly enabled
- Requests fall back to FLUX, which is guaranteed to be available

### Fix 2: Preflight Validation Layer - `src/lib/runpod.ts`
Added defensive endpoint remapping in `preflightValidateModelOptions()`. When falling back from Pony/Illustrious to FLUX due to `RUNPOD_SDXL_MODELS_READY=false`, the code now also remaps the endpoint from the SDXL endpoint to the primary FLUX endpoint:

```typescript
// Also route to the primary FLUX endpoint, not the SDXL one. The SDXL
// endpoint may or may not have FLUX checkpoints installed; the primary
// endpoint is guaranteed to.
const sdxlEndpoint = process.env.RUNPOD_ENDPOINT_ID_SDXL;
if (adjusted.endpoint_id && sdxlEndpoint && adjusted.endpoint_id === sdxlEndpoint) {
  adjusted.endpoint_id = process.env.RUNPOD_ENDPOINT_ID || undefined;
  logger.warn('[runpod] remapped SDXL endpoint to primary FLUX endpoint', {
    from: sdxlEndpoint,
    to: adjusted.endpoint_id,
  });
}
```

This provides defense in depth: even if a Pony request somehow reaches the runpod client with the SDXL endpoint, it will be remapped to the primary FLUX endpoint which is guaranteed to have FLUX models.

## Files Modified
1. `src/lib/image-generation-routing.ts` - Fixed `specialistModelsReadyFromEnv()` logic
2. `src/lib/runpod.ts` - Added endpoint remapping in preflight validation

## Expected Behavior After Fix
- With `RUNPOD_SDXL_MODELS_READY=false`: All image generation routes to FLUX (primary endpoint)
- With `RUNPOD_SDXL_MODELS_READY=true`: NSFW/2D routes to Pony/Illustrious (SDXL endpoint)
- The `ponyRealism_V22.safetensors` model will only be requested when the SDXL endpoint is explicitly ready
- LoRA files (`pony_detailifier_v5.safetensors`, etc.) will only be requested when routing to Pony

## Testing
The existing test suite in `src/lib/__tests__/image-generation-routing.test.ts` verifies this behavior:
- Tests that require Pony/Illustrious explicitly set `RUNPOD_SDXL_MODELS_READY = 'true'`
- Tests that expect FLUX don't set the flag (it defaults to `false`)
- The test "keeps specialist models disabled until their runtime inventory is marked ready" validates the fix
