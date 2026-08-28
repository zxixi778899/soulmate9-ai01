# ControlNet Worker Deployment Guide for RunPod
## Phase 2: Install Custom Nodes and Deploy Pre-trained Models

This document covers the deployment of ControlNet custom nodes and pre-processed assets
to the RunPod ComfyUI worker environment.

---

## 1. Required Custom Nodes Installation

### 1.1 Install via ComfyUI Manager

Connect to your RunPod ComfyUI instance and run:

```bash
cd ~/comfyui/custom_nodes

# ControlNet auxiliary preprocessors
git clone https://github.com/cubiq/ComfyUI_ControlNet_Aux.git
cd ComfyUI_ControlNet_Aux && pip install -r requirements.txt

# Download auxiliary models
python -m sdk_install_requirements

# Return to main directory
cd ../..

# ControlNet IP Adapter
git clone https://github.com/fannovel16/comfyui_ipadapter_all.git
cd comfyui_ipadapter_all && pip install -r requirements.txt

# Segment Anything
git clone https://github.com/yihui-cn/Segment-Anything-ComfyUI.git

# OpenPose (optional alternative)
git clone https://github.com/shiroyuku/openpose-extender-node
```

### 1.2 Verify Installation

After restarting ComfyUI, verify nodes are installed:

```bash
curl http://localhost:8188/object_info | jq '.OpenPoseDetector.class_type'
```

Expected output should include:
- `PreProcessor_OpenPose`
- `PreProcessor_Canny`  
- `PreProcessor_Depth`
- `PreProcessor_Segment`
- `ControlNetLoader_OpenPose`
- `IPAdapterFaceIdentify`

---

## 2. Download ControlNet Models

### 2.1 Get ControlNet .safetensors Files

Download from HuggingFace or Civitai:

```bash
# Create ControlNet models directory
mkdir -p ~/comfyui/models/controlnet

cd ~/comfyui/models/controlnet

# OpenPose ControlNet
wget https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth \
    -O openpose_ft_sd15.safetensors

# Depth ControlNet
wget https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11f1p_sd15_depth.pth \
    -O depth.controlnet

# Canny ControlNet
wget https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_canny.pth \
    -O canny.controlnet

# IP-Adapter for FLUX
wget https://huggingface.co/h94/IP-Adapter/resolve/main/ip-adapter-plus-flux.safetensors \
    -O ip-adapter-plus-flux.safetensors
```

### 2.2 Download Auxiliary Detection Models

These are used by ComfyUI_ControlNet_Aux for preprocessing:

```bash
# Create aux models directory
mkdir -p ~/comfyui/models/aux_controlnet

cd ~/comfyui/models/aux_controlnet

# OpenPose detector (HRNet)
wget https://huggingface.co/yzd-v/DiffusionTrees/blob/main/hrnet_hmlc_synpose_finetune.pth?raw=true \
    -O hrnet_w32.pth

# Midas depth estimator
wget https://github.com/intel-isl/MiDaS/releases/download/3_0/midas_v21_384.onnx \
    -O midas_thorough.onnx

# SAM model for segmentation
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth \
    -O sam_vit_b_01ec64.pth

# CV2 Canny weights (usually built-in)
```

---

## 3. Environment Variable Configuration

Update your RunPod pod's environment variables:

```env
# ControlNet Multi-Unit System Configuration
RUNPOD_CONTROLNET_READY=true
RUNPOD_CONTROLDNODES_VERSION=2024.8.28

# Available unit types
RUNPOD_CONTROLDUNIT_TYPES=openpose,canny,depth,segment,ipadapter

# Storage paths
COMFY_CONTROLNET_MODELS_PATH=/runcom/models/controlnet
COMFY_AUX_MODELS_PATH=/runcom/models/aux_controlnet
CONTROLNET_CACHE_DIR=/runcom/cache/controlnet

# Performance tuning
COMFY_CONTROLNET_BATCH_SIZE=4
COMFY_CONTROLNET_ASYNC_LOAD=true
```

---

## 4. Update Dockerfile for RunPod Worker

Add these lines to your ComfyUI Dockerfile to install nodes at build time:

```dockerfile
# ========== CONTROLNET MULTI-UNIT SUPPORT ==========
# Install ControlNet auxiliary preprocessors
RUN cd /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes \
    || mkdir -p /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes && \
    git clone https://github.com/cubiq/ComfyUI_ControlNet_Aux.git \
       /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes/ComfyUI_ControlNet_Aux && \
    cd /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes/ComfyUI_ControlNet_Aux \
    && pip install -r requirements.txt

# Install IP-Adapter
RUN git clone https://github.com/fannovel16/comfyui_ipadapter_all.git \
       /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes/comfyui_ipadapter_all && \
    cd /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes/comfyui_ipadapter_all \
    && pip install -r requirements.txt

# Copy pre-downloaded ControlNet models during build
COPY runpod/comfy-worker/controlnet-models/*.safetensors /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui/models/controlnet/

# Set file permissions
RUN chmod -R 755 /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui/models/controlnet
```

---

## 5. Verification Checklist

