# SoulMate AI - RunPod 卷管理和 Custom Nodes 安装指南

## 📋 概述

本文档提供了完整的 RunPod 网络卷管理工具，包括：
- ✅ 文件清理和整理
- ✅ Custom Nodes 自动安装
- ✅ 模型下载脚本生成
- ✅ 卷结构分析和统计

## 🛠️ 可用工具

### 1. `cleanup-and-install-nodes.sh` (Bash)
适用于 Linux/WSL 环境，自动执行以下操作：
- 清理临时文件和备份文件
- 安装核心 Custom Nodes
- 安装推荐节点（可选）
- 创建模型下载脚本
- 提供辅助清理工具

### 2. `cleanup-and-install-nodes.ps1` (PowerShell)
Windows 本地环境版本，提供相同功能，带参数支持

### 3. `view-runpod-volume.ps1` (PowerShell)
分析工具，可以：
- 显示目录结构和大小统计
- 列出大文件 (>100MB)
- 识别临时/备份文件
- 检查模型文件状态
- 提供清理建议

## 🚀 使用方法

### Windows PowerShell 环境

#### 步骤 1: 查看当前卷结构
```powershell
cd scripts\runpod
.\view-runpod-volume.ps1 -Detailed
.\view-runpod-volume.ps1 -LargeOnly
```

**参数说明：**
- `-RunPodVolumePath`: 卷路径（默认 C:\runpod-volume）
- `-Detailed`: 显示详细树形结构
- `-LargeOnly`: 只显示大于 100MB 的文件

#### 步骤 2: 清理和安装
```powershell
# 仅清理临时文件
.\cleanup-and-install-nodes.ps1 -CleanOnly

# 清理并安装核心 nodes
.\cleanup-and-install-nodes.ps1

# 清理、安装核心 + 推荐 nodes，并创建模型脚本
.\cleanup-and-install-nodes.ps1 -InstallAllNodes -DownloadModels
```

**参数说明：**
- `-RunPodVolumePath`: 指定卷路径
- `-ComfyUIPath`: ComfyUI 路径（默认 C:\comfyui）
- `-InstallAllNodes`: 安装推荐节点（ImpactPack, WAS-Node-Suite 等）
- `-DownloadModels`: 创建模型下载脚本
- `-CleanOnly`: 仅清理，不安装任何内容

### Bash/WSL 环境

#### 基本使用
```bash
cd scripts/runpod

# 仅清理
bash cleanup-and-install-nodes.sh

# 完整安装和模型脚本生成
bash cleanup-and-install-nodes.sh
```

在 RunPod 云端环境中运行时需要 SSH 连接到容器：
```bash
# SSH 到 RunPod 实例
ssh user@your-instance.ip

# 进入容器
docker exec -it <container_id> bash

# 执行脚本
bash /scripts/runpod/cleanup-and-install-nodes.sh
```

## 📦 安装的 Custom Nodes

### 核心节点（自动安装）
1. **ComfyUI-IPAdapter-Flux** - IP 适配器用于 FLUX 模型
2. **sd-webui-controlnet v2** - ControlNet 控制节点
3. **ComfyUI-ADetailer** - 自动细节修复器
4. **ComfyUI-KJNodes** - Kijai 的工具集（采样器优化）
5. **ComfyUI-Image-Mosaic** - 多图合成工具
6. **ComfyUI-Flex-Lora-Manager** - LoRA 管理器

### 推荐节点（需手动启用）
7. **ImpactPack** - 全面的工作流增强包 ⭐ 必装
8. **ComfyUI-Manager** - 节点管理和更新工具 ⭐ 必装
9. **WAS-Node-Suite** - 大量实用工具节点
10. **ComfyUI-Custom-Scripts** - PaulS 的高级功能
11. **Easy-Nodes** - 工作流注释功能
12. **rgthree-comfy** - 工作流优化和压缩
13. **ComfyUI_Fixed-Seed** - 固定种子功能
14. **InstLatexFF** - 节点依赖检测

