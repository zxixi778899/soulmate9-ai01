# ✅ RunPod 生图修复 - 完整操作指南

## 📊 当前状况分析

根据您的反馈："之前都生成正常。也有 ComfyUI + FLUX 模型。"

**推论**:
1. ✅ RunPod Pod 正在运行且有 ComfyUI+FLUX
2. ⚠️ 但变量可能被删除/覆盖
3. ⚠️ 或者 Endpoint URL 改变了

---

## 🔧 方案 A: 快速定位并修复 (推荐顺序执行)

### Step 1: 检查 Vercel Dashboard

1. **访问**: https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

2. **查找以下变量**:
   ```
   ✓ RUNPOD_API_KEY
   ✓ RUNPOD_ENDPOINT_ID  
   ✓ RUNPOD_DC2_CHAT_URL
   ✓ RUNPOD_PRO_CHAT_URL
   ```

3. **如果缺失，重新添加**:
   
   **获取值的方法**:
   - `RUNPOD_API_KEY`: 运行 Pod → Account → API Keys
   - `RUNPOD_ENDPOINT_ID`: 运行 Pod → Public URL
   
4. **保存后等待自动部署完成** (~3-5 分钟)

---

### Step 2: 验证修复结果

#### 方法 1: 浏览器测试

1. 访问创作工作台页面
2. 点击 "Generate Image"
3. 查看 Network 面板
4. 成功标志：HTTP 200 + 返回 image URL

#### 方法 2: CLI 测试

```bash
cd c:\Users\71489\soulmate9
pnpm dev

# Open another terminal and run:
curl http://localhost:3000/api/girlfriends/generate-portrait \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name": "Test"}'
```

---

## 🔍 方案 B: 检查 RunPod Pod 状态

### Step 1: 登录 RunPod Console

URL: https://www.runpod.io/console/pods

### Step 2: 找到您的 Pod

**筛选条件**:
- Name: 包含 "comfyui" 或 "flux"
- Status: Green (Running)
- Uptime: Should be recent

### Step 3: 获取端点信息

#### 对于 Serverless Pod:
1. Click on your Pod
2. Look for "Serverless Configuration"
3. Copy the Public URL format:
   ```
   https://<ID>-wozrrlcdipyl3p.gc.runpod.cloud
   ```

#### 对于 Deployment:
1. Click on your Deployment  
2. Look for "Public URL"
3. Copy the URL:
   ```
   https://deployments.<ID>.deploy.runpod.io
   ```

### Step 4: 更新 Vercel Environment Variables

回到 Vercel Dashboard，将刚才获取的 URL 填入 `RUNPOD_ENDPOINT_ID`

---

## ⚡ 方案 C: 终极重启方案

如果上述步骤都不奏效，尝试完全重建:

### Phase 1: Stop Old Pod

1. RunPod Console → Your Pods
2. Select → Stop / Terminate

### Phase 2: Create New Pod

1. **New Deployment**
2. Choose template: **ComfyUI + Flux**
3. GPU recommendation: L40S, A100, or H100
4. Wait for provisioning (~5 minutes)

### Phase 3: Get New Endpoint

1. Copy public URL from deployment details
2. Update API key if needed

### Phase 4: Update Vercel & Test

Same as Step 4 in Plan A

---

## 📝 方案 D: 检查代码变更

可能最近有代码更新导致不兼容:

### Check Git History

```bash
git log --oneline -20 | Select-String "runpod|endpoint|image"
```

### Review Recent Changes

Look for changes in:
- `.env.*` files
- `src/lib/runpod.ts`
- `src/lib/image-generation-routing.ts`

If you find any suspicious commits:

```bash
git revert <commit-hash>
git push origin main
```

---

## 🎯 快速诊断命令

### Test Endpoint Directly

```bash
# Replace with your actual endpoint
curl https://your-pod-url.here/health

# Expected response:
{
  "status": "healthy",
  "gpu_count": 1,
  "system_stats": {
    "total_memory": 26843545600,
    ...
  }
}
```

### Test API Key Validity

```bash
curl https://api.runpod.ai/graphql \
  -H "Authorization: Bearer rpc_your_key" \
  -d '{"query": "{viewer{id}}"}'
  
# Success: {"data":{"viewer":{"id":"..."}}}
# Failure: {"errors":[{"message":"Unauthenticated"}]}
```

---

## 📊 监控建议

After fixing, monitor these metrics:

### Vercel Logs

```bash
vercel logs --follow

# Watch for:
✅ "generate-image completed successfully"
❌ "Failed to fetch from endpoint"
⚠️  "GPU capacity error"
```

### RunPod Metrics

Dashboard → Your Pod → Stats:
- GPU Utilization: 50-80% during generation
- Memory Usage: Stable under 24GB
- Network: Active during requests

---

## ❓ FAQ - 常见问题解答

### Q: 如何确认是环境问题还是代码问题？

A: Run this test:
```bash
# If returns empty variable errors → Environment issue
node scripts/check-runpod-endpoint.js
```

### Q: 如果找不到旧的 Endpoint URL?

A: Two options:
1. RunPod Console → Deployment → Copy new Public URL
2. Or create a fresh Serverless Pod (recommended)

### Q: 可以临时用 fal.ai 替代吗？

A: Yes! Code already supports fallback. Just configure:
```bash
FAL_KEY=fal_your_fal_key
```

### Q: 成本会大幅增加吗？

A: Minimal difference:
- L40S @ $0.28/hr × 3min = ~$0.014/image
- fal.ai similar pricing
- No significant cost increase expected

---

## ✅ 成功标准验证

Your fix is complete when:

- [ ] All env vars present in Vercel Dashboard
- [ ] `GET /health` returns JSON with status 200
- [ ] Browser shows successful image generation
- [ ] No CORS or timeout errors in console
- [ ] Progress bar updates correctly

---

*Created: August 17, 2026*  
*Status: Ready for Implementation*  
*Next: Execute Fix Plan A → Verify → Monitor*
