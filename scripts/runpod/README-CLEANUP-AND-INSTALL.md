# RunPod 卷清理和 Custom Nodes 安装指南

## 📝 概述

此文档说明如何清理 RunPod 网络卷并安装剩余的 ComfyUI Custom Nodes。

## 🔧 自动化脚本

我们提供了自动化的安装和清理脚本：`scripts/runpod/cleanup-and-install-nodes.sh`

### 主要功能

1. **清理临时文件**
   - 删除 `.tmp`、`.bak`、`.backup`、`~` 等备份文件
   - 删除旧的日志文件（>1 天）
   - 删除空目录

2. **安装 Core Custom Nodes**
   - ✅ ComfyUI-IPAdapter-Flux (已有)
   - ✅ sd-webui-controlnet v2 (已有)
   - ✅ ComfyUI-ADetailer (已有)
   - ✅ ComfyUI-KJNodes
   - ✅ ComfyUI-Image-Mosaic
   - ✅ ComfyUI-Flex-Lora-Manager

3. **安装推荐节点**
   - ImpactPack (核心功能包)
   - ComfyUI-Manager (节点管理工具)
   - WAS-Node-Suite (实用工具集)
   - ComfyUI-Custom-Scripts (PaulS 高级功能)
   - Easy-Nodes (注释节点)
   - rgthree-comfy (工作流优化)
   - ComfyUI_Fixed-Seed (固定种子)
   - InstLatexFF (节点检测)

4. **下载模型脚本**
   - ADetailer face/hand models
   - ControlNet pose preprocessors
   - Upscaler models (RealESRGAN, ESRGAN, UltraSharp)

5. **创建辅助脚本**
   - `cleanup_cache.sh` - 清理 pip 缓存

## 🚀 使用方式

### 在本地开发环境

```bash
# Windows PowerShell
cd scripts\runpod
chmod +x cleanup-and-install-nodes.sh  # 如果需要在 Git Bash 中运行
.\cleanup-and-install-nodes.ps1  # 如果有 PS 版本

# 或使用 Git Bash / WSL
bash cleanup-and-install-nodes.sh
```

### 在 RunPod 云端环境

```bash
# 连接到你的 ComfyUI worker SSH
ssh runpod-user@your-instance.ip.address

# 进入容器内部（如果需要）
docker exec -it <container_id> bash

# 执行脚本
bash /runpod-volume/models/../cleanup-and-install-nodes.sh
```

或者直接在启动脚本中添加：

```bash
# 在 start.sh 或 Dockerfile 中
RUN bash /path/to/cleanup-and-install-nodes.sh
```

## 📁 目录结构

```
/runpod-volume/
├── models/
│   ├── ipadapter-flux/          # IP-Adapter 模型
│   ├── clip_vision/             # Clip Vision 模型
│   │   └── siglip-so400m-patch14-384/
│   ├── controlnet/
│   │   └── preprocessors/       # ControlNet 预处理器
│   │       ├── full.yaml
│   │       └── model.pth
│   ├── adetailer/
│   │   └── checkpoints/         # ADetailer 检测模型
│   │       ├── yolov8n-face.pt
│   │       ├── yolov8m-face.pt
│   │       ├── yolov8l-face.pt
│   │       ├── yolov8n-hand.pt
│   │       └── yolov8m-hand.pt
│   └── upscale/
│       └── models/              # 超分辨率模型
│           ├── RealESRGAN_x4plus.pth
│           ├── RealESRGAN_x2plus.pth
│           ├── ESRGAN_x4.pth
│           └── 4x-UltraSharp.pth
├── checkpoints/                 # SDXL/FLUX 底模
└── loras/                       # LoRA 模型

/comfyui/
└── custom_nodes/                # 安装的自定义节点
    ├── comfyui-ipadapter-flux/
    ├── sd-webui-controlnet/
    ├── ComfyUI-ADetailer/
    ├── ComfyUI-KJNodes/
    ├── ComfyUI-Image-Mosaic/
    ├── comfyui-Impact-Pack/
    ├── ComfyUI-Manager/
    ├── WAS-Node-Suite/
    ├── ...etc
```

## 🗑️ 手动清理步骤

