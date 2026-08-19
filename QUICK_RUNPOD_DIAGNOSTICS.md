# 🔍 RunPod 生图故障诊断清单

## 🚨 立即检查项

### Step 1: Vercel 环境变量验证

访问: https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

**必须配置的变量**:
```bash
RUNPOD_API_KEY=<您的 API Key，格式：rpc_xxxxxxxxxxxxxx>
RUNPOD_ENDPOINT_ID=https://<your-endpoint-id>.runpod.cloud
RUNPOD_UNIFIED_COMFY_ENDPOINT=https://wozrrlcdipyl3p.<domain>
```

**如何查找旧值**:
1. Vercel Dashboard → Settings → Git → View commit history
2. 搜索之前的提交中是否有这些变量的设置
3. 或者检查 `.env.prod.local` (如果有)

---

### Step 2: 检查当前运行状态

#### A. 测试 ComfyUI 端点健康度

如果您还记得 RunPod Pod 的 URL，直接测试:

```bash
curl <YOUR_RUNPOD_URL>/health

# 预期响应:
{
  "status": "healthy",
  "gpu_count": 1,
  "system_stats": {...}
}
```

#### B. 测试 API 调用

在浏览器打开 Network 标签:
1. 访问创作工作台
2. 点击"生成图片"
3. 查看失败的请求详情
4. 复制完整错误信息

**常见错误类型**:

| 错误 | 原因 | 解决方案 |
|------|------|----------|
| `502 Bad Gateway` | 端点不可用 | 重启 RunPod |
| `401 Unauthorized` | API Key 无效 | 重新生成 API Key |
| `ENOTFOUND` | DNS 解析失败 | 检查 URL 格式 |
| `Timeout` | GPU 繁忙 | 等待或升级 GPU |
| `Endpoint ID is empty` | 环境变量未设置 | 添加到 Vercel |

---

### Step 3: 快速恢复方案

#### 方案 A: 重新配置 Vercel 环境变量 (推荐)

**如果您记得之前的值**:

1. Vercel Dashboard → Project Settings
2. Environment Variables → Add New
3. 输入:
   ```
   Name: RUNPOD_API_KEY
   Value: rpc_your_api_key_here
   
   Name: RUNPOD_ENDPOINT_ID  
   Value: https://your-pod-url.here
   ```
4. Save & Redeploy

**如果您不记得值**:

1. 登录 RunPod Console
2. 找到您的 Pod/Deployment
3. 复制 Public URL
4. 复制 API Key (Account → API Keys)
5. 粘贴到 Vercel

#### 方案 B: 检查本地开发环境

如果您在本地运行 `pnpm dev`:

```bash
# 编辑.env.prod.local 或 .env.local
RUNPOD_API_KEY=<your-key>
RUNPOD_ENDPOINT_ID=https://your-url.here
RUNPOD_DC2_CHAT_URL=https://dc2-url.here
```

然后:
```bash
pnpm dev
```

---

### Step 4: 代码层面的临时修复

如果 RunPod 完全不可用，可以使用 fal.ai 作为 fallback:

**当前代码已支持自动降级**,但需要:

```bash
# Vercel environment variables
FAL_KEY=<your-fal-key>
FAL_QUEUE_URL=<optional>
```

如果没有配置 fal.ai，可以考虑临时使用 together.ai:

```bash
TOGETHER_API_KEY=<your-together-key>
```

---

## 📊 日志分析指南

### 查看 Vercel 部署日志

```bash
# Terminal
vercel logs --follow

# 关注错误关键词:
- "Endpoint ID is empty"
- "Failed to fetch from endpoint"
- "GPU capacity error"
- "Time out after"
```

### 查看 RunPod Pod 日志

在 RunPod Console:
1. Your Pods → [Your Pod] → Logs
2. 过滤关键词:
   - `"error"`
   - `"failed"`
   - `"timeout"`
   - `"OOM"` (Out of Memory)

---

## 🔧 常见问题修复

### Q1: "No such file or directory: /runpod"

**原因**: ComfyUI 未正确安装

**修复**:
```bash
ssh root@<your-pod-ip>
cd /runpod
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt
python main.py --listen --port 8188
```

### Q2: "CUDA out of memory"

**原因**: FLUX 模型太大

**修复**:
1. 使用 fp8 版本: `flux1-dev-fp8.safetensors` (7.8GB vs 12GB)
2. 减少 batch_size 为 1
3. 升级 GPU 到至少 24GB VRAM

### Q3: "Connection timeout"

**原因**: 防火墙或网络问题

**修复**:
```bash
# 确保端口开放
ufw allow 8080/tcp

# 或使用 HTTPS proxy
export HTTP_PROXY=http://proxy:8080
export HTTPS_PROXY=http://proxy:8080
```

### Q4: "404 Not Found"

**原因**: Endpoint path 不对

**修复**:
- Serverless Pod URL 格式: `https://<id>-wozrrlcdipyl3p.gc.runpod.cloud`
- Deployment URL 格式: `https://deployments.<id>.deploy.runpod.io`

---

## 🚀 终极修复步骤

### If All Else Fails - Rebuild Everything

```bash
# Step 1: Stop old pod in RunPod
# Dashboard → Stop Deployment

# Step 2: Create fresh pod
# New Deployment → Choose template: ComfyUI-FLUX

# Step 3: Wait for provisioning (~5 min)

# Step 4: Get new public URL
# Dashboard → Deployment → Copy Public URL

# Step 5: Update Vercel environment variable
# RUNPOD_ENDPOINT_ID=https://new-url.here

# Step 6: Redeploy Vercel
# Automatic on next push
```

---

## ✅ 验证清单

After applying fixes, verify with:

- [ ] Vercel environment variable shows value
- [ ] No "Endpoint ID is empty" errors in console
- [ ] Network tab shows successful POST request (200 OK)
- [ ] Generated image appears in studio view
- [ ] Progress bar shows completion percentage

---

*Created: August 17, 2026*  
*Purpose: Quick troubleshooting guide for production runpod issues*
