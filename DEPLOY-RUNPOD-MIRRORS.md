# RunPod Docker 镜像构建与部署指南（2026-08-27）

## 📋 前置条件

### 1. 本地环境检查

#### Windows 环境
```powershell
# 确保 Docker Desktop 已安装并正在运行
docker --version
docker ps

# 如果 Docker Desktop 未启动：
# - 打开 Docker Desktop 应用
# - 等待右下角托盘图标显示 "Running"
# - 确认可以访问 Linux 容器
```

#### macOS/Linux 环境
```bash
docker --version
docker ps
```

### 2. RunPod 账号准备

1. **登录 RunPod Console**：https://www.runpod.io/console
2. **获取 API Key**：
   - 点击右上角头像 → Settings → API Keys
   - 复制您的 API Key（类似 `RUNPOD_API_KEY=abc123...`）
3. **获取账号 ID**（如果需要手动推送镜像）：
   - Settings → Account Info
   - 记录 `Account ID`

---

## 🏗️ 方法一：本地构建并推送（推荐）

### Step 1: 登录到 AWS ECR 或直接推送 RunPod

RunPod 使用自己的容器注册表，需要先认证：

```bash
# 获取 RunPod 的容器镜像仓库地址
echo $RUNPOD_REGISTRY_URL  # 通常在环境变量中

# 如果没有设置，RunPod 默认使用：
# https://pod-runpod.eu-1.container-registry.runpod.io
# 或根据区域有所不同

# 运行以下命令获取最新的 Registry URL
podctl auth login
# 或使用官方 CLI 工具安装后执行：pip install podctrl
podio auth
```

### Step 2: 重新构建两个镜像

```powershell
# SDXL-Pro 端点（带 Impact Pack）
cd c:\Users\71489\soulmate9
docker build \
  --platform linux/amd64 \
  --progress plain \
  -t runpod-registry/sdxl-pro:fix-20260827 \
  -f runpod/comfyui-worker/Dockerfile.sdxl-pro \
  .

# FLUX Premium 端点（新增 Impact Pack）
docker build \
  --platform linux/amd64 \
  --progress plain \
  -t runpod-registry/flux-premium:fix-20260827 \
  -f runpod/comfyui-worker/Dockerfile.flux-premium \
  .
```

**预期输出**：
```
[+] Building x.xs (xx/xx)
 => [internal] load build definition from Dockerfile.sdxl-pro
 => [internal] load metadata for runpod/worker-comfyui:5.8.6-base
 => [internal] load .dockerignore
 => [1/7] FROM runpod/worker-comfyui:5.8.6-base@sha256:...
 => [2/7] RUN git clone --depth 1 ...
 => [3/7] RUN mkdir -p /comfyui/user/default/ComfyUI-Impact-Subpack
 => => COPY model-whitelist.txt to whitelist
 => Successfully built <image-hash>
 => Successfully tagged runpod-registry/sdxl-pro:fix-20260827
```

**预计耗时**：15-30 分钟（取决于网络速度）

### Step 3: 标记并推送镜像

```powershell
# 获取你的 RunPod 账号信息
$RUNPOD_ACCOUNT_ID = "your-account-id-from-console"
$RUNPOD_REGION = "eu-1" # 或其他区域

# 构建完整镜像标签
$sdxl_tag = "pod-run${RUNPOD_ACCOUNT_ID}.dkr.${RUNPOD_REGION}.container-registry.runpod.io/sdxl-pro:fix-20260827"
$flux_tag = "pod-run${RUNPOD_ACCOUNT_ID}.dkr.${RUNPOD_REGION}.container-registry.runpod.io/flux-premium:fix-20260827"

# 标记镜像
docker tag sdxl-pro:latest $sdxl_tag
docker tag flux-premium:latest $flux_tag

# 登录 RunPod 镜像仓库
docker login pod-run${RUNPOD_ACCOUNT_ID}.dkr.${RUNPOD_REGION}.container-registry.runpod.io

# 推送镜像
docker push $sdxl_tag
docker push $flux_tag

# 输出验证
Write-Host "✅ SDXL-Pro 镜像已推送：$sdxl_tag"
Write-Host "✅ FLUX Premium 镜像已推送：$flux_tag"
```

---

## 🚀 方法二：直接在 RunPod Cloud Build（无需本地 Docker）

如果你不想在本地构建，可以使用 RunPod 的云端构建功能：

### Option A: 通过 GitHub Actions CI/CD