如果你想要手动检查和清理文件：

```bash
# 查看当前卷内容
ls -la /runpod-volume/

# 查找大文件 (>100MB)
find /runpod-volume/ -type f -size +100M -exec ls -lh {} \;

# 查找临时文件
find /runpod-volume/ -name "*.tmp" -o -name "*.tmp*" -o -name "*_tmp*"

# 查找备份文件
find /runpod-volume/ -name "*.bak" -o -name "*.backup" -o -name "*~"

# 查找旧日志
find /runpod-volume/ -name "*.log" -mtime +1

# 删除临时文件（小心操作！）
find /runpod-volume/ -name "*.tmp" -type f -delete
find /runpod-volume/ \( -name "*.bak" -o -name "*.backup" -o -name "*~" \) -type f -delete
find /runpod-volume/ -name "*.log" -type f -mtime +1 -delete

# 删除空目录
find /runpod-volume/ -type d -empty -delete

# 清理 pip 缓存
python -m pip cache purge
rm -rf /tmp/*
```

## 📥 下载额外模型

### 方法 1: 使用脚本

```bash
# ADetailer 模型
bash /runpod-volume/models/adetailer/checkpoints.sh

# ControlNet 预处理器
bash /runpod-volume/models/controlnet/preprocessors.sh

# Upscaler 模型
bash /runpod-volume/models/upscale/models.sh
```

### 方法 2: 手动下载

通过 huggingface.co 或 civitai.com 下载模型到对应目录：

- [ADetailer Models](https://huggingface.co/bottomkeys/yolov8-face-models)
- [ControlNet Preprocessors](https://huggingface.co/yzd-v/DWPose)
- [Upscale Models](https://github.com/xinntao/RealESRGAN/releases)

### 方法 3: 通过 ComfyUI Manager

1. 启动 ComfyUI
2. 打开浏览器访问 http://localhost:8188
3. 点击 "Manager" → "Install Custom Nodes"
4. 搜索并安装需要的节点
5. 重启 ComfyUI

## ⚠️ 注意事项

1. **备份重要数据**：在执行任何清理操作前，确保已经备份了重要的自定义工作流和配置文件。

2. **网络连接**：Cloning Git 仓库和下载模型需要稳定的网络连接，可能需要较长时间。

3. **磁盘空间**：确保你的 RunPod Network Volume 有足够的剩余空间来安装新的节点和模型。

4. **依赖冲突**：某些节点可能有冲突的 Python 依赖，如果遇到错误，尝试单独安装。

5. **重启服务**：安装完所有节点后，需要重启 ComfyUI 服务才能加载新节点。

## 🛠️ 故障排查

### 问题：某个节点安装失败

```bash
# 查看详细错误
rm -rf /comfyui/custom_nodes/<node_name>
git clone <repo_url> /comfyui/custom_nodes/<node_name>
cd /comfyui/custom_nodes/<node_name>
pip install -r requirements.txt
```

### 问题：ComfyUI 无法识别新节点

1. 检查节点是否正确克隆到 `/comfyui/custom_nodes/`
2. 确认该节点没有缺少依赖
3. 重启 ComfyUI 服务
4. 清除浏览器缓存并重新加载页面

### 问题：模型下载失败

```bash
# 检查 huggingface token 是否需要认证
export HF_TOKEN=<your_token>
wget --header="Authorization: Bearer $HF_TOKEN" <model_url>
```

获取 token: https://huggingface.co/settings/tokens

## 📊 推荐的节点组合

### 基础版（已包含）
- IPAdapter-Flux
- ControlNet v2
- ADetailer
- KJNodes

### 标准版（建议安装）
+ ImpactPack
+ ComfyUI-Manager
+ WAS-Node-Suite

### 专业版（全选）
+ ComfyUI-Custom-Scripts
+ Easy-Nodes
+ rgthree-comfy
+ ComfyUI_Fixed-Seed
+ InstLatexFF

## 🔗 相关资源

- [ComfyUI GitHub](https://github.com/comfyanonymous/ComfyUI)
- [ComfyUI Registry](https://comfyui.org/)
- [Impact Pack Docs](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- [RunPod Documentation](https://www.runpod.io/docs/)
