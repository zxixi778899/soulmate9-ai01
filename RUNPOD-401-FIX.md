# RunPod API Key 401 错误修复指南

## 🚨 当前问题

**错误信息：**
```
RunPod generation failed: submit HTTP 401 {"status":401,"title":"Unauthorized","detail":"invalid api key"}
```

## ✅ 问题原因

您的 RunPod API Key **`rpa_REDACTED`** 可能已失效或被禁用。

但经过测试，这个 Key **在本地是有效的**。这意味着：
- ❌ **环境变量没有重新加载** - Node.js 服务器启动后不会自动读取 `.env.local` 的更改
- ❌ **开发服务器使用的是旧的缓存配置**

## 🔧 解决方案（二选一）

### 方案 A：使用最新的 API Key ⭐⭐⭐⭐⭐

如果您有**新的 API Key**，请执行以下操作：

1. **登录 RunPod Console**: https://www.runpod.io/console
2. **Settings → API Keys**
3. **创建新的 API Key**（如果现有的都不可用）
4. **复制新的 API Key**
5. **更新 `.env.local`**:

```bash
RUNPOD_API_KEY=你的新_API_Key_在这里
RUNPOD_ENDPOINT_ID=e40cgshtouocg8  # 保持不变
```

### 方案 B：重启开发服务器（快速）

如果 `rpa_REDACTED` 实际上仍然有效：

#### Windows PowerShell 操作步骤：

```powershell
# 1. 停止当前的开发服务器（按 Ctrl+C）

# 2. 清理 Node.js 进程（如果需要）
Stop-Process -Name "node" -Force

# 3. 重新启动开发服务器
pnpm dev
```

#### Vercel 部署环境（生产/预览）：

如果您在 Vercel 上遇到这个问题：

```bash
# 在 Vercel Dashboard 中更新环境变量
vercel env pull .env.production.local  # 或 .env.vercel

# 或者手动在 https://vercel.com/dashboard 中设置：
# Projects → soulmate9 → Settings → Environment Variables
```

## 📋 验证步骤

修复后，运行以下测试确认 API Key 有效：

```powershell
# 测试脚本（已提供）
node test-api-key.js
```

**预期输出：**
```
Status: 200
Response: {"id":"xxx","status":"IN_QUEUE"}
✅ API Key 有效
```

## ⚠️ 注意事项

如果所有 API Key 都返回 401：
1. **检查账户余额** - RunPod 可能需要充值
2. **检查端点状态** - `e40cgshtouocg8` 是否仍然是 RUNNING/ACTION
3. **检查权限** - API Key 是否有 Serverless 端点访问权限
4. **检查区域** - 端点所在区域是否可用

## 🔄 环境变量优先级

项目使用的环境变量文件（优先级从高到低）：
1. `.env.production.local` (生产环境)
2. `.env.vercel` (Vercel 部署)
3. `.env.local` (本地开发)
4. `.env` (基础配置)

确保您在正确的文件中更新了 API Key！

---

## 🆘 需要帮助？

如果您有新的 API Key 但仍然无法工作，请提供：
1. 新的 API Key
2. 确认端点 ID 是否正确
3. RunPod Console 的截图（端点状态）
