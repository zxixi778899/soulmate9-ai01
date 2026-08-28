# 🔧 NOWPayments 支付仍然失败的快速诊断方案

## 🎯 **问题现状**

根据截图：
1. ✅ 会员订阅 → `Failed to create payment with NOWPayments` (500 错误)
2. ⚠️ 积分充值 → 显示老式 TX Hash 表单（不是 NOWPayments 官方页面）

## 🔍 **可能原因分析**

### 原因 1: Vercel 没有重新部署 ❌ (最可能)
**症状：** 环境变量已配置，但代码还是旧的版本

**验证方法：**
```bash
vercel ls --prod
vercel deployments list --prod
```

查看最后一次部署的时间是否在你添加环境变量之后

### 原因 2: 环境变量没选对环境 ⚠️
**症状：** 配置时选了 Development 或 Preview，但生产用的是 Production

**验证方法：**
访问 https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables
- 确认每个变量都勾选了三个复选框：
  - ☑️ Production
  - ☑️ Preview  
  - ☑️ Development

### 原因 3: 浏览器缓存旧代码
**症状：** 积分充值弹窗是老的样式

**立即测试：**
打开浏览器 DevTools → Network 标签 → 勾选 "Disable cache"
或者按 Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac) 强制刷新

### 原因 4: API Key 格式问题
**症状：** NOWPayments API 无法连接

**验证命令：**
```powershell
$headers = @{ 'x-api-key' = '162736a2-82ea-4a6b-85b5-18b0f72cd132' }
try {
    $response = Invoke-RestMethod -Uri 'https://api.nowpayments.io/v1/status' -Headers $headers -ErrorAction Stop
    Write-Host "✅ NOWPayments API works!" -ForegroundColor Green
    Write-Host $response.message
} catch {
    Write-Host "❌ API Error: $_" -ForegroundColor Red
}
```

---

## ✅ **立即执行步骤**

### Step 1: 强制 Vercel 重新部署

#### **方法 A: 通过 Dashboard（推荐）**
1. 访问 https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
2. 找到最近一次部署
3. 点击右侧的 **Redeploy** 按钮
4. 勾选 "Clear Caches and Rebuild"
5. 等待构建完成

#### **方法 B: 通过 CLI**
```bash
cd c:\Users\71489\soulmate9
vercel deploy --prod --force
```

### Step 2: 清除浏览器缓存并测试

#### **方法 A: 硬刷新**
```bash
# Windows
Win + R → 输入 %localappdata%\Microsoft\Edge\User Data\Default\Cache
# 然后删除缓存文件
```

#### **方法 B: 无痕模式测试**
```bash
# Chrome: Win + Shift + N
# Firefox: Win + Ctrl + P
```

### Step 3: 检查 API 调用

打开浏览器 DevTools → Console 标签，点击购买按钮，查找：

```javascript
// 在 Network 面板找到 /api/crypto/initiate 请求
// 展开 Request Headers → 查看 Body
{
  "planId": "pro",
  "billing": "monthly"
}
```

**期望响应：**
```json
{
  "success": true,
  "paymentId": "...",
  "payAddress": "...",
  "network": "TRC-20",
  ...
}
```

**如果还是报错，完整复制错误信息给我**

### Step 4: 检查 Vercel 日志

```bash
# 实时查看日志
vercel logs --prod | Select-String "nowpayments" -Context 3,3

# 或者搜索特定时间段的日志
vercel logs --prod --since 1h
```

查找关键词：
- `[nowpayments] API Key not configured!` - API Key 有问题
- `NOWPayments API error:` - API 调用失败详情
- `Failed to create crypto payment record` - 数据库问题

---

## 🔬 **深入诊断脚本**

创建一个诊断脚本检查所有环境变量：

```powershell
# test-nowpayments-env.ps1
Write-Host "`n=== Checking NOWPayments Environment Variables ===" -ForegroundColor Cyan

$apiKey = [Environment]::GetEnvironmentVariable("NOWPAYMENTS_API_KEY", "Machine")
$ipnSecret = [Environment]::GetEnvironmentVariable("NOWPAYMENTS_IPN_SECRET", "Machine")

if ($apiKey -eq "") {
    Write-Host "❌ NOWPAYMENTS_API_KEY not found in system env vars" -ForegroundColor Red
    Write-Host "   This means the variable might only be in Vercel environment, not local" -ForegroundColor Yellow
} else {
    Write-Host "✅ NOWPAYMENTS_API_KEY found" -ForegroundColor Green
}

if ($ipnSecret -eq "") {
    Write-Host "⚠️ NOWPAYMENTS_IPN_SECRET not found in system env vars" -ForegroundColor Yellow
} else {
    Write-Host "✅ NOWPAYMENTS_IPN_SECRET found" -ForegroundColor Green
}

Write-Host "`nNote: Vercel environment variables are NOT available locally by default." -ForegroundColor Gray
Write-Host "To check if they're set in Vercel, use: vercel env ls --prod" -ForegroundColor Cyan
```

运行：
```powershell
.\test-nowpayments-env.ps1
```

---

## 🚨 **紧急修复方案**

如果上述方法都不奏效，尝试这个"核弹级"修复：

### 方案：完全删除并重建部署

```bash
# 1. 备份当前环境变量（Vercel Dashboard → Settings → Environment Variables → 手动记录）
# 2. 删除所有环境变量
# 3. 重新添加所有 8 个变量
# 4. 强制重新部署

vercel env rm NOWPAYMENTS_API_KEY --prod
vercel env rm NOWPAYMENTS_IPN_SECRET --prod
# ... 删除其他 6 个

# 重新添加
vercel env add NOWPAYMENTS_API_KEY 162736a2-82ea-4a6b-85b5-18b0f72cd132 --prod
vercel env add NOWPAYMENTS_IPN_SECRET GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU --prod
vercel env add NOWPAYMENTS_PAY_CURRENCY usdttrc20 --prod
vercel env add CRYPTO_TOKENS_500_PRICE 599 --prod
vercel env add CRYPTO_TOKENS_1000_PRICE 999 --prod
vercel env add CRYPTO_TOKENS_2500_PRICE 2299 --prod
vercel env add CRYPTO_TOKENS_5000_PRICE 3999 --prod
vercel env add CRYPTO_TOKENS_10000_PRICE 6999 --prod

# 强制重新部署
vercel deploy --prod --force
```

---

## 📊 **预期结果对比**

### ❌ **当前状态（失败）**
- 会员支付：`Failed to create payment with NOWPayments`
- 积分充值：老式 TX Hash 表单
- 浏览器 Console：红色错误

### ✅ **成功后的表现**
- 会员支付：NOWPayments 官方弹窗显示 QR 码/支付地址
- 积分充值：跳转至 `https://nowpayments.io/invoice/[invoice-id]`
- 浏览器 Console：无 JavaScript 错误

---

## 🆘 **需要你提供以下信息**

如果修复后仍失败，请提供：

1. **终端输出：**
   ```bash
   vercel logs --prod --tail | Select-String "crypto|nowpayments|500" -Context 2,2
   ```

2. **Browser Console 错误截图：**
   - F12 → Console 标签
   - 点击购买按钮后出现的红色错误
   
3. **Network 面板详情：**
   - F12 → Network 标签
   - 点击购买按钮
   - 找到 `/api/crypto/initiate` 或 `/api/v2/shop/tokens`
   - 截图 Response 标签页内容

4. **环境变量验证：**
   ```bash
   vercel env ls --prod | Select-String "NOWPAYMENTS"
   ```

有了这些信息我才能进一步帮你精准定位问题！
