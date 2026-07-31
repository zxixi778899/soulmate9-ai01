# RunPod LoRA 同步

唯一元数据源是 `data/lora-catalog.json`，下载源是 `cd1-essential-loras.txt` 与 `cd2-essential-loras.txt`。静态目录不代表已经安装。

在挂载真实网络卷的 RunPod Pod 中执行：

```bash
export CIVITAI_TOKEN=你的令牌
chmod +x scripts/runpod/download-loras.sh
scripts/runpod/download-loras.sh
```

脚本会校验已知 SHA256，并从真实 `models/loras/*.safetensors` 生成：

```text
/runpod-volume/models/loras/soulmate-lora-inventory.env
```

将其中三行原样同步到 Vercel Production 环境：

- `RUNPOD_INSTALLED_LORAS_FLUX`
- `RUNPOD_INSTALLED_LORAS_PONY`
- `RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS`

重新部署后，后台只显示这些清单中真实存在的 LoRA；清单为空时生成请求不会加载任何 LoRA。头像和三视图始终禁用 LoRA，立绘/相册由 IP-Adapter 保持人物一致性，LoRA 只用于明确的风格、动作或服装需求。