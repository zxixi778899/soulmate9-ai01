# LoRA & 模型管理方案

## 当前状态

### 已安装 LoRA（7 个，volume `soulmate-models-ca2`）

| 文件 | 类别 | 推荐强度 | 用途 |
|------|------|----------|------|
| `flux_style_photoreal_v1.safetensors` | style | 0.55 | 默认风格（写实摄影） |
| `flux_style_hyperreal_aidma_v1.safetensors` | style | 0.50 | 超写实风格 |
| `flux_body_curvy_v1.safetensors` | body | 0.50 | 丰满体型 |
| `flux_body_pear_v1.safetensors` | body | 0.50 | 梨形身材 |
| `flux_detail_skin_v1.safetensors` | detail | 0.40 | 皮肤质感 |
| `flux_detail_skin_nplastic_v1.safetensors` | detail | 0.35 | 自然皮肤（去塑料感） |
| `flux_detail_hands_v1.safetensors` | detail | 0.35 | 手部细节 |

### 双 LoRA 叠加架构

每次生成使用最多 **2 个 LoRA**：

```
Checkpoint (flux1-dev-fp8) 
  → LoRA 1: 风格 (photoreal / hyperreal) — 始终加载
    → LoRA 2: 体型/细节 (curvy / pear / skin) — 按需加载
      → CLIP Encode + KSampler → 输出图片
```

**选择逻辑**（`buildLoraPlan()`）：

| 角色特征关键词 | Primary LoRA | Secondary LoRA |
|---|---|---|
| 默认 | photoreal (0.55) | — |
| hyperreal / aidma | hyperreal (0.50) | — |
| curvy / busty / hourglass | photoreal (0.55) | body-curvy (0.50) |
| pear / wide hips | photoreal (0.55) | body-pear (0.50) |
| skin / pores / texture | photoreal (0.55) | detail-skin (0.40) |

---

## 安装新 LoRA

### 方法 1：Admin 面板一键导入

1. 进入 `/admin/model-library` → **Civitai 搜索**
2. 搜索 FLUX 兼容 LoRA，点击「添加到库」
3. 在「我的库」中标状态为 `downloaded`
4. 在 `RUNPOD_INSTALLED_LORAS` 环境变量中添加文件名

### 方法 2：RunPod Volume 手动下载

```bash
# 1. 在 Admin → Model Library → Export 导出 URL 列表
# 2. SSH 到 RunPod pod（挂载 soulmate-models-ca2 volume）
cd /network-volume/models/loras/

# 3. 逐行下载
while IFS='|' read -r filename url; do
  wget -O "$filename" "$url"
done < lora-urls.txt

# 4. 验证
ls -la *.safetensors
```

### 方法 3：环境变量快速注册

在 Vercel 环境变量添加（逗号分隔）：

```
RUNPOD_INSTALLED_LORAS=flux_outfit_lingerie_v1,flux_outfit_bunny_v1,flux_body_athletic_v1
```

不需要 `.safetensors` 后缀，系统自动补全。

---

## 添加新 LoRA 到 Registry

当你在 volume 上安装了新 LoRA，需要在 `src/lib/runpod-loras.ts` 的 `LORA_REGISTRY` 中添加条目：

```typescript
{
  file: 'flux_outfit_lingerie_v1.safetensors',
  category: 'style',  // 'style' | 'body' | 'detail'
  strength: 0.60,
  label: 'Lingerie outfit',
  trigger_words: [],
}
```

然后重新部署即可。

---

## 环境变量速查

| 变量 | 用途 | 默认值 |
|------|------|--------|
| `GIRLFRIEND_STYLE_LORA` | 覆盖默认风格 LoRA | `flux_style_photoreal_v1` |
| `RUNPOD_DEFAULT_LORA` | 同上（兼容旧名） | — |
| `RUNPOD_INSTALLED_LORAS` | 额外已安装 LoRA（逗号分隔） | — |
| `COMFY_INSTALLED_LORAS` | 同上（兼容旧名） | — |
| `RUNPOD_ENDPOINT_ID` | ComfyUI serverless endpoint | — |
| `RUNPOD_API_KEY` | RunPod API 密钥 | — |

---

## 代码文件清单

| 文件 | 职责 |
|------|------|
| `src/lib/runpod-loras.ts` | LoRA 注册表 + 安装检测 + LoraPlan 类型 |
| `src/lib/prompt/girlfriend.ts` | `buildLoraPlan()` 双 LoRA 选择逻辑 |
| `src/lib/runpod.ts` | `buildFluxWorkflow()` ComfyUI 节点图构建 |
| `src/lib/comfy-console/defaults.ts` | 工作流预设（checkpoint + LoRA 配置） |
| `data/lora-catalog.json` | LoRA 目录（wishlist + 已安装） |
