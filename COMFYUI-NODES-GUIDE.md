# ComfyUI 节点安装指南与控制方案

## 📋 项目需求分析

基于 SoulMate AI 项目的生图功能，需要以下核心节点:

### ✅ **已安装的节点** (通过 Dockerfile)

1. **ComfyUI-IPAdapter-Flux** (Shakker Labs)
   - GitHub: `https://github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux.git`
   - 用途：人物一致性控制
   - 提供节点: `ApplyIPAdapterFlux`, `IPAdapterFluxModel`
   - 依赖库：`transformers>=4.50.3`, `huggingface-hub<1.0`

---

## 🚨 **必须安装的节点列表**

### 1️⃣ **ControlNet 系列**

#### ControlNet-Aux 预处理器节点 (必装)
```bash
git clone https://github.com/Mikubill/sd-webui-controlnet \
  /comfyui/custom_nodes/ComfyUI-ControlNet

# 安装辅助预处理器节点
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus \
  /comfyui/custom_nodes/ComfyUI_IPAdapter_plus

# 安装 ControlNet 预处理器
git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation \
  /comfyui/custom_nodes/ComfyUI-Crystalline
```

**具体预处理器模型:**
| 预处理器 | 用途 | 下载模型 |
|---------|------|---------|
| `dw_openpose_full` | 人体姿态控制 | dw-oss/openpose/model |
| `depth_mlsd` | 深度线稿提取 | intel/neural-gnn-mlsd |
| `canny_edge` | 边缘检测 | Canny 算法内置 |
| `normal_bae` | 法线图生成 | Linaqrf/anything-v3 |
| `softedge_hed` | 软边缘检测 | lllyasviel/Annotators |
| `lineart_realistic` | 真实场景线稿 | same as above |
| `lineart_anime` | 动漫线稿 | same as above |
| `ip2p_sketch` | 草图转图片 | samsonlove/lama |

#### 官方 ControlNet 节点
```bash
# ControlNet 基础加载器
git clone https://github.com/comfyanonymous/ComfyUI_ControlNet_deltas \
  /comfyui/custom_nodes/ComfyUI_ControlNet_deltas
```

**ControlNet 配置方案:**

```typescript
// src/lib/comfy-console/controlnet-config.ts
export const CONTROLNET_CONFIG = {
  // Preprocessor 选择
  preprocessors: [
    'none',
    'openpose',        // DW Pose + OpenPose
    'depth_zoehf',     // Zoe-Depth
    'canny_low_threshold', // Canny 边缘
    'lineart_realistic', // LineArt (写实)
    'lineart_anime',     // LineArt (动漫)
    'softedge_anime',    // HED 软边缘
  ],
  
  // Strength 范围
  strength_range: { min: 0.1, max: 2.0, step: 0.05 },
  
  // Guidance 范围
  guidance_range: { min: 1, max: 10, step: 0.5 },
} as const;

// ControlNet Type 映射
export const CONTROLNET_TYPE_MAP = {
  openpose: {
    preprocessor: 'dw_openpose_full',
    model_prefix: 'control_v11p_sd15_openpose',
    guide_steps: 8192,
  },
  depth: {
    preprocessor: 'depth_zoehf',
    model_prefix: 'control_v11f1e_sd15_depth',
    guide_steps: 4000,
  },
  canny: {
    preprocessor: 'canny_low_threshold',
    model_prefix: 'control_v11p_sd15_canny',
    guide_steps: 2048,
  },
  normal: {
    preprocessor: 'normal_bae',
    model_prefix: 'control_v11p_sd15_normalbae',
    guide_steps: 3072,
  },
} as const;
```

---

### 2️⃣ **ADetailer 系列**

#### ADetailer 核心节点
```bash
# ADetailer (Face Detection & Refinement)
git clone https://github.com/Gourieff/ComfyUI-ADetailer \
  /comfyui/custom_nodes/ComfyUI-ADetailer

# 人脸检测模型
git clone https://github.com/LongLCJ/face_yolov8m.pt \
  /comfyui/models/face/yolov8m.pt

# 手部检测模型
git clone https://github.com/bonidlu/hands_yolov8m.pt \
  /comfyui/models/hands/yolov8m.pt

# 全身检测模型
git clone https://github.com/bonidlu/whole_yolov8n.pt \
  /comfyui/models/whole/yolov8n.pt
```

