---
name: project-soulmate9-image-gen-flux-checkpoint
description: FLUX image gen silently failed because route requested a checkpoint the worker didn't have; preflight now swaps against inventory.
type: project
---

Production endpoint `e40cgshtouocg8` only has `fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors` installed, but `image-generation-routing.ts` defaulted the FLUX `ckpt_name` to `flux1-dev-fp8.safetensors` (via `env('RUNPOD_FLUX_CHECKPOINT', 'flux1-dev-fp8.safetensors')`). Every submit bounced with `value_not_in_list: 'flux1-dev-fp8.safetensors' not in ['fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors']` and the credit was refunded — users saw "image gen never works" with no clue why.

**Why:** The previous preflight only checked SDXL checkpoints against `RUNPOD_SDXL_CHECKPOINTS`; the FLUX path had no equivalent inventory, so the code blindly trusted `RUNPOD_FLUX_CHECKPOINT` and the route default. New env var `RUNPOD_INSTALLED_FLUX_CHECKPOINTS` lists what is actually mounted on the worker; `preflightValidateModelOptions` validates the request against it (case-insensitive comparison, but preserves the installed name's original case — the worker is case-sensitive) and swaps to the first installed checkpoint, preferring Unchained. Also flips `ckpt_loader` to `'split'` for Unchained because that checkpoint ships UNET-only.

**How to apply:** Always run the smoke test before declaring image gen fixed — `node scripts/check-runpod-endpoints.mjs` or the e2e node script in `outputs/test-e2e.mjs`. The list of mounted FLUX checkpoints can drift; check the worker's `/system_stats` after a deploy and update `RUNPOD_INSTALLED_FLUX_CHECKPOINTS` in Vercel env if assets change. Verified end-to-end: the live endpoint returns a real base64 PNG (`iVBORw0KGgo...`) after the fix.
