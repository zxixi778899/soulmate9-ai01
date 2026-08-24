# RunPod 生图服务配置指南（Vercel）

## 🔴 当前问题状态

生图链路全部失败的根本原因：**Vercel 运行环境缺失 RunPod 三端点配置**

### 缺失的关键环境变量

| 变量名 | 预期值 | 实际值 | 作用 |
|--------|---------|----------|------|
| `RUNPOD_API_KEY` | `a1b2c...` | ⚠️ 空 | RunPod API 认证密钥 |
| `RUNPOD_ENDPOINT_ID_FLUX` | `wozrrlcdipyl3p` | ⚠️ 空 | FLUX Premium 端点 (RTX 4090) |
| `RUNPOD_ENDPOINT_ID_SDXL_PONY` | `8j3uzuvncbw1xu` | ⚠️ 空 | SDXL Pony Realism 端点 (RTX 3090) |
| `RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS` | `kbca2e380jc74s` | ⚠️ 空 | SDXL Illustrious 端点 (RTX 3090) |
| `RUNPOD_DC2_CHAT_URL` | `wozrrlcdipyl3p` | ⚠️ 空 | DC2 会员聊天生图端点 |
| `RUNPOD_PRO_CHAT_URL` | `wozrrlcdipyl3p` | ⚠️ 空 | Pro 会员聊天生图端点 |
| `RUNPOD_UNLIMITED_CHAT_URL` | `wozrrlcdipyl3p` | ⚠️ 空 | Unlimited 会员聊天生图端点 |

**三端点架构说明**：
- **FLUX Premium (RTX 4090)** → SFW 精品写实 / 3D / 产品资产（`e40cgshtouocg8`）
- **SDXL Pony Realism (RTX 3090)** → 写实女/男/跨 + NSFW 写实（`8j3uzuvncbw1xu`）
- **SDXL Illustrious (RTX 3090)** → 二次元/动漫（`kbca2e380jc74s`）

**代码路由逻辑**（`src/lib/image-generation-routing.ts`）：
- 写实家族 → `RUNPOD_ENDPOINT_ID_SDXL_PONY`，二次元 → `RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS`
- 家族变量缺失时回退通用 `RUNPOD_ENDPOINT_ID_SDXL`；NSFW 无端点时 fail-closed 抛错

### 报错表现

1. **捏脸/创建伴侣生图** - `/api/generate-image` 返回错误："Image generation is not configured"
2. **聊天生图** - SSE 流中断，无法发送图片
3. **工作室页面** - 提示词编辑后点击生成无响应

---

## ✅ 解决步骤

### 第一步：获取 RunPod 凭证

#### A. 准备 RunPod API Key
1. 访问 https://www.runpod.io/console/user/settings
2. 点击右上角 → Settings → API Keys
3. 点击 "Create New Key" 复制完整的 Key（类似：`a1b2c3d4e5f6g7h8i9j0`）
4. **⚠️ 注意**：这个 Key 可以访问你的所有 RunPod 资源，请妥善保管

#### B. 选择/创建 ComfyUI 端点
你有两个选择：

**选项 1：使用现有的专用端点（推荐）**
- 已有项目使用的端点：`wozrrlcdipyl3p` (FLUX 底模)
- 端点名称可能是：`Flux-Unchained` / `ComfyUI-FLUX` 
- 如果不知道具体 ID，继续看下面的查找步骤

**选项 2：创建新的 Serverless Endpoint**
1. 登录 RunPod Console: https://www.runpod.io/console/serverless/create
2. 选择模板：
   - **ComfyUI** (官方镜像) 或
   - 自定义镜像 `soulmate9-runpod-comfyui-flux-ipadapter` (如果已部署到 Docker Hub)
3. 配置规格：
   - GPU: T4 或 RTX 4090 (根据预算)
   - Memory: 16GB+
   - Max Containers: 2-5 (避免过度消耗成本)
4. 部署后获得 `endpoint_id` (类似：`12chars-abcdef`)

#### C. 查找端点 ID 的方法
如果你已经有端点但不知道 ID：

```bash
# curl 查询
curl -s -X GET \
  'https://api.runpod.ai/v2/query' \
  -H 'content-type: application/json' \
  -H 'authorization: YOUR_API_KEY' \
  | jq '.[] | {name: .name, id: .id}'

# PowerShell 查询（Windows）
Invoke-RestMethod -Method GET -Uri 'https://api.runpod.ai/v2/query' -Headers @{Authorization='Bearer YOUR_API_KEY'} | Select-Object name,id
```