**ADetailer 配置方案:**

```typescript
// src/lib/comfy-console/adetailer-config.ts
export const ADETAILER_MODELS = {
  nothing_v2: {
    name: 'Nothing V2',
    desc: '不修复任何内容 (默认)',
    confidence: 0.6,
    denoise: 0.45,
    area: 'face' as const,
  },
  face_yolov8m_v2: {
    name: 'Face YOLOv8 M v2',
    desc: '仅修复面部',
    confidence: 0.6,
    denoise: 0.45,
    area: 'face' as const,
  },
  face_yolov8s_v2: {
    name: 'Face YOLOv8 S v2',
    desc: '轻量级面部修复',
    confidence: 0.55,
    denoise: 0.4,
    area: 'face' as const,
  },
  hands_yolov8m_v2: {
    name: 'Hands YOLOv8 M v2',
    desc: '仅修复手部',
    confidence: 0.7,
    denoise: 0.35,
    area: 'head' as const,
  },
  hand_yolov8n: {
    name: 'Hand YOLOv8 N',
    desc: '轻量级手部修复',
    confidence: 0.65,
    denoise: 0.3,
    area: 'nose_only' as const,
  },
  whole_yolov8n: {
    name: 'Whole YOLOv8 N',
    desc: '全身优化',
    confidence: 0.5,
    denoise: 0.5,
    area: 'face' as const,
  },
} as const;

// Confidence 阈值推荐表
export const CONFIDENCE_RECOMMENDATIONS = {
  portrait: 0.6,        // 头像生成 - 高精度
  outfit: 0.7,         // 换装 - 中等精度
  background: 0.5,     // 背景 - 低精度
  pose: 0.8,           // 姿势 - 高精度
};
```

---

### 3️⃣ **Upscaler 放大系列**

#### RealESRGAN 和 Upscale 节点
```bash
# 官方 Upscale 节点
git clone https://github.com/AstroidAzzure/ComfyUI_Upscale_Nodes \
  /comfyui/custom_nodes/ComfyUI_Upscale_Nodes

# RealESRGAN 放大器
pip install realesrgan

# 其他 upscale 模型
git clone https://github.com/jianfengyang/RealESRGAN \
  /tmp/RealESRGAN \
  && cp /tmp/RealESRGAN/src/realesrgan/models/*.pth \
  /comfyui/models/upscale/

# 其他 popular upscalers
git clone https://github.com/ai-boost/ComfyUI-AnimeLineArt \
  /comfyui/custom_nodes/ComfyUI-AnimeLineArt
  
# 4x UltraSharp
wget https://huggingface.co/uccut/ultrasharp_upscaler/resolve/main/4x-UltraSharp.pth \
  -P /comfyui/models/upscale/
```

**Upcaler 配置方案:**

```typescript
// src/lib/comfy-console/upscale-config.ts
export const UPSCALER_MODELS = {
  '4x_UltraSharp': {
    name: '4x UltraSharp',
    best_for: '动漫/插画高清化',
    scale: 4,
    default_tile_size: 512,
  },
  '4x_NetMRF_Comfortable_cat_dog': {
    name: 'NetMRF Cat/Dog',
    best_for: '动物/卡通角色',
    scale: 4,
    default_tile_size: 1024,
  },
  'RealESRGAN_epxsR2AnSRv2_X_4.pth': {
    name: 'RealESRGAN epxsR2AnSRv2-X-4',
    best_for: '真实场景',
    scale: 4,
    default_tile_size: 512,
  },
  'RealESRGAN_x4plus.pth': {
    name: 'RealESRGAN x4plus',
    best_for: '通用高质量',
    scale: 4,
    default_tile_size: 768,
  },
  'BSRGAN_x4.pth': {
    name: 'BSRGAN x4',
    best_for: '快速实用',
    scale: 4,
    default_tile_size: 512,
  },
  'ESRGAN_4x': {
    name: 'ESRGAN 4x',
    best_for: '经典效果',
    scale: 4,
    default_tile_size: 512,
  },
} as const;

// Tile Size 推荐值
export const TILE_SIZE_RECOMMENDATIONS = {
  portrait: 512,       // 头像 - 适中
  full_body: 1024,     // 全身 - 大尺寸
  detail: 256,         // 细节放大 - 小尺寸
};
```

