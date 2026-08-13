# 图像增强节点安装

在 RunPod ComfyUI worker 上执行：

```bash
cd /workspace/ComfyUI
bash /workspace/soulmate9/scripts/runpod/install-image-enhancers.sh
```

脚本是幂等的，会安装/更新：

- `XLabs-AI/x-flux-comfyui` 与 `Fannovel16/comfyui_controlnet_aux`，并下载 `flux-depth-controlnet.safetensors`；
- `ltdrdata/ComfyUI-Impact-Pack`（ADetailer 兼容的人脸/局部细节修复节点）；
- 内置 `UpscaleModelLoader` 使用的 `4x-UltraSharp.pth`。

重启 ComfyUI 后，在 worker 环境中设置：

```bash
export RUNPOD_CONTROLNET_READY=true
export RUNPOD_CONTROLNET_MODEL=flux-depth-controlnet.safetensors
export RUNPOD_ADETAILER_READY=true
export RUNPOD_ADETAILER_MODEL=face_yolov8m.pt
export RUNPOD_UPSCALE_READY=true
export RUNPOD_UPSCALE_MODEL=4x-UltraSharp.pth
```

管理端 `GET /api/admin/comfy?view=enhancers` 会显示配置状态。未设置对应 `*_READY=true` 时，勾选增强项会被拒绝，避免生成链路静默降级。

卷清理不由安装脚本自动执行。请先导出 worker 的 `models/` 清单，确认要删除的精确路径后再单独执行删除，避免误删 checkpoint、LoRA 或身份参考资源。