---

### 第二步：在 Vercel 中添加环境变量

#### 方法 A: Vercel Web 界面（推荐）

1. **登录 Vercel**: https://vercel.com/dashboard
2. **选择项目**: `soulmate9-ai01`
3. **进入 Project Settings**: 顶部导航栏 → Settings
4. **找到 Environment Variables**: 左侧菜单 → Environment variables
5. **Add new variable**: 点击按钮逐个添加

   ```
   Key: RUNPOD_API_KEY
   Value: rpa_... (从 RunPod 复制的完整 API Key)
   Environments: Production, Preview, Development

   Key: RUNPOD_ENDPOINT_ID_FLUX
   Value: e40cgshtouocg8
   Environments: Production, Preview, Development

   Key: RUNPOD_ENDPOINT_ID_SDXL_PONY
   Value: 8j3uzuvncbw1xu
   Environments: Production, Preview, Development

   Key: RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS
   Value: kbca2e380jc74s
   Environments: Production, Preview, Development

   Key: RUNPOD_SDXL_MODELS_READY
   Value: true
   Environments: Production, Preview, Development
   ```

   > 兼容项（可选）：`RUNPOD_ENDPOINT_ID=e40cgshtouocg8`、`RUNPOD_ENDPOINT_ID_SDXL=kbca2e380jc74s` 作为旧代码路径回退。

6. **保存** → 自动触发重新部署
7. **等待部署完成** (通常 2-5 分钟)

#### 方法 B: Vercel CLI（高级）

```powershell
# 安装 CLI（首次）
npm install -g vercel

# 登录
npx vercel login

# 链接项目
cd c:\Users\71489\soulmate9
npx vercel link --remote

# 添加环境变量（仅生产环境），逐个执行
npx vercel env add RUNPOD_API_KEY production
npx vercel env add RUNPOD_ENDPOINT_ID_FLUX production
npx vercel env add RUNPOD_ENDPOINT_ID_SDXL_PONY production
npx vercel env add RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS production
npx vercel env add RUNPOD_SDXL_MODELS_READY production

# 验证是否添加成功
npx vercel env ls production

# 触发重新部署
npx vercel deploy --prod
```

---

### 第三步：补充其他 URL 变量

对于聊天生图功能，还需要为不同会员等级配置不同的端点：

| 变量名 | 推荐值 | 说明 |
|--------|---------|------|
| `RUNPOD_DC2_CHAT_URL` | 与 `RUNPOD_ENDPOINT_ID` 相同 | DC2 会员聊天生图 |
| `RUNPOD_PRO_CHAT_URL` | 与 `RUNPOD_ENDPOINT_ID` 相同 | Pro 会员聊天生图 |
| `RUNPOD_UNLIMITED_CHAT_URL` | 与 `RUNPOD_ENDPOINT_ID` 相同 | Unlimited 会员聊天生图 |

**注意**：
- 如果使用同一个端点，三个 URL 都填相同的 endpoint_id
- 如果要区分高低配 GPU，可以将 Unlimited 放在高规格端点上

---

### 第四步：验证配置

#### 方式 A: 检查 Vercel 日志部署后的环境变量

```bash
# 本地运行命令查看（需要拉取环境变量）
vercel env pull

# 或者在 Vercel Dashboard → Deployments → 最新一次部署 → Click to view logs
# 搜索关键词：RUNPOD_API_KEY
```

#### 方式 B: 测试生图接口

在 Vercel 上访问以下端点（替换为你的域名）：

```bash
curl -X POST https://your-domain.vercel.app/api/generate-image \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A beautiful portrait of a young woman with long black hair, detailed face, soft lighting",
    "scene": "chat_selfie",
    "size": "1024x1024"
  }'
```

**预期结果**：
- ✅ 成功：返回 `{ images: [{ url: "...", ... }] }`
- ❌ 失败：返回 `{ error: "..." }` 并显示具体错误原因

#### 方式 C: 前端测试

1. 访问首页：`https://your-domain.vercel.app`
2. 点击右上角登录
3. 尝试**创建一个新伴侣**（捏脸流程）
4. 上传参考图 → 点击"生成"
5. 观察是否弹出预览框 + 显示生成的图片

