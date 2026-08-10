# RunPod SDXL ComfyUI 端点创建指南

## 背景
当前 SDXL 端点 jc24k1tq8q3 已被删除。需要创建新的端点来支持 NSFW 3-5 的 Pony/Illustrious 模型路由。

## 项目路由需求
- **女性 + NSFW 3-5 + 写实** → Pony Realism V2.2
- **男性 + NSFW 3-5 + 写实** → Pony Realism V2.2 + 男性 LoRA
- **跨性别 + NSFW 3-5 + 写实** → Pony Realism V2.2 + gender_transition LoRA
- **2D/Anime NSFW 3-5** → WAI Mature Illustrious V2
- **跨性别 + 2D/Anime** → Illustrious + gender_transition_slider

## 创建步骤

### 1. 登录 RunPod Console
- 访问 https://console.runpod.io/serverless
- 点击 "New Endpoint"

### 2. 配置新端点
- **Template**: 选择 ComfyUI 官方镜像 (CUDA 12.8 或 13)
- **Endpoint Name**: soulmate-sdxl-pony-illustrious
- **GPU Type**: 建议 RTX 4090 (24GB) 或 H100 (80GB)
- **Initial Workers**: 1
- **Max Workers**: 3
- **Idle Timeout**: 30s

### 3. 挂载网络卷
- 选择 Network Volume: soulmate-models-ca2
- Mount Path: /runpod-volume

### 4. 环境变量
- 无需额外设置，模型和 LoRA 从网络卷读取

### 5. 部署
- 点击 "Create Endpoint"
- 等待 Worker 启动（约 2-3 分钟）
- 复制 Endpoint ID

## 创建完成后告诉我 Endpoint ID，我会自动更新所有配置