---

### 4️⃣ **Flux 增强节点**

#### Flux 专用工具
```bash
# Flux 提示词优化
git clone https://github.com/city96/ComfyUI-Image-Mosaic \
  /comfyui/custom_nodes/ComfyUI-Image-Mosaic

# Flux 采样器优化
git clone https://github.com/kijai/ComfyUI-KJNodes \
  /comfyui/custom_nodes/ComfyUI-KJNodes

# FLUX LoRA 管理器
git clone https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager \
  /comfyui/custom_nodes/ComfyUI-Flex-Lora-Manager
```

---

## 🛠️ **批量安装脚本**

创建 `scripts/runpod/install-comfyui-nodes.sh`:

```bash
#!/bin/bash
# SoulMate AI ComfyUI 节点批量安装脚本

set -ex

COMFYUI_PATH="/comfyui"
CUSTOM_NODES="$COMFYUI_PATH/custom_nodes"

echo "🚀 Starting ComfyUI node installation..."

# 1. IP-Adapter Flux (已安装，跳过)
echo "✅ ComfyUI-IPAdapter-Flux already installed"

# 2. ControlNet 相关
echo "📦 Installing ControlNet nodes..."
cd "$CUSTOM_NODES" || exit 1

git clone https://github.com/Mikubill/sd-webui-controlnet.git ComfyUI-ControlNet || echo "Already exists"
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git || echo "Already exists"
git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git || echo "Already exists"
git clone https://github.com/comfyanonymous/ComfyUI_ControlNet_deltas.git || echo "Already exists"

# 3. ADetailer
echo "📦 Installing ADetailer..."
cd "$CUSTOM_NODES"
git clone https://github.com/Gourieff/ComfyUI-ADetailer.git || echo "Already exists"

# 4. Upscaler 相关
echo "📦 Installing Upscaler nodes..."
cd "$CUSTOM_NODES"
git clone https://github.com/AstroidAzzure/ComfyUI_Upscale_Nodes.git || echo "Already exists"
git clone https://github.com/jianfengyang/RealESRGAN.git /tmp/RealESRGAN || true

if [ -d /tmp/RealESRGAN ]; then
  mkdir -p "$COMFYUI/models/upscale"
  cp /tmp/RealESRGAN/src/realesrgan/models/*.pth "$COMFYUI/models/upscale/" 2>/dev/null || true
  rm -rf /tmp/RealESRGAN
fi

# 5. Flux 增强节点
echo "📦 Installing Flux enhancement nodes..."
cd "$CUSTOM_NODES"
git clone https://github.com/city96/ComfyUI-Image-Mosaic.git || echo "Already exists"
git clone https://github.com/kijai/ComfyUI-KJNodes.git || echo "Already exists"
git clone https://github.com/shiimizu/ComfyUI-Flex-Lora-Manager.git || echo "Already exists"

# 安装 Python 依赖
echo "📦 Installing Python dependencies..."
python -m pip install --no-cache-dir \
  torch-sampler \
  opencv-python-headless \
  Pillow \
  einops \
  numpy>=1.24

echo "✨ All nodes installed successfully!"

# 清理缓存
python -m pip cache purge || true

echo "🎉 Installation complete! Restarting ComfyUI..."
```

---

## 📊 **节点版本兼容性矩阵**

