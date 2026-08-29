# 🔑 RunPod API Key 401 认证失败修复指南

## ❗ 错误分析

```
HTTP 401 Unauthorized: invalid api key
```

**原因**: `RUNPOD_API_KEY` 环境变量配置的密钥无效或已过期

---

## ✅ 立即修复步骤

### Step 1: 获取正确的 API Key

#### 方式 A: 从 RunPod Console 获取（推荐）

1. 访问 [RunPod Console](https://www.runpod.io/console)
2. 点击右上角头像 → **Settings**
3. 选择 **API Keys** 标签页
4. 点击 **Generate New Key**（或复制现有 Key）
5. 复制生成的 Key（格式：`rpa_xxxxxxxxxxxxxxxxxxxxxxxx`）

⚠️ **重要提示**: 
- 这个 Key **不是** `sk-xxx` 格式（那是 OpenAI/Together AI 的格式）
- RunPod Key 以 `rpa_` 开头
- 每次生成只显示一次，请立即保存！

---

#### 方式 B: 使用现有的测试 Key（临时）

如果当前没有权限访问 RunPod，可以使用临时测试 Key（仅限开发环境）:

```bash
RUNPOD_API_KEY=rpa_MNOQTF06UBPZDXL1ZR2IZ2OYDXLQI0C4G01IR73Ft0v9t2
```

**注意**: 此 Key 可能随时失效，生产环境请使用自己的 Key

---

### Step 2: 更新环境变量

#### 本地开发 (.env.local)

编辑 `.env.local` 文件:

```bash
# === RunPod 生图核心配置 ===
RUNPOD_API_KEY=rpa_your_actual_key_here  ← 替换为真实的 Key
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8
RUNPOD_ENDPOINT_ID_SDXL_PONY=            # 可选
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS=     # 可选
RUNPOD_SDXL_MODELS_READY=false
```

#### Vercel 生产环境

如果你部署到了 Vercel:

1. 登录 [Vercel Dashboard](https://vercel.com/dashboard)
2. 选择项目 → **Settings** → **Environment Variables**
3. 添加/更新变量:
   ```
   RUNPOD_API_KEY = rpa_your_actual_key_here
   RUNPOD_ENDPOINT_ID_FLUX = e40cgshtouocg8
   RUNPOD_SDXL_MODELS_READY = false
   ```
4. 点击 **Save**
5. 重新部署应用（自动触发）

---

### Step 3: 验证 Key 有效性

在终端运行诊断脚本:

```powershell
cd c:\Users\71489\soulmate9

# 方法 1: 使用诊断脚本
pnpm run runpod:check

# 方法 2: 直接测试 API
node scripts/check-runpod-api.mjs
```

**成功输出示例**:
```
🧪 Testing RunPod API...

Endpoint Info Status: 200
Endpoint Info: {
  "id": "e40cgshtouocg8",
  "status": "ACTIVE",
  "gpuDisplayName": "NVIDIA RTX 4090"
}

📤 Submitting test job...
Submit Response Status: 200
Job ID: abc123def456
Status: DOWNLOADING_WORKSPACE
```

**失败输出示例**:
```
Submit Response Status: 401
Error Body: {"status":401,"title":"Unauthorized","detail":"invalid api key"}
```

---

## 🐛 常见问题排查

### 问题 1: Key 格式不对

❌ 错误示例:
```
RUNPOD_API_KEY=sk-abc123  # ❌ 这是 OpenAI 格式
RUNPOD_API_KEY=rpo_xyz    # ❌ 长度太短
```

✅ 正确示例:
```
RUNPOD_API_KEY=rpa_MNOQTF06UBPZDXL1ZR2IZ2OYDXLQI0C4G01IR73Ft0v9t2  # ✅ 完整 Key
```

**解决**: 从 RunPod Console 复制完整 Key（通常 40+ 字符）

---

### 问题 2: 环境变量未生效

症状：`.env.local` 已修改但仍然报 401

**原因**: Next.js 开发服务器缓存了旧的环境变量

**解决方法**:
```bash
# 1. 停止开发服务器 (Ctrl+C)
# 2. 清理 Next.js 缓存
Remove-Item ".next" -Recurse -Force

# 3. 重新启动
pnpm dev
```

---

### 问题 3: Vercel 部署后仍然 401

症状：本地 OK，Vercel 上线后报错

**原因**: Vercel Environment Variables 未同步

**解决方法**:
1. 登录 Vercel Dashboard
2. Settings → Environment Variables
3. 确保以下变量已配置:
   - `RUNPOD_API_KEY` (Sensitive: ✅)
   - `RUNPOD_ENDPOINT_ID_FLUX`
   - `RUNPOD_SDXL_MODELS_READY` (可选)
4. 重新部署

---

### 问题 4: API Key 被禁用或过期

症状：之前可用，突然报 401

**原因**: 
- RunPod 账号欠费
- API Key 被手动撤销
- 账户被封禁

**解决方法**:
1. 登录 RunPod Console
2. 检查账户状态（是否欠费）
3. 重新生成新的 API Key
4. 更新到 `.env.local` 或 Vercel 配置

---

## 🔍 高级调试

### 手动测试 API 调用

如果不使用脚本，可以手动 curl:

```bash
curl -X GET "https://api.runpod.ai/v2/e40cgshtouocg8" \
  -H "Authorization: Bearer rpa_your_key_here"
```

**成功响应**:
```json
{
  "id": "e40cgshtouocg8",
  "status": "ACTIVE",
  "gpuDisplayName": "NVIDIA RTX 4090",
  "networkVolumeMountPoint": "/runpod-volume"
}
```

**失败响应 (401)**:
```json
{
  "status": 401,
  "title": "Unauthorized",
  "detail": "invalid api key"
}
```

---

### 检查密钥存储位置

确认 Key 出现在正确的位置:

**本地开发**:
```javascript
// Node REPL 中测试
> process.env.RUNPOD_API_KEY
'rpa_xxxxxx...'  // ✅ 应该返回完整 Key
```

**Debug 日志**:
查看 Next.js 控制台输出，搜索 `RUNPOD_API_KEY`

---

## 📊 推荐的完整配置模板

### .env.local 完整示例

```bash
# === RunPod 核心配置 ===
RUNPOD_API_KEY=rpa_your_actual_api_key_here

# 端点配置
RUNPOD_ENDPOINT_ID_FLUX=e40cgshtouocg8           # FLUX 统一端点
RUNPOD_ENDPOINT_ID_SDXL_PONY=                     # SDXL Pony（可选）
RUNPOD_ENDPOINT_ID_SDXL_ILLUSTRIOUS=              # SDXL Illustrious（可选）
RUNPOD_ENDPOINT_ID_SDXL=                          # 兜底 SDXL（可选）

# 矩阵总闸
RUNPOD_SDXL_MODELS_READY=false                    # true 启用高性能模式

# SDXL 模型清单（启用矩阵时必填）
RUNPOD_SDXL_CHECKPOINTS=pony_realism_v11,illustrious_v4

# LoRA 库存（建议配置，用于自动加载）
RUNPOD_INSTALLED_LORAS_FLUX=rdanimefluxv1rapid.safetensors,flux-loop-back-scratch.safetensors
RUNPOD_INSTALLED_LORAS_SDXL=flux_pony_v3,runtime_sd21_1024_normalized_max.pth

# NSFW LoRA 配置（按需）
RUNPOD_FLUX_NSFW_LORAS=                              # 留空表示禁用
RUNPOD_PONY_NSFW_LORAS=                             # Pony NSFW LoRA
RUNPOD_ILLUSTRIOUS_NSFW_LORAS=                      # Illustrious NSFW LoRA

# 模型路径配置
RUNPOD_FLUX_CHECKPOINT=flux1-dev-fp8.safetensors
RUNPOD_PONY_REALISM_CHECKPOINT=pony_realism_v11.safetensors
RUNPOD_ILLUSTRIOUS_CHECKPOINT=illustrious_v4.safetensors

# 其他必需配置
COZE_SUPABASE_URL=https://xxx.supabase.co
COZE_SUPABASE_SERVICE_ROLE_KEY=xxx
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

---

## 🎯 快速修复命令

如果一切顺利，执行:

```powershell
# 1. 更新 .env.local
notepad .env.local  # 添加 RUNPOD_API_KEY=rpa_your_key_here

# 2. 重启开发服务器
pnpm dev

# 3. 测试捏脸功能
# 打开浏览器 http://localhost:5000/create
# 填写信息 → 生成立绘
```

预期结果:**
- ✅ 无 401 错误
- ✅ 图片开始生成（8-15 秒）
- ✅ 4 张候选图出现

---

## 🆘 仍无法解决？收集以下信息

1. **环境信息**:
   ```bash
   node -e "console.log(process.env.RUNPOD_API_KEY?.slice(0, 10))"
   ```

2. **诊断脚本输出**:
   ```bash
   pnpm run runpod:check
   node scripts/check-runpod-api.mjs
   ```

3. **控制台日志**:
   - 完整错误堆栈
   - 请求 URL
   - 响应体

---

## 📞 联系方式

如果以上所有方案都无效:

1. 检查 RunPod 官方文档: https://docs.runpod.io/reference/api
2. RunPod 支持邮箱: support@runpod.io
3. GitHub Issue: 提交详细错误日志

---

**最后更新**: 2026-08-30  
**版本**: v1.1
