# 🔧 RunPod 生成端点配置修复指南

## 🚨 问题诊断

**错误现象**:
- 创作工作台中生图失败
- API 返回错误或无法完成请求

**根本原因**:
```bash
# 查看.env.prod.local 或 .env.vercel
RUNPOD_ENDPOINT_ID=""  # ❌ 空值 - 没有配置 RunPod 端点
```

RunPod 端点是图像生成的 GPU 工作节点，必须配置才能执行 FLUX 模型的生图任务。

---

## ✅ 解决方案

### Step 1: 确认 RunPod 环境准备

#### A. 创建/获取 RunPod GPU 实例

1. 访问 https://www.runpod.io/console
2. 创建新的 Serverless Pod 或 Deployment
3. 选择以下 GPU:
   - **推荐**: NVIDIA L40S, A100, or H100 (至少 24GB VRAM)
   - **最小**: NVIDIA T4 (可能较慢)

#### B. 安装 ComfyUI + FLUX

在 RunPod 中运行以下 setup 脚本:

```bash
# SSH into your RunPod instance
ssh root@<your-pod-ip>

# Install ComfyUI
cd /runpod
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI

# Install dependencies
pip install -r requirements.txt

# Download FLUX checkpoint
mkdir -p models/checkpoints
wget https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/flux1-dev-fp8.safetensors \
  -O models/checkpoints/flux1-dev-fp8.safetensors

# Start ComfyUI
python main.py --listen --port 8188
```

#### C. 测试端点健康检查

```bash
curl http://localhost:8188/system_stats
# Should return JSON with GPU info
```

---

### Step 2: 配置环境变量

#### Vercel 生产环境 (推荐)

1. 登录 https://vercel.com/dashboard
2. 选择你的项目 (`soulmate9-ai01`)
3. 进入 Settings → Environment Variables
4. 添加/更新以下变量:

```bash
# CRITICAL: RunPod Image Generation Endpoint
RUNPOD_ENDPOINT_ID=<your-runpod-endpoint-id>
RUNPOD_API_KEY=<your-runpod-api-key>

# Optional: DC2 endpoint for fallback
RUNPOD_ENDPOINT_ID_DC2=<fallback-endpoint-id-if-any>
```

**如何获取这些值**:

1. `RUNPOD_API_KEY`: 
   - RunPod Dashboard → Account → API Keys
   - Create new key if needed

2. `RUNPOD_ENDPOINT_ID`:
   - If using Serverless Pod: Copy the Serverless URL
     Example: `https://<id>-wozrrlcdipyl3p.gc.runpod.cloud`
   - If using Deployment: Copy the Public URL
     Example: `https://deployments.<id>.deploy.runpod.io`

3. Save in Vercel → Deployments will auto-rebuild

#### 本地开发环境

Edit `.env.prod.local`:

```bash
RUNPOD_ENDPOINT_ID=https://your-pod-url.here
RUNPOD_API_KEY=your-api-key-here
RUNPOD_DC2_CHAT_URL=https://your-dc2-chat-url.here
RUNPOD_PRO_CHAT_URL=https://your-pro-chat-url.here
```

Then restart:
```bash
pnpm dev
```

---

### Step 3: 验证端点可用性

#### Test A: Direct Health Check

```bash
curl <RUNPOD_ENDPOINT_ID>/health
# Expected response: {"status": "healthy", ...}
```

#### Test B: Generate Test Image via curl

```bash
curl -X POST <RUNPOD_ENDPOINT_ID>/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "portrait of beautiful girl",
    "negative_prompt": "blurry, low quality",
    "width": 1024,
    "height": 1536,
    "num_inference_steps": 28,
    "guidance_scale": 3.5
  }'
```

Expected: Returns image data or job ID

---

### Step 4: Update to New Unified Endpoint Format

根据最新代码（src/lib/runpod.ts），使用统一的 FLUX 端点：

```typescript
// src/lib/image-generation-routing.ts line 31
export const UNIFIED_COMFY_ENDPOINT = 'wozrrlcdipyl3p';
```

这意味着你应该使用这个格式作为 `RUNPOD_ENDPOINT_ID`:

```bash
# ✅ Correct format
RUNPOD_ENDPOINT_ID=https://wozrrlcdipyl3p.worzrc.ltd

# ❌ Wrong (too short/incomplete)
RUNPOD_ENDPOINT_ID=wozrrlcdipyl3p
```

---

## 🔍 故障排查

### Issue 1: Endpont returns 502 Bad Gateway

**Symptom**: CORS errors or connection refused

**Fix**:
```bash
# Check firewall/security group rules
# Ensure port 80/443 is open

# Verify ComfyUI is running
ps aux | grep python

# Restart ComfyUI
sudo systemctl restart comfyui
```

### Issue 2: Out of Memory Errors

**Symptom**: Pod crashes immediately

**Fix**:
```bash
# Reduce batch size
num_images=1  # Always use 1 for now

# Use fp8 checkpoint (already downloaded above)
flux1-dev-fp8.safetensors  # 7.8GB instead of 12GB
```

### Issue 3: Rate Limiting from RunPod

**Symptom**: 429 Too Many Requests

**Fix**:
```bash
# Add cooldown between requests
sleep 5  # Wait 5 seconds

# Upgrade to higher tier plan
# Serverless pricing: $0.28/hour for L40S
```

### Issue 4: Authentication Failed

**Symptom**: 401 Unauthorized

**Fix**:
```bash
# Check API key format
RUNPOD_API_KEY=rpc_XXXXXXXXXXXXXX  # Must start with 'rpc_'

# Regenerate if expired
# RunPod Console → Account → API Keys
```

---

## 📊 成功标准

After configuration, you should see:

✅ **Health Check Passes**:
```json
{
  "status": "healthy",
  "gpu_count": 1,
  "gpu_memory_total": 26843545600
}
```

✅ **Test Generation Works**:
```bash
curl -X POST http://localhost:3000/api/girlfriends/generate-portrait \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name": "Test"}'

# Response:
{
  "success": true,
  "imageUrl": "https://...",
  "count": 1
}
```

✅ **No More "Endpoint Empty" Errors**:
Check browser Network tab - no more 500 errors from `/api/girlfriends/generate-portrait`

---

## 🚀 Next Steps

Once the endpoint is configured:

1. **Monitor Logs**:
   ```bash
   vercel logs --follow
   ```

2. **Check GPU Utilization**:
   - RunPod Console → Your Pod → Stats
   - Should see ~80% utilization during generation

3. **Test Batch Generation**:
   ```bash
   # In Vercel Dashboard, run deployment
   npm run build
   
   # Visit studio page and test
   ```

4. **Enable Enhancers (Optional)**:
   ```bash
   # After confirming basic generation works
   RUNPOD_ADETAILER_READY=true
   RUNPOD_UPSCALE_READY=true
   ```

---

## 💡 常见问题 FAQ

**Q: 我需要使用哪个 GPU？**  
A: 最低要求 L40S 或 A100 (24GB+ VRAM)。T4 可以运行但很慢 (~30s/image)。

**Q: Serverless vs Deployment?**  
A: Serverless 更便宜（按需付费），Deployment 更稳定（持续运行）。

**Q: 如果端点失效怎么办？**  
A: 设置多个端点：主 `RUNPOD_ENDPOINT_ID` + 备份 `RUNPOD_ENDPOINT_ID_BACKUP`

**Q: 成本预估？**  
A: L40S @ $0.28/hr × 3min/job ≈ $0.014 per image

---

*Created: August 17, 2026*  
*Status: Ready for Implementation*  
*Next: Configure & Deploy*
