# SoulMate9 ComfyUI Serverless worker
# Models are supplied by the attached RunPod network volume at /runpod-volume/models.
FROM runpod/worker-comfyui:5.8.6-base

USER root

RUN git clone --depth 1 https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git \
      /comfyui/custom_nodes/comfyui-ipadapter-flux \
    && python -m pip install --no-cache-dir \
      -r /comfyui/custom_nodes/comfyui-ipadapter-flux/requirements.txt

# Fix Shakker node incompatibility with current ComfyUI: the upstream FLUX
# DoubleStreamBlock no longer exposes 'flipped_img_txt', so the direct attribute
# access in flux/layers.py raises AttributeError and crashes ApplyIPAdapterFlux
# at generation time ("'DoubleStreamBlock' object has no attribute
# 'flipped_img_txt'"). Use a getattr fallback (False = normal attention path).
RUN sed -i "s/self.flipped_img_txt = original_block.flipped_img_txt/self.flipped_img_txt = getattr(original_block, 'flipped_img_txt', False)/" \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/flux/layers.py \
    && grep -q "getattr(original_block, 'flipped_img_txt', False)" \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/flux/layers.py

# Shakker's loader registers a custom ipadapter-flux model directory and checks
# SigLIP below folder_paths.models_dir. Link both to the runtime network volume.
RUN mkdir -p /comfyui/models/clip_vision \
    && ln -s /runpod-volume/models/ipadapter-flux /comfyui/models/ipadapter-flux \
    && ln -s /runpod-volume/models/clip_vision/siglip-so400m-patch14-384 \
      /comfyui/models/clip_vision/siglip-so400m-patch14-384

# Keep the upstream entrypoint/CMD. The official worker automatically discovers
# models under /runpod-volume/models when the endpoint has a network volume.
