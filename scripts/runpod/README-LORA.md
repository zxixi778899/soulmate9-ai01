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

## SHA256 回填工具链

`data/lora-catalog.json` 的 `sha256` 字段是 `checkLoraAuthenticity` 真实性校验的必要条件。哈希必须来自真实 worker 卷上的文件，禁止手工填写或伪造。

第一步：在挂载真实网络卷的 RunPod Pod 上计算哈希：

```bash
chmod +x scripts/runpod/hash-loras.sh
scripts/runpod/hash-loras.sh
# 生成 /runpod-volume/models/loras/soulmate-lora-hashes.txt
# 格式：filename|sha256|size_bytes
```

第二步：把清单下载回本地后回填目录：

```bash
node scripts/backfill-lora-sha256.mjs <清单路径> --dry-run   # 先预览
node scripts/backfill-lora-sha256.mjs <清单路径>             # 应用
```

规则：

- 只回填清单里出现的哈希；清单缺失或格式非法直接报错退出
- 目录已有相同哈希 → 视为已验证；冲突 → 默认保留目录值并报告，`--force` 才覆盖
- 回填后自动递增目录 `version` 并更新 `updated` 日期
- 卷上存在但目录未登记的文件会列入报告，提示补充目录条目