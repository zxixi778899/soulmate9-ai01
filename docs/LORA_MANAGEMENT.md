# LoRA 与模型管理

## 当前规则

- `data/lora-catalog.json`：描述真实文件名、Civitai version ID、模型家族、用途和安全强度，不声明文件已经安装。
- `scripts/runpod/cd1-essential-loras.txt`、`cd2-essential-loras.txt`：唯一下载清单。
- `RUNPOD_INSTALLED_LORAS_*`：唯一运行时安装事实源，内容必须来自挂载卷扫描。
- 未取得运行卷清单时，系统严格禁用 LoRA，不再根据旧登记表或文件名猜测。
- 身份头像与三视图使用基础 checkpoint 零 LoRA，避免年龄漂移、偏色、塑料感和脸型变化。
- 立绘与相册使用人物参考图/IP-Adapter 保持身份；LoRA 只补充明确的场景风格、动作或服装。

## 同步流程

1. 在挂载生产网络卷的 RunPod Pod 中运行 `scripts/runpod/download-loras.sh`。
2. 复制生成的 `soulmate-lora-inventory.env` 三项到 Vercel Production 环境变量。
3. 重新部署。
4. 在 `/admin/comfy` 的运行卷页确认“运行卷已验证”数量与实际文件一致。

不要把 Civitai token 写入仓库、目录 JSON、下载 URL 或日志；只通过 `CIVITAI_TOKEN` 环境变量传入下载脚本。