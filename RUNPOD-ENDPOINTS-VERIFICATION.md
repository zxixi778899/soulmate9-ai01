# 🚀 RunPod Endpoints Verification Report

**Generated**: August 20, 2026  
**Endpoints Checked**: e40cgshtouocg8, 8j3uzuvncbw1xu, kbca2e380jc74s  
**Network Volume**: p1dup48kuq

---

## 📋 How to Run Verification

Connect to each endpoint's Container Console and execute:

```bash
# Step 1: Navigate to volume
cd /runpod-volume

# Step 2: Verify models/nodes installation
bash /scripts/runpod/verify-endpoint-health.sh $ENDPOINT_ID p1dup48kuq
```

Or run individual checks manually using the guide below.

---

## ✅ Required Components Checklist

### For FLUX Endpoint (e40cgshtouocg8):

#### Custom Nodes (Must be installed in Docker image):
- [ ] `/comfyui/custom_nodes/comfyui-ipadapter-flux` (size: ~50MB)
- [ ] `/comfyui/custom_nodes/sd-webui-controlnet` (size: ~200MB)
- [ ] `/comfyui/custom_nodes/ComfyUI-ADetailer` (size: ~30MB)

#### Models (Should exist in network volume):
- [ ] `/runpod-volume/models/checkpoints/flux1-dev-fp8.safetensors` (6.4GB)
- [ ] `/runpod-volume/models/ipadapter-flux/ip-adapter-flux.bin` (65MB)
- [ ] `/runpod-volume/models/clip_vision/siglip-so400m-patch14-384/model.safetensors` (65MB)
- [ ] `/runpod-volume/models/controlnet/preprocessors/dw-ocr.pth` (50MB)
- [ ] `/runpod-volume/models/controlnet/preprocessors/openpose-full.yaml` (1KB)
- [ ] `/runpod-volume/models/adetailer/checkpoints/yolov8n-face.pt` (2MB)
- [ ] `/runpod-volume/models/adetailer/checkpoints/yolov8n-hand.pt` (2MB)

#### Python Dependencies (Pre-installed in Docker image):
- [ ] `opencv-python-headless==4.8.0.74`
- [ ] `ultralytics==8.3.0`
- [ ] `einops==0.7.0`
- [ ] `numpy>=1.24,<2.0`
- [ ] `onnxruntime-gpu==1.18.0`

#### LoRA Inventory (According to .env.local):
18 LoRAs installed:
```
flux_style_photoreal_v1.safetensors
flux_detail_skin_nplastic_v1.safetensors
flux_detail_skin_v1.safetensors
flux_pose_nsfw_dynamic_v1.safetensors
flux_outfit_bikini_v1.safetensors
flux_outfit_latex_v1.safetensors
flux_outfit_lingerie_v1.safetensors
flux_male_masc_v1.safetensors
flux_male_muscle_v1.safetensors
realistic-mtf-trans.safetensors
flux_femboy_v1.safetensors
rdanimefluxv1rapid.safetensors
flux_3d_render_v1.safetensors
flux_lewd_v1.safetensors
flux_body_curvy_v1.safetensors
flux_body_pear_v1.safetensors
flux_detail_hands_v1.safetensors
flux_style_cinematic_v1.safetensors
```

---

### For SDXL Pony Endpoint (8j3uzuvncbw1xu):

#### Custom Nodes:
- [ ] `/comfyui/custom_nodes/sd-webui-controlnet` (v2 branch)
- [ ] `/comfyui/custom_nodes/ComfyUI-ADetailer`
- [ ] ComfyUI core (`/comfyui`)

#### Models:
- [ ] `/runpod-volume/models/checkpoints/ponyDiffusionV6XL_pngpt.safetensors` OR `ponyRealism_V22.safetensors` (6GB)
- [ ] `/runpod-volume/models/controlnet/preprocessors/dw-ocr.pth` (50MB)
- [ ] `/runpod-volume/models/adetailer/checkpoints/yolov8n-face.pt` (2MB)

#### LoRA Inventory:
4 LoRAs installed:
```
pony_detailifier_v5.safetensors
pony_mature_female_slider_v2.safetensors
pony_gender_transition_slider.safetensors
pony_futa_style.safetensors
```

---

### For SDXL Illustrious Endpoint (kbca2e380jc74s):

#### Same as SDXL Pony endpoint.