1. **配置 GitHub Repository**（推荐）：
```yaml
# .github/workflows/deploy-runpod.yml
name: Deploy to RunPod

on:
  push:
    branches: [main]
    paths:
      - 'runpod/**'

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Configure Git
      run: |
        git config --global user.email "ci@somemate.ai"
        git config --global user.name "CI Bot"
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Login to RunPod Container Registry
      run: echo "${{ secrets.RUNPOD_DOCKER_PASSWORD }}" | 
            docker login pod-run${{ secrets.RUNPOD_ACCOUNT_ID }}.dkr.${{ secrets.RUNPOD_REGION }}.container-registry.runpod.io \
            -u ${{ secrets.RUNPOD_ACCOUNT_ID }} --password-stdin
    
    - name: Build and push SDXL-Pro
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./runpod/comfyui-worker/Dockerfile.sdxl-pro
        platforms: linux/amd64
        push: true
        tags: |
          pod-run${{ secrets.RUNPOD_ACCOUNT_ID }}.dkr.${{ secrets.RUNPOD_REGION }}.container-registry.runpod.io/sdxl-pro:${{ github.sha }}
          pod-run${{ secrets.RUNPOD_ACCOUNT_ID }}.dkr.${{ secrets.RUNPOD_REGION }}.container-registry.runpod.io/sdxl-pro:latest
    
    - name: Build and push FLUX Premium
      uses: docker/build-push-action@v5
      with:
        context: .
        file: ./runpod/comfyui-worker/Dockerfile.flux-premium
        platforms: linux/amd64
        push: true
        tags: |
          pod-run${{ secrets.RUNPOD_ACCOUNT_ID }}.dkr.${{ secrets.RUNPOD_REGION }}.container-registry.runpod.io/flux-premium:${{ github.sha }}
          pod-run${{ secrets.RUNPOD_ACCOUNT_ID }}.dkr.${{ secrets.RUNPOD_REGION }}.container-registry.runpod.io/flux-premium:latest
```

2. **在 GitHub Secrets 中配置**：
   - `RUNPOD_ACCOUNT_ID`: 你的 RunPod 账号 ID
   - `RUNPOD_REGION`: 例如 `eu-1` 或 `us-east-1`
   - `RUNPOD_DOCKER_PASSWORD`: RunPod Docker 认证密码（从 RunPod Settings → Access Tokens 获取）

3. **触发构建**：
```bash
# 提交代码会触发自动构建和推送
git add runpod/comfyui-worker/Dockerfile.* .github/workflows/deploy-runpod.yml
git commit -m "chore: add auto deploy workflow"
git push origin main
```

### Option B: 手动上传文件到 RunPod 并使用 Cloud Build

```bash
# 将两个 Dockerfile 压缩为 tar.gz
cd c:\Users\71489\soulmate9\runpod\comfyui-worker

# 上传到 RunPod 的临时存储或使用 rsync 同步
# 然后通过 RunPod UI 创建云构建任务
```

---

## 🔧 方法三：通过 Podctl CLI（简化版）

```bash
# 安装 Podctl
pip install podctrl

# 登录
podio auth

# 构建镜像（指定远程构建）
podio build \
  --file runpod/comfyui-worker/Dockerfile.sdxl-pro \
  --platform linux/amd64 \
  --tag sdxl-pro:fix-20260827 \
  --context .

# 推送
podio image push sdxl-pro:fix-20260827

# 同理处理 FLUX Premium
podio build \
  --file runpod/comfyui-worker/Dockerfile.flux-premium \
  --platform linux/amd64 \
  --tag flux-premium:fix-20260827 \
  --context .

podio image push flux-premium:fix-20260827
```

---

## 🔄 更新 RunPod 端点配置

### Step 1: 确认镜像已成功推送

```bash
# 列出所有推送的镜像
podio image list

# 或者通过 API 查询
curl -X GET \
  "https://api.runpod.cloud/v2/images" \
  -H "Authorization: Bearer $RUNPOD_API_KEY"
```

### Step 2: 通过 RunPod UI 更新

1. **登录 RunPod Console**: https://www.runpod.io/console
2. **进入 "Serverless" 或 "Cloud Pod"**
3. **找到当前使用的端点**（如 `comfy_dual` 或 `sd-xl-pro`）
4. **编辑端点配置**：
   ```
   Endpoints → Select Endpoint → Edit
   
   Image Selector:
   ├── Search: sdxl-pro:fix-20260827
   └── Or: Browse Recent Images
   ```
5. **保存并验证**

### Step 3: 通过 API 批量更新（高级）

```typescript
// scripts/update-runpod-endpoints.js
const axios = require('axios');

async function updateEndpoint(endpointId, newImageTag) {
  const response = await axios.patch(
    `https://api.runpod.cloud/v2/endpoints/${endpointId}`,
    {
      machineGroup: {
        image: newImageTag
      }
    },
    {
      headers: {
        'Authorization': `Bearer ${process.env.RUNPOD_API_KEY}`
      }
    }
  );
  
  return response.data;
}

