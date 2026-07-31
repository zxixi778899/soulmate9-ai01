# SoulMate9 FLUX RunPod Worker

This image adds the FLUX-specific Shakker Labs IP-Adapter nodes to the official
RunPod ComfyUI serverless worker. Large models stay on the network volume.

## Build

```bash
docker build --platform linux/amd64 -t <registry>/soulmate9-comfyui:flux-ipadapter .
docker push <registry>/soulmate9-comfyui:flux-ipadapter
```

Build from this directory: `runpod/comfyui-worker`.

## Endpoint template

- Container image: the pushed image above
- Container disk: at least 15 GB
- Network volume: `p1dup48kuq`
- Active workers: 0 while validating
- Max workers: 1
- GPU: 24 GB VRAM minimum
- Do not override the container start command

The official worker mounts the serverless volume at `/runpod-volume` and
discovers models from `/runpod-volume/models`.

## Required volume files

```text
models/checkpoints/flux1-dev-fp8.safetensors
models/ipadapter-flux/ip-adapter.bin
models/clip_vision/siglip-so400m-patch14-384/config.json
models/clip_vision/siglip-so400m-patch14-384/preprocessor_config.json
models/clip_vision/siglip-so400m-patch14-384/model.safetensors
```

Do not install `ComfyUI_IPAdapter_plus` for this FLUX workflow. The API graph
uses `IPAdapterFluxLoader` and `ApplyIPAdapterFlux`.

## First validation

After updating the endpoint template, terminate old workers and submit one
identity-reference generation. Confirm the worker log contains both node class
names and does not contain `class_type not found`, `Failed to load clip image
processor`, or `No such file or directory`.