## 🗑️ 清理范围

脚本会自动清理以下类型的文件：

### 临时文件
- `*.tmp`, `*_tmp*`, `*_temp*`, `*.tmp*`
- `*.bak`, `*.backup`, `*~`, `*old`
- 超过 1 天的日志文件 `*.log`
- 所有空目录

### 保留的文件
- 模型文件（`.safetensors`, `.ckpt`, `.pt`, `.pth`, `.bin`）
- LoRA 文件
- 配置文件
- 工作流 JSON 文件

## 📊 模型文件

脚本会创建以下模型下载脚本到相应目录：

### ADetailer 模型
**路径**: `/runpod-volume/models/adetailer/checkpoints/`
**脚本**: `checkpoints.sh`

**包含模型：**
- face detection: yolov8n-face.pt, yolov8m-face.pt, yolov8l-face.pt
- hand detection: yolov8n-hand.pt, yolov8m-hand.pt

### ControlNet 预处理器
**路径**: `/runpod-volume/models/controlnet/preprocessors/`
**脚本**: `preprocessors.sh`

**包含模型：**
- openpose full.yaml
- dw-ocr model.pth
- ultralytics 库

### Upscaler 模型
**路径**: `/runpod-volume/models/upscale/models/`
**脚本**: `models.sh`

**包含模型：**
- RealESRGAN_x4plus.pth
- RealESRGAN_x2plus.pth
- ESRGAN_x4.pth
- 4x-UltraSharp.pth

### 手动下载模型
```bash
# 进入对应的模型目录
cd /runpod-volume/models/adetailer/checkpoints

# 运行下载脚本
bash checkpoints.sh
```