// 执行更新
(async () => {
  const endpoints = ['comfy_dual', 'sd-xl-pro']; // 替换为你的实际端点 ID
  const updates = [
    { endpoint: 'comfy_dual', image: 'pod-runxxx.sdxl-pro:fix-20260827' },
    { endpoint: 'sd-xl-pro', image: 'pod-runxxx.flux-premium:fix-20260827' }
  ];
  
  for (const update of updates) {
    console.log(`Updating ${update.endpoint}...`);
    await updateEndpoint(update.endpoint, update.image);
    console.log(`✅ ${update.endpoint} updated to ${update.image}`);
  }
})();
```

---

## ✅ 验证步骤

### 1. 健康检查

```bash
# 检查端点状态
GET /api/admin/comfy/health

# 应该返回：
{
  "status": "ok",
  "endpoints": {
    "sdxl-pro": {
      "healthy": true,
      "nodes": ["UltralyticsDetectorProvider", "FaceDetailer", ...]
    },
    "flux-premium": {
      "healthy": true
    }
  }
}
```

### 2. 生图测试

访问前端页面进行端到端测试：

1. **捏脸生图测试**：
   ```
   /studio/create/:id/fine-tune
   → Enable "Face Detailing"
   → Generate preview
   → Should work without validation errors
   ```

2. **对话生图测试**：
   ```
   /chat/:id
   → Type any message
   → Image generation triggered
   → Check network tab for successful workflow submission
   ```

### 3. 日志验证

```bash
# 查看 ComfyUI Worker 日志
podio pod logs <pod-id>

# 搜索关键日志
podio pod logs <pod-id> | grep -i "ultralytics"
podio pod logs <pod-id> | grep -i "impact"
```

---

## 🚨 常见问题排查

### Error: `value_not_in_list` (原始错误)

**症状**：UltralyticsDetectorProvider 节点拒绝模型名

**解决**：
```bash
# 检查镜像中的 whitelist 文件
docker exec -it <running-pod-id> cat \
  /comfyui/user/default/ComfyUI-Impact-Subpack/model-whitelist.txt

# 应输出：
# bbox/face_yolov8m.pt
```

### Error: `Node not found: UltralyticsDetectorProvider`

**原因**：Impact Subpack 未安装

**解决**：确保使用了修复后的 Dockerfile

### 镜像拉取失败

**解决方案**：
```bash
# 检查镜像是否成功推送
podio image list

# 强制刷新镜像缓存
podio pod pull <pod-id> --force-refresh
```

---

## 📝 快速命令参考

```powershell
# 1. 确保 Docker 运行
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"

# 2. 构建 SDXL-Pro
docker build --platform linux/amd64 -f runpod/comfyui-worker/Dockerfile.sdxl-pro -t sdxl-pro:fix-20260827 .

# 3. 构建 FLUX Premium  
docker build --platform linux/amd64 -f runpod/comfyui-worker/Dockerfile.flux-premium -t flux-premium:fix-20260827 .

# 4. 标记镜像（替换为你的实际账号）
$account = "123456"
$region = "eu-1"
$tag_prefix = "pod-run${account}.dkr.${region}.container-registry.runpod.io"

docker tag sdxl-pro:fix-20260827 "${tag_prefix}/sdxl-pro:fix-20260827"
docker tag flux-premium:fix-20260827 "${tag_prefix}/flux-premium:fix-20260827"

# 5. 推送（按提示输入 RunPod API Key）
docker login "${tag_prefix}"
docker push "${tag_prefix}/sdxl-pro:fix-20260827"
docker push "${tag_prefix}/flux-premium:fix-20260827"

# 6. 更新端点（通过 RunPod UI 或 API）
# 参考上文步骤 3
```

---

## 🎯 推荐流程总结

**最快的方式**：
1. ✅ 确保 Docker Desktop 正在运行
2. ✅ 在本地构建两个镜像（约 20 分钟）
3. ✅ 使用 `podio` CLI 或 `docker push` 推送到 RunPod
4. ✅ 通过 RunPod Console UI 切换端点镜像版本
5. ✅ 通过前端页面验证生图功能

**自动化方式**（长期维护）：
- 使用 GitHub Actions CI/CD
- 每次推送到 `main` 分支自动构建和部署
- 减少人为失误

---

## 📞 需要帮助？

遇到问题时提供以下信息：
1. Docker 构建输出日志
2. RunPod 端点 ID 和错误截图
3. 工作流 JSON（可从 `/api/gen/start` 请求体复制）

---

**更新日期**: 2026-08-27  
**修复内容**: ADetailer 路径前缀问题 + Impact Pack 缺失修复