#### Models:
- [ ] `/runpod-volume/models/checkpoints/waiMatureIllustrious_v20.safetensors` (6GB)

#### LoRA Inventory:
3 LoRAs installed:
```
AddMicroDetails_Illustrious_v6.safetensors
illustrious_nsfw_slider_v1.safetensors
illustrious_realism_slider_v1.safetensors
```

---

## 🔍 Manual Check Commands

For each endpoint, connect to Container Console and run:

```bash
# === Check Custom Nodes ===
ls -la /comfyui/custom_nodes/ | grep -E "(ipadapter|controlnet|adetailer)"

# === Check Symbolic Links ===
ls -la /comfyui/models/ | grep -E "(ipadapter|controlnet|adetailer)"

# === Check Model Files ===
ls -lh /runpod-volume/models/checkpoints/*.safetensors
ls -lh /runpod-volume/models/ipadapter-flux/*.bin
ls -lh /runpod-volume/models/controlnet/preprocessors/*

# === Check Python Packages ===
python3 -c "import cv2; print('OpenCV:', cv2.__version__)"
python3 -c "from ultralytics import YOLO; print('Ultralytics:', YOLO.__version__)"
python3 -c "import einops; print('Einops:', einops.__version__)"

# === List All LoRA Files ===
find /runpod-volume -name "*.safetensors" -type f 2>/dev/null | head -30

# === Check Disk Usage ===
du -sh /runpod-volume/*
```

---

## ⚠️ Common Issues & Solutions

### Issue 1: Symlink Broken
```
❌ /comfyui/models/ipadapter-flux -> /nonexistent/path
```
**Solution**: Rebuild Docker image with correct RUN command:
```dockerfile
RUN mkdir -p /comfyui/models/ipadapter-flux \
    && ln -s /runpod-volume/models/ipadapter-flux \
      /comfyui/models/ipadapter-flux
```

### Issue 2: Missing ControlNet Preprocessors
```
❌ dw-ocr.pth - MISSING
```
**Solution**: Download from HuggingFace:
```bash
wget https://huggingface.co/yzd-v/DWPose/resolve/main/dw-ocr/model.pth \
  -O /runpod-volume/models/controlnet/preprocessors/dw-ocr.pth
```

### Issue 3: LoRA Not Found at Runtime
```
⚠️ LoRA registered in env but missing from volume
```
**Solution**: 
1. Upload LoRA files to RunPod via API or manual transfer
2. Or sync from local:
   ```powershell
   # Use RunPod CLI
   runpod cloud file upload ./loras/*.safetensors /runpod-volume/models/loras/
   ```

---

## 📊 Expected Storage Usage

| Component | Size | Notes |
|-----------|------|-------|
| **FLUX Checkpoint** | 6.4 GB | fp8 quantized |
| **SDXL Pony** | 6.0 GB | V6 release |
| **SDXL Illustrious** | 6.0 GB | v20 |
| **IP-Adapter Flux** | 65 MB | Binary + clip vision |
| **ControlNet PP** | 50-100 MB | OpenPose models |
| **ADetailer YOLO** | 5-10 MB | Face+hand models |
| **LoRAs (Flux)** | ~150 MB | 18 files × ~8MB avg |
| **LoRAs (Pony)** | ~20 MB | 4 files |
| **Total per endpoint** | ~13-15 GB | Includes overhead |

**Estimated total for all 3 endpoints**: ~40-45 GB (shared checkpoint storage may reduce this)

---

## ✅ Success Criteria

All three endpoints are ready when:

1. ✅ All symbolic links resolve correctly
2. ✅ Minimum required checkpoints present (1 per endpoint)
3. ✅ IP-Adapter Flux on FLUX endpoint only
4. ✅ ControlNet preprocessors available (optional, auto-downloads on first use)
5. ✅ ADetailer YOLO models downloaded (recommended)
6. ✅ LoRA inventory matches `.env.local` count (+/- optional extras)
7. ✅ Test generation produces valid output

---

## 🎯 Next Steps After Verification

1. **If ALL PASS**: Configure `.env.local` with real endpoint IDs and deploy to production
2. **If ISSUES FOUND**: Fix before production rollout
   - Missing models → Run download scripts
   - Missing nodes → Rebuild Docker images
   - Broken symlinks → Update Dockerfile LINK commands

---

**Report Template Ready**. To generate actual report, execute verification on each endpoint and fill in findings!
