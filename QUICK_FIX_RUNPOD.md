# 🎯 RunPod 生图故障修复 - 快速指南

## 🔍 当前问题分析

根据您的反馈：
- ✅ 之前一直正常生成
- ✅ 已有 ComfyUI + FLUX 模型运行

**最可能的原因**:
1. Vercel 环境变量被新部署覆盖/清除
2. RunPod Pod URL 可能改变
3. 新的.env 文件覆盖了旧的配置

---

## ⚡ 立即修复步骤 (按优先级执行)

### 🥇 Plan A: 检查 Vercel Dashboard (推荐 - 最快)

#### Step 1: 登录 Vercel
访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

#### Step 2: 查找关键变量
检查是否还有这些变量：
```bash
RUNPOD_API_KEY          ✅ 必需
RUNPOD_ENDPOINT_ID      ✅ 必需  
RUNPOD_DC2_CHAT_URL     ✅ 推荐
RUNPOD_PRO_CHAT_URL     ✅ 推荐
```

#### Step 3: 如果缺失 → 重新添加

**如何获取值**:
1. **RUNPOD_API_KEY**: 
   - 访问 https://www.runpod.io/console/account/api-keys
   - 复制或创建新的 API Key
   
2. **RUNPOD_ENDPOINT_ID**:
   - 访问 https://www.runpod.io/console/pods
   - 找到正在运行的 Pod
   - 复制 Public URL (格式：`https://...`)

#### Step 4: 保存并重试
- 点击 Save
- 等待自动部署 (~3 分钟)
- 测试生成图片

---

### 🥈 Plan B: 本地环境验证 (如果您在 dev 模式)

#### Step 1: 检查.env 文件
```powershell
cd c:\Users\71489\soulmate9

# 查看当前配置的.env 文件
cat .env.prod.local | Select-String "RUNPOD"
cat .env.vercel | Select-String "RUNPOD"
```

#### Step 2: 如果有值但不对
编辑 `.env.prod.local`:
```bash
# Add or update these lines
RUNPOD_API_KEY=<your-api-key-here>
RUNPOD_ENDPOINT_ID=https://your-endpoint.here
```

#### Step 3: 重启开发服务器
```bash
pnpm dev
```

---

### 🥉 Plan C: 使用诊断脚本

我已经创建了自动检测工具：

#### Windows PowerShell:
```powershell
# Set your variables first
$env:RUNPOD_API_KEY="rpc_your_key_here"
$env:RUNPOD_ENDPOINT_ID="https://your-endpoint.here"

# Run diagnostic
node scripts/check-runpod-endpoint.js
```

该脚本会自动：
- ✅ 检查环境变量是否存在
- ✅ 验证格式是否正确  
- ✅ 测试端点健康状态
- ✅ 返回清晰的修复建议

---

## 📊 常见错误诊断

| 错误类型 | 症状 | 解决方案 |
|---------|------|----------|
| `Endpoint ID is empty` | Network 面板显示请求失败 | 添加 RUNPOD_ENDPOINT_ID 到 Vercel |
| `401 Unauthorized` | API 调用返回 401 | 检查 RUNPOD_API_KEY 格式 (应以 rpc_开头) |
| `502 Bad Gateway` | 超时或连接拒绝 | 检查 Pod 是否运行，URL 是否正确 |
| `CORS Error` | 浏览器控制台报错 | 通常是端点配置问题 |

---

## 🔬 快速验证清单

完成上述步骤后，验证：

- [ ] Vercel Dashboard 中变量存在且非空
- [ ] RUNPOD_API_KEY 格式为 `rpc_xxx`
- [ ] RUNPOD_ENDPOINT_ID 以 `https://` 开头
- [ ] 没有语法错误或拼写错误
- [ ] Vercel 部署已完成并激活

---

## 💡 额外提示

### 为什么之前正常现在不行？

可能情况：
1. **Git 提交覆盖了.env 文件** - 解决方法：重新添加环境变量到 Vercel
2. **RunPod Pod 被重启** - 解决方法：确认 Pod 仍在运行，URL 未变
3. **团队修改了配置** - 解决方法：联系团队成员了解最新配置

### 防止未来再出现

建议措施：
- 在 Git commit 中排除.env 文件（已配置）
- 所有敏感变量只存储在 Vercel Dashboard
- 定期备份重要配置信息

---

## ✅ 下一步行动

**请按以下顺序操作**:

1. **立即**: 打开 Vercel Dashboard → Settings → Environment Variables
2. **检查**: 是否有 RUNPOD_API_KEY 和 RUNPOD_ENDPOINT_ID
3. **修复**: 如果缺失，从 RunPod Console 复制正确的值并粘贴
4. **验证**: 等待部署完成后，测试创作工作台能否生成图片

**需要帮助？** 随时告诉我您看到的具体情况，我会提供针对性的解决方案！🚀

---

*Created: Quick Fix Guide for Production Issue*
*Status: Ready to Execute*