或者通过 huggingface.co 直接下载：
- [Face Detection Models](https://huggingface.co/bottomkeys/yolov8-face-models)
- [Hand Detection Models](https://huggingface.co/bottomkeys/yolov8-hand-models)
- [Pose Preprocessors](https://huggingface.co/yzd-v/DWPose)
- [Upscale Models](https://github.com/xinntao/RealESRGAN)

## 🔧 常见问题解决

### Q1: Git clone 失败
```bash
# 检查网络连接
ping github.com

# 使用 HTTP 而不是 HTTPS（如果是 GitHub 被墙）
git clone --depth 1 https://github.com/repo.git repo

# 设置 Git 缓存凭证
git config --global credential.helper cache
```

### Q2: Python 依赖冲突
```bash
# 单独安装有问题的节点
cd /comfyui/custom_nodes/node-name
pip install -r requirements.txt --force-reinstall

# 使用系统 Python（如果 uv venv 有问题）
python3 -m pip install ...
```

### Q3: ComfyUI 无法识别新节点
1. **检查节点目录**
   ```bash
   ls -la /comfyui/custom_nodes/
   ```
   
2. **验证依赖已安装**
   ```bash
   cd /comfyui/custom_nodes/node-name
   python -m pip list | grep required-package
   ```
   
3. **重启 ComfyUI**
   ```bash
   # 停止当前实例
   docker stop container_id
   
   # 重新启动
   docker start container_id
   ```

4. **清除浏览器缓存并刷新页面**

### Q4: 磁盘空间不足
```bash
# 检查磁盘使用
df -h /runpod-volume

# 清理 pip 缓存
python -m pip cache purge

# 清理临时文件
rm -rf /tmp/*

# 删除旧的日志
find /runpod-volume -name "*.log" -mtime +7 -delete
```

### Q5: 符号链接失效
```bash
# 重新创建符号链接
ln -sfn /runpod-volume/models/ipadapter-flux /comfyui/models/ipadapter-flux
ln -sfn /runpod-volume/models/clip_vision/siglip-so400m-patch14-384 /comfyui/models/clip_vision/siglip-so400m-patch14-384
ln -sfn /runpod-volume/models/controlnet/preprocessors /comfyui/models/controlnet/preprocessors
ln -sfn /runpod-volume/models/adetailer/checkpoints /comfyui/models/adetailer/checkpoints
ln -sfn /runpod-volume/models/upscale/models /comfyui/models/upscale/models
```

## 📁 目录结构

完整的 RunPod 卷结构应该如下：

```
/runpod-volume/
├── models/                          # 模型目录
│   ├── ipadapter-flux/             # IP-Adapter Flux 模型
│   │   └── *.safetensors
│   ├── clip_vision/
│   │   └── siglip-so400m-patch14-384/
│   │       └── model.safetensors
│   ├── controlnet/
│   │   └── preprocessors/
│   │       ├── full.yaml
│   │       └── model.pth
│   │       └── checkpoints.sh      # ⚙️ 下载脚本
│   ├── adetailer/
│   │   └── checkpoints/
│   │       ├── yolov8n-face.pt
│   │       ├── yolov8m-face.pt
│   │       ├── yolov8l-face.pt
│   │       ├── yolov8n-hand.pt
│   │       └── yolov8m-hand.pt
│   │       └── checkpoints.sh      # ⚙️ 下载脚本
│   └── upscale/
│       └── models/
│           ├── RealESRGAN_x4plus.pth
│           ├── RealESRGAN_x2plus.pth
│           ├── ESRGAN_x4.pth
│           └── 4x-UltraSharp.pth
│           └── models.sh           # ⚙️ 下载脚本
├── checkpoints/                     # SDXL/FLUX 底模
│   ├── flux1-dev-fp8.safetensors
│   └── sdxl-.*/
└── loras/                           # LoRA 模型

/comfyui/
└── custom_nodes/                    # 安装的节点
    ├── comfyui-ipadapter-flux/
    ├── sd-webui-controlnet/
    ├── ComfyUI-ADetailer/
    ├── ComfyUI-KJNodes/
    ├── ComfyUI-Image-Mosaic/
    ├── ComfyUI-Flex-Lora-Manager/
    ├── comfyui-Impact-Pack/        # 推荐
    ├── ComfyUI-Manager/            # 推荐
    ├── WAS-Node-Suite/             # 推荐
    └── ...
```

## 💡 最佳实践

### 1. 定期维护
```powershell
# 每月运行一次清理脚本
.\view-runpod-volume.ps1 -LargeOnly
.\cleanup-and-install-nodes.ps1 -CleanOnly
```

### 2. 备份重要配置
```bash
# 导出当前工作流
curl http://localhost:8188/history/<job_id> > workflow_backup.json

# 备份用户配置
cp ~/.config/comfyui/settings.toml ~/backup/
```

### 3. 监控磁盘空间
```bash
# 检查使用情况
du -sh /runpod-volume/*

# 监控大文件
find /runpod-volume -type f -size +500M -exec ls -lh {} \;
```

### 4. 更新节点
```bash
# 使用 ComfyUI Manager 可以方便地更新
# 或者手动 pull
cd /comfyui/custom_nodes/node-name
git pull
```

## 🔗 相关资源

- [ComfyUI 官方文档](https://docs.comfy.org/)
- [ComfyUI Registry](https://comfyui.org/)
- [RunPod 文档](https://www.runpod.io/docs/)
- [Impact Pack 文档](https://github.com/ltdrdata/ComfyUI-Impact-Pack)
- [SoulMate9 Documentation](../../README.md)

## 📝 变更记录

### v1.0 (2024-08-24)
- ✨ 新增自动化安装脚本
- ✨ 新增卷结构分析工具
- ✨ 创建模型下载脚本模板
- 🐛 修复 Git clone 兼容性问题
- 🐛 添加环境变量适配

---

**作者**: SoulMate AI Team  
**最后更新**: 2024-08-24
