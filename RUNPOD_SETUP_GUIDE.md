# RunPod 重新配置指南

## 🚨 当前问题

您的 RunPod 端点 `wozrrlcdipyl3p` 已无法访问（返回 404）。这可能是由于：
- 端点被删除
- 端点所在区域不可用
- API Key 已过期或权限变更

## ✅ 解决步骤

### 第一步：在 RunPod Console 检查

1. 访问 https://www.runpod.io/console
2. 登录您的账户
3. 进入 Settings → API Keys
4. 确认当前的 API Key 是否有效

### 第二步：创建/选择可用端点

#### 选项 1：使用现有端点
- Serverless → Endpoints
- 查找状态为 "ACTIVE" 的 ComfyUI 端点
- 复制其 Endpoint ID

#### 选项 2：创建新端点
1. Deployments → Create Deployment
2. 选择 Template:
   - Search for "ComfyUI"
   - 推荐：`comfyui_flux_fp8` 系列
3. 选择 GPU:
   - Budget: T4 ($0.25/hour)
   - Performance: A10G ($0.69/hour) or A100 ($1.19/hour)
4. 配置：
   - Enable Auto-Sleep: Yes
   - Container Disk: 50GB minimum
5. 部署并等待 Pod 变为 "RUNNING" 状态

### 第三步：更新环境变量

编辑 `.env.local` 文件：

```bash
# 更新这两个关键配置
RUNPOD_API_KEY=YOUR_NEW_API_KEY_HERE
RUNPOD_ENDPOINT_ID=new_endpoint_id_here

# 例如：
RUNPOD_API_KEY=rpa_xxxxxxxxxxxxxxxx
RUNPOD_ENDPOINT_ID=b6r5nhhrddf8dx
```

### 第四步：验证连接

运行测试脚本：

```powershell
node verify-runpod-config.js
```

替换脚本中的 API_KEY 和 ENDPOINT_ID 为你的实际值。

## 📝 需要的信息

请提供以下信息以便我帮您进一步排查：

1. API Key 是否还能在 Console 中找到？
2. 现有端点列表中有可用的吗？
3. 如果可以创建新端点，您倾向于哪种 GPU 类型？

## ⚠️ 注意事项

- 确保端点安装了 FLUX 相关模型
- Checkpoint 路径应该包含：`flux1-dev-fp8.safetensors`
- SDXL 分流端点是可选的（用于动漫风格）
