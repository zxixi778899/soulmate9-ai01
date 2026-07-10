# RunPod 网络卷 LoRA 一键准备

## 你的资源

| 资源 | 用途 |
|------|------|
| soulmate-models-ca2 (US-CA-2) | 网盘 |
| model-downloader | 下载到网盘 |
| ComfyUI / portrait:v9 | 挂网盘出图 |
| flux1-dev-fp8（已有） | 主模型，无需再下 |

清单单源：仓库 `data/lora-catalog.json`（身材 / NSFW 动作 / 服装 / 道具 / 细节）。

## 一键流程

```bash
# 在 model-downloader Pod 终端（已挂 soulmate-models-ca2）
cd /runpod-volume   # 或 /workspace，以实际挂载为准

# 拷贝脚本（任选一种）
# scp / 粘贴 scripts/runpod/download-loras.sh
# 或 curl 仓库 raw 地址

chmod +x download-loras.sh
./download-loras.sh
```

脚本会：

1. 创建 `models/checkpoints`、`models/loras`
2. 检查 fp8 是否存在
3. 生成 **推荐清单** `models/loras/SOULMATE_LORA_MANIFEST.txt`
4. 生成 **可编辑直链表** `models/loras/lora-urls.txt`

### 只准备部分分类

```bash
./download-loras.sh --only body,action
./download-loras.sh --only outfit,prop
```

### 批量下载（推荐）

1. 在 Civitai 选 **Base = FLUX.1 D** 的 LoRA  
2. 复制 Download API：`https://civitai.com/api/download/models/<versionId>`  
3. 编辑 `lora-urls.txt`：

```text
flux_body_curvy_v1.safetensors|https://civitai.com/api/download/models/版本ID
flux_pose_nsfw_dynamic_v1.safetensors|https://civitai.com/api/download/models/版本ID
flux_pose_cowgirl_v1.safetensors|https://civitai.com/api/download/models/版本ID
flux_outfit_lingerie_v1.safetensors|https://civitai.com/api/download/models/版本ID
```

4. 执行：

```bash
export CIVITAI_API_TOKEN=你的token   # 可选，NSFW 常需要
./download-loras.sh --from-file /runpod-volume/models/loras/lora-urls.txt
```

5. **停止 Pod**

### 最小 NSFW 动作包（省空间优先）

| 文件名 | 用途 |
|--------|------|
| `flux_body_curvy_v1.safetensors` | 身材 |
| `flux_pose_nsfw_dynamic_v1.safetensors` | 动态姿势 |
| `flux_pose_cowgirl_v1.safetensors` | 骑乘 |
| `flux_pose_from_behind_v1.safetensors` | 后视角 |
| `flux_outfit_lingerie_v1.safetensors` | 内衣 |
| `flux_detail_skin_v1.safetensors` | 皮肤 |

## 挂到 Comfy 端点

ComfyUI 5.8.6 / soulmate-portrait:v9：

- Network Volume = soulmate-models-ca2  
- Region = US-CA-2  

## 后台使用

打开 `/admin/comfy`：

| Tab | 功能 |
|-----|------|
| **生成** | 下拉选 LoRA + 强度 + 提示词 |
| **LoRA 清单** | 分类浏览、用途/触发词、一键填入、快捷配方 |
| **工作流** | 人物 / 服装 / 道具 / 换装 |
| **网络卷/端点** | 挂卷说明 + Endpoint ID |

### 调用逻辑

1. 选工作流（如人物）  
2. 在 LoRA 清单点「一键调用」→ 自动选中文件名、强度、追加触发词  
3. 点 **Queue Prompt 生成**  
4. Comfy 图里走 `LoraLoader`（`models/loras/<filename>`）

### 叠用建议

- NSFW 动作：优先姿势 LoRA 0.65–0.70  
- 换装：服装 LoRA 0.6 + denoise 0.5–0.6  
- 道具：prop LoRA + 负面词 `person, face, hands`  
- 当前单次生成挂 **1 个** LoRA（最重要那个）

## 注意

- 只用 **FLUX LoRA**，不要 SDXL  
- 10GB 卷：fp8 + 约 8～12 个小 LoRA 足够  
- 文件名必须与 catalog / 后台完全一致  
- 冷启动会略变长；热路径影响通常不大  
