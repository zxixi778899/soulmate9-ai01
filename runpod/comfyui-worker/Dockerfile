# SoulMate9 ComfyUI Serverless worker
# Models are supplied by the attached RunPod network volume at /runpod-volume/models.
#
# IMPORTANT: use the FULL variant, not *-base. The published 5.8.6-base image
# ships a stripped handler that does NOT support the 'images' base64 upload
# protocol (input.images -> POST /upload/image), so every img2img / IP-Adapter
# reference job fails on LoadImage. The full variant carries the complete
# handler.py (upload_images) plus the flux1-dev-fp8 checkpoint in-image.
FROM runpod/worker-comfyui:5.8.6-flux1-dev-fp8

USER root

# The full variant installs ComfyUI deps into a uv venv at /opt/venv and puts
# it on PATH; make sure it stays active for every pip invocation below.
ENV PATH="/opt/venv/bin:${PATH}"
ENV PIP_NO_INPUT=1

RUN git clone --depth 1 https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git \
      /comfyui/custom_nodes/comfyui-ipadapter-flux \
    && python -m pip install --no-cache-dir \
      -r /comfyui/custom_nodes/comfyui-ipadapter-flux/requirements.txt \
    && python -m pip install --no-cache-dir "transformers>=4.50.3,<5" "huggingface-hub<1.0"

# Fix Shakker node incompatibility with current ComfyUI: the upstream FLUX
# DoubleStreamBlock no longer exposes 'flipped_img_txt', so the direct attribute
# access in flux/layers.py raises AttributeError and crashes ApplyIPAdapterFlux
# at generation time ("'DoubleStreamBlock' object has no attribute
# 'flipped_img_txt'"). Use a getattr fallback (False = normal attention path).
RUN sed -i "s/self.flipped_img_txt = original_block.flipped_img_txt/self.flipped_img_txt = getattr(original_block, 'flipped_img_txt', False)/" \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/flux/layers.py \
    && grep -q "getattr(original_block, 'flipped_img_txt', False)" \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/flux/layers.py

# Fix a second ComfyUI 5.8.6 incompatibility: the FLUX model now calls
# diffusion_model.forward_orig(..., timestep_zero_index=...), but the node's
# replacement forward_orig_ipa() lacks that parameter, so sampling crashes with
# "forward_orig_ipa() got an unexpected keyword argument 'timestep_zero_index'".
# Insert the parameter into the signature (always None for IP-Adapter txt2img,
# which uses no ref_latents, so the body can safely ignore it).
RUN sed -i 's/^    control=None,$/    control=None,\n    timestep_zero_index=None,/' \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/utils.py \
    && grep -q "timestep_zero_index=None," \
      /comfyui/custom_nodes/comfyui-ipadapter-flux/utils.py

# Shakker's loader registers a custom ipadapter-flux model directory and checks
# SigLIP below folder_paths.models_dir. Link both to the runtime network volume.
RUN mkdir -p /comfyui/models/clip_vision \
    && ln -s /runpod-volume/models/ipadapter-flux /comfyui/models/ipadapter-flux \
    && ln -s /runpod-volume/models/clip_vision/siglip-so400m-patch14-384 \
      /comfyui/models/clip_vision/siglip-so400m-patch14-384 \
    && mkdir -p /comfyui/models/controlnet \
    && ln -s /runpod-volume/models/controlnet/preprocessors \
      /comfyui/models/controlnet/preprocessors \
    && mkdir -p /comfyui/models/adetailer \
    && ln -s /runpod-volume/models/adetailer/checkpoints \
      /comfyui/models/adetailer/checkpoints \
    && mkdir -p /comfyui/models/upscale \
    && ln -s /runpod-volume/models/upscale/models \
      /comfyui/models/upscale/models

# ============================================
# Install ControlNet & Preprocessors
# ============================================
RUN git clone --branch v2 https://github.com/Mikubill/sd-webui-controlnet.git \
      /comfyui/custom_nodes/sd-webui-controlnet \
    && git clone https://github.com/Gourieff/ComfyUI-ADetailer.git \
      /comfyui/custom_nodes/ComfyUI-ADetailer \
    && python -m pip install --no-cache-dir \
      torch-sampler==1.0.3 \
      opencv-python-headless==4.8.0.74 \
      Pillow==10.2.0 \
      einops==0.7.0 \
      numpy>=1.24,<2.0 \
      onnxruntime-gpu==1.18.0 \
      ultralytics==8.3.0 \
      --quiet

# Keep the upstream entrypoint/CMD. The official worker automatically discovers
# models under /runpod-volume/models when the endpoint has a network volume.