---

## 📋 完整的环境变量清单

以下是项目中需要的完整 RunPod 相关环境变量：

```bash
# === RunPod Core Configuration ===
RUNPOD_API_KEY="rpa_..."                          # ← 必需：API 认证
RUNPOD_ENDPOINT_ID_FLUX="e40cgshtouocg8"          # ← 必需：FLUX Premium 端点

# === SDXL 三端点矩阵（必需，NSFW 硬路由） ===
RUNPOD_ENDPOINT_ID_SDXL_PONY="8j3uzuvncbw1xu"          # ← 写实女/男/跨
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS="kbca2e380jc74s"   # ← 二次元/动漫
RUNPOD_SDXL_MODELS_READY="true"                        # ← 矩阵总闸

# === 兼容回退（可选，家族变量缺失时使用） ===
RUNPOD_ENDPOINT_ID="e40cgshtouocg8"               # ← FLUX 旧变量回退
RUNPOD_ENDPOINT_ID_SDXL="kbca2e380jc74s"          # ← SDXL 单端点回退

# === 会员等级聊天生图（可选，缺省走主路由） ===
RUNPOD_DC2_CHAT_URL=""                           # ← 可选：DC2 聊天端点
RUNPOD_PRO_CHAT_URL=""                           # ← 可选：Pro 聊天端点
RUNPOD_UNLIMITED_CHAT_URL=""                     # ← 可选：Unlimited 聊天端点
RUNPOD_ANIMATEDIFF_ENDPOINT=""                   # ← 可选：视频生图端点
RUNPOD_TTS_ENDPOINT_ID=""                        # ← 可选：语音合成端点

# === Serverless Configuration ===
RUNPOD_VLLM_API_KEY=""                          # ← 可选：VLLM API Key
RUNPOD_VLLM_URL=""                              # ← 可选：VLLM Chat URL

# === Optional Rate Limiting ===
RUNPOD_POLL_MS="150000"                          # ← 可选：Polling timeout (ms)
RUNPOD_MAX_CONTAINER_COUNT="5"                   # ← 可选：最大容器数
```

---

## 🔍 故障排查

### Q1: 添加环境变量后仍提示 "isConfigured = false"
- **原因**：环境变量未正确注入到 Vercel Functions 运行环境
- **解决**：
  1. 确保在 **Production** 和 **Preview** 两个环境都添加了
  2. 检查环境变量值是否有前后空格
  3. 手动触发一次 `vercel deploy --prod`

### Q2: 报错 "Endpoint busy" 或 "Container not found"
- **原因**：RunPod Serverless 函数处于休眠状态
- **解决**：
  1. 在 RunPod Console → Serverless → 你的端点 → Warm up
  2. 或手动触发一次生图请求（等待 30-60 秒冷启动）

### Q3: 401 Unauthorized 错误
- **原因**：RUNPOD_API_KEY 无效或被撤销
- **解决**：
  1. 在 RunPod Console 重新生成一个新的 API Key
  2. 更新 Vercel 环境变量
  3. 重新部署

### Q4: 生图超时 / 长时间加载中
- **原因**：网络延迟、GPU 队列拥堵或代码层面的 timeout 限制
- **解决**：
  1. 增加 `RUNPOD_POLL_MS` 值（默认 150s，可改为 300s）
  2. 检查 RunPod 端点的 GPU 负载情况
  3. 查看 Vercel Logs 中的详细错误信息

---

## 🎯 下一步操作

1. **立即执行**：按照本文档的"第二步"在 Vercel 添加 `RUNPOD_API_KEY` + 三端点变量 + `RUNPOD_SDXL_MODELS_READY=true`
2. **验证测试**：访问首页 → 登录 → 捏脸生成测试
3. **持续监控**：打开 Vercel Dashboard → Deployments → 最新部署 → Logs 查看实时输出

**预期效果**：
- ✅ 捏脸/创建伴侣时生图成功
- ✅ 聊天中发送带图消息成功  
- ✅ 工作室（Studio）模式正常渲染提示词

---

## 📞 需要帮助？

如果遇到具体问题，提供以下信息给我：

1. 你在 Vercel 添加环境变量的截图
2. 生图失败时的浏览器 Network 面板（F12）
3. Vercel Dashboard 中该次部署的日志片段