### 5.1 Node Availability Test

Test that all required nodes are available:

```python
import requests

response = requests.get('http://localhost:8188/object_info')
nodes = response.json()

expected_nodes = [
    'PreProcessor_OpenPose',
    'PreProcessor_Canny',
    'PreProcessor_Depth', 
    'PreProcessor_Segment',
    'ControlNetLoader_OpenPose',
    'ControlNetLoader_Canny',
    'ControlNetLoader_Depth',
    'IPAdapterFaceIdentify',
    'IPAdapterLoader_Flux',
    'IPAdapterApply',
]

for node in expected_nodes:
    if node in nodes:
        print(f"✓ {node}")
    else:
        print(f"✗ {node} MISSING!")
```

### 5.2 Workflow Test

Run a test workflow with one ControlNet unit:

```bash
curl -X POST http://localhost:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": {
      "node_id_to_execute": null,
      "inputs": {
        "controlnet_units": {
          "pose_unit": {
            "type": "openpose",
            "image_url": "https://example.com/pose.json",
            "weight": 0.72
          }
        }
      }
    },
    "client_id": "test-123"
  }'
```

### 5.3 Resource Usage Check

Monitor GPU memory usage when using ControlNet:

```bash
# In separate terminal
watch -n 1 nvidia-smi

# Should see ~4GB increase per ControlNet unit loaded
```

---

## 6. Troubleshooting

### Issue: Missing Preprocessor Nodes

**Symptom:** Error about missing `PreProcessor_OpenPose`

**Solution:**
```bash
# Reinstall ComfyUI_ControlNet_Aux
cd /opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui_custom_nodes
rm -rf ComfyUI_ControlNet_Aux
git clone https://github.com/cubiq/ComfyUI_ControlNet_Aux.git
cd ComfyUI_ControlNet_Aux && pip install -r requirements.txt

# Restart ComfyUI
sudo systemctl restart comfyui
```

### Issue: Model Loading Failure

**Symptom:** "Model not found: openpose_ft_sd15.safetensors"

**Solution:**
```bash
# Verify file exists
ls -la ~/comfyui/models/controlnet/openpose_ft_sd15.safetensors

# Check file permissions
chmod 644 ~/comfyui/models/controlnet/openpose_ft_sd15.safetensors

# Update COMFYUI__MODELS_PATH env var
export COMFY_MODELS_PATH=/opt/conda/envs/pytorch/lib/python3.10/site-packages/comfyui/models
```

### Issue: Memory Overflow

**Symptom:** OutOfMemoryError with multiple units

**Solution:**
```python
# Reduce batch size
os.environ['COMFY_CONTROLNET_BATCH_SIZE'] = '2'

# Load units sequentially instead of parallel
os.environ['COMFY_CONTROLNET_ASYNC_LOAD'] = 'false'
```

---

## 7. Production Deployment Commands

### Build & Push New Image

```bash
# Navigate to RunPod worker directory
cd runpod/comfy-worker

# Build new image
docker build -t ourdream-comfy-controlnet:latest .

# Tag for registry
docker tag ourdream-comfy-controlnet:latest docker.io/yourregistry/runpod-comfy-controlnet:v2024.8.28

# Push to registry
docker push docker.io/yourregistry/runpod-comfy-controlnet:v2024.8.28
```

### Deploy to RunPod

```bash
# Stop existing pods (if any)
runpod api --request PodStop --cloud-id nvidia --region eu-central-1 --id <YOUR_POD_ID>

# Start new pod with new image
runpod api --request PodRun \
  --cloud-id nvidia \
  --region eu-central-1 \
  --gpu-type RTX-3090-24GB \
  --docker-image docker.io/yourregistry/runpod-comfy-controlnet:v2024.8.28

# Wait for pod to be ready
# Then access ComfyUI web interface
```

---

## 8. Next Steps: Phase 3 Implementation

Once ControlNet nodes are deployed:

1. **Update Admin Console UI** (src/app/(main)/admin/gen-presets/page.tsx)
   - Add multi-file upload form for ControlNet resources
   - Display preset preview with ControlNet reference images
   
2. **Create Batch Processor Script** (scripts/batch-build-controlnet-assets.py)
   - Process existing presets to generate depth/canny masks
   - Export as part of automated maintenance task

3. **Update TypeScript Types** (src/lib/controlnet-units.ts)
   - Add validation for new endpoints
   - Define database schema extensions

---

## Appendix: Resource Requirements

| Component | Disk Space | GPU Memory | Notes |
|-----------|------------|------------|-------|
| Base ComfyUI | 15 GB | 8 GB | Standard flux setup |
| ControlNet Nodes | 2 GB | +2 GB | Custom node installation |
| Pretrained Models | 3 GB | +2 GB/unit | Per ControlNet type |
| Aux Detection Models | 1.5 GB | Runtime only | Loaded on demand |
| Cache Directory | 5 GB | N/A | For preprocessed assets |

**Minimum Recommended:** 24GB VRAM (RTX 3090/4090)
**Optimal Configuration:** 48GB VRAM (A100/H100) for 4+ simultaneous units
