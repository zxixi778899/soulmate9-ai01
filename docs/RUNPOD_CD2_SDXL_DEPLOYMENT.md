# RunPod CD2: Pony + Illustrious

## Routing

| Content | Endpoint | Checkpoint | LoRA rule |
|---|---|---|---|
| Realistic Lv1-2, 3D, outfit, prop, advert | CD1 | FLUX.1-dev fp8 | FLUX LoRA, page scoped |
| Realistic Lv3-5 | CD2 | Pony Realism V2.2 | Pony-only LoRA |
| Realistic transgender | CD2 | Pony Realism V2.2 | Pony-only LoRA |
| 2D companion | CD2 | WAI Mature Illustrious V2 | Illustrious-only LoRA |

Do not attach FLUX LoRAs to Pony or Illustrious workflows. The application enforces
model-family and page-surface separation before submitting a workflow.

## Install checkpoints on the CD2 volume

Attach `soulmate-dc2-models` to a temporary RunPod GPU Pod and run:

```bash
git clone --depth 1 https://github.com/zxixi778899/soulmate9-ai01.git /tmp/soulmate
bash /tmp/soulmate/scripts/runpod/install-cd2-models.sh
```

For an age-gated Civitai download, set `CIVITAI_API_TOKEN` in the Pod first. The
installer resumes partial downloads and verifies the published SHA256 before
renaming the file into `models/checkpoints`.

Expected files:

```text
models/checkpoints/ponyRealism_V22.safetensors
models/checkpoints/waiMatureIllustrious_v20.safetensors
```

## Serverless endpoint

1. Keep the existing CD1 endpoint and volume unchanged.
2. Attach `soulmate-dc2-models` to the second ComfyUI endpoint.
3. Set zero active workers and the desired maximum workers.
4. Confirm that `CheckpointLoaderSimple` can see both CD2 filenames.
5. Configure the application:

```env
RUNPOD_ENDPOINT_ID_FLUX=<CD1 endpoint id>
RUNPOD_ENDPOINT_ID_SDXL=<CD2 endpoint id>
RUNPOD_CHECKPOINT_FLUX=flux1-dev-fp8.safetensors
RUNPOD_CHECKPOINT_PONY=ponyRealism_V22.safetensors
RUNPOD_CHECKPOINT_ILLUSTRIOUS=waiMatureIllustrious_v20.safetensors
```

Keep `RUNPOD_ENDPOINT_ID` during migration as the CD1 compatibility fallback.