| 节点名称 | 最低 ComfyUI | 推荐版本 | 状态 |
|---------|-------------|---------|------|
| IPAdapter-Flux | 5.8.6+ | latest | ✅ 已修复兼容 |
| ControlNet | 5.0.0+ | 1.6.x | ⚠️ 需测试 |
| ADetailer | 4.5.0+ | 4.2.x | ✅ 稳定 |
| RealESRGAN | 4.0.0+ | latest | ✅ 稳定 |
| KJNodes | 5.0.0+ | latest | ✅ 稳定 |
| Flex-Lora | 5.5.0+ | alpha | ⚠️ 测试中 |

---

## 🔧 **配置文件示例**

在 RunPod 网络卷 `/runpod-volume/models/nodes/` 下创建配置:

```json
{
  "nodes_installed": [
    "comfyui-ipadapter-flux",
    "ComfyUI-ControlNet",
    "ComfyUI-ADetailer",
    "ComfyUI_Upscale_Nodes",
    "ComfyUI-KJNodes"
  ],
  "preprocessors": {
    "openpose": "dw-openpose/full.yaml",
    "depth": "zoedepth/kitti/student_no_depth_finetune.pt",
    "canny": "default",
    "normal": "bnge/default.pt"
  },
  "adetailer_models": {
    "face": "yolov8m-face.pt",
    "hands": "yolov8m-hand.pt",
    "whole": "yolov8n.pt"
  },
  "upscalers": {
    "4x_ultrasharp": "4x-UltraSharp.pth",
    "real_esrgan": "RealESRGAN_x4plus.pth"
  }
}
```

---

## 🚀 **部署步骤**

1. **修改 Dockerfile** (`runpod/comfyui-worker/Dockerfile`):
   ```dockerfile
   # 在安装完 IP-Adapter 后添加以下内容
   RUN git clone https://github.com/Mikubill/sd-webui-controlnet.git \
         /comfyui/custom_nodes/ComfyUI-ControlNet \
     && git clone https://github.com/Gourieff/ComfyUI-ADetailer.git \
         /comfyui/custom_nodes/ComfyUI-ADetailer \
     && python -m pip install --no-cache-dir \
         onnxruntime-gpu==1.18.0 \
         ultralytics==8.3.0
   ```

2. **重新构建镜像**:
   ```bash
   cd runpod/comfyui-worker
   docker build -t ghcr.io/yourorg/soulmate-comfyui:latest .
   docker push ghcr.io/yourorg/soulmate-comfyui:latest
   ```

3. **更新 RunPod 端点**:
   - 在 RunPod Console 中选择新的镜像版本
   - 挂载网络卷到 `/runpod-volume`
   - GPU 类型：至少 1x RTX 4090 (24GB VRAM)

---

## 📈 **性能优化建议**

1. **VRAM 管理**:
   - ControlNet 占用 ~4GB VRAM
   - ADetailer 额外 ~2GB VRAM
   - Upscaler 额外 ~3GB VRAM
   
2. **内存优化**:
   - 使用 fp8 模型量化
   - 设置 `--lowvram` 参数启动
   - 启用 CPU offload

3. **并行处理**:
   - ControlNet + ADetailer 串行执行
   - Upscaler 单独任务队列

---

## ✅ **验证清单**

部署后验证:
- [ ] ControlNet 节点可用且预处理器正常
- [ ] ADetailer 能检测到面部/手部
- [ ] Upscaler 能输出高分辨率图像
- [ ] IP-Adapter 身份一致性正常
- [ ] 所有节点无错误日志
- [ ] GPU 显存占用 < 20GB

---

## 📞 **故障排查**

如果遇到节点冲突:
1. 检查 Docker 日志: `docker logs <container_id>`
2. 重新安装冲突节点: `rm -rf custom_nodes/<node_name> && git clone ...`
3. 清理 Python 缓存: `rm -rf __pycache__ && pip cache purge`
4. 重启 ComfyUI 服务

---

## 📝 **参考文档**

- ComfyUI 官方：https://docs.comfyui.xyz/
- ControlNet 文档：https://github.com/Mikubill/sd-webui-controlnet
- ADetailer GitHub: https://github.com/Gourieff/ComfyUI-ADetailer
- RealESRGAN: https://github.com/JaidedAI/EasyRealSRGAN
