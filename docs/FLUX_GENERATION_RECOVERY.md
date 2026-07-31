# FLUX 图像质量恢复

## 根因

1. 后台把 FLUX 身份图实际 CFG 强制提高到 3.0，但生成追踪仍显示 1。单文件 FLUX.1-dev FP8 工作流要求 CFG 1.0，高 CFG 会放大色偏并破坏人物结构。
2. `scripts/setup-dc2-models.sh` 曾把 Kijai 约 11.9GB 的 diffusion single file 下载到 `models/checkpoints`，并按完整 checkpoint 使用。当前 `CheckpointLoaderSimple` 路线需要 Comfy-Org 约 17.2GB 的单文件 checkpoint。

## 修复后规则

- 最终工作流对 FLUX 强制 `CFG = 1.0`，不信任调用方旧参数。
- 生成追踪保存实际 CFG。
- RunPod 工作流会记录 checkpoint loader、checkpoint、尺寸、steps、CFG、采样器、参考图和 LoRA 数量，不记录提示词或密钥。
- 安装脚本检测 checkpoint 小于 16GB 时判定为不兼容并重新下载，完成后原子替换。

## 修复生产运行卷

在挂载同一生产网络卷的临时 RunPod Pod 中执行：

```bash
bash scripts/setup-dc2-models.sh
```

或者手动执行：

```bash
cd /runpod-volume/models/checkpoints
wget -O flux1-dev-fp8.safetensors.part \
  https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors
mv flux1-dev-fp8.safetensors.part flux1-dev-fp8.safetensors
stat -c '%n %s bytes' flux1-dev-fp8.safetensors
```

文件应大于 16,000,000,000 字节。完成后重启或刷新 ComfyUI Serverless worker，再生成一张无 LoRA、无参考图、CFG 1 的基准头像。