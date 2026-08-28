# 🚨 NOWPayments 支付失败的最终确认清单

根据你的截图，我发现了两个关键问题：

## 🔴 **问题 1: 会员订阅仍然报 500 错误**

### 原因分析
```typescript
// src/lib/nowpayments-server.ts:15-21
function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY || '';
  if (!key) {
    logger.error('[nowpayments] API Key not configured!');
    throw new Error('NOWPayments is misconfigured - API Key missing in environment variables');
  }
  return key;
}
```

**你虽然在 Vercel Dashboard 添加了环境变量，但可能：**
1. ❌ 没有勾选 Production 环境（只选了 Development）
2. ❌ 添加后没有重新部署
3. ❌ 环境变量名称拼写错误
4. ❌ API Key 值被截断或修改了

### ✅ 立即验证步骤

#### **Step 1: 在 Vercel Dashboard 再次确认**

访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

**检查这 3 个变量：**

| Name | Value (只显示前 8 位和后 4 位) | Environments |
|------|-----------------------------|--------------|
| `NOWPAYMENTS_API_KEY` | `162736a2...cd132` | ☑️ Prod + ☑️ Preview + ☑️ Dev |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nM...fEtPU` | ☑️ Prod + ☑️ Preview + ☑️ Dev |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | ☑️ Prod + ☑️ Preview + ☑️ Dev |

**⚠️ 重点确认：**
- 每个变量的 Value 字段必须完整显示，没有被截断
- 三个复选框都必须打勾（绿色）

#### **Step 2: 通过 CLI 验证环境变量**

```powershell
# 安装 Vercel CLI (如果还没安装)
npm i -g vercel

# 查看生产环境的环境变量列表
vercel env ls --prod

# 应该看到类似输出：
# NOWPAYMENTS_API_KEY 
# NOWPAYMENTS_IPN_SECRET
# NOWPAYMENTS_PAY_CURRENCY
```

如果没有输出，说明环境变量确实没添加到 Production 环境！

---

## 🔴 **问题 2: 积分充值显示老式表单**

### 原因分析

你的前端代码 `src/app/(main)/shop/page.tsx` 第 407-445 行已经支持新的支付方式：

```javascript
const confirmTokenPay = async (provider: 'nowpayments' | 'nexapay', extra?: string) => {
  // ... 代码逻辑正确
  const res = await authedFetch('/api/v2/shop/tokens', {
    method: 'POST',
    body: JSON.stringify({ package_id, provider })
  });
  
  if (data.url) {
    window.location.href = data.url;  // ← 应该跳转到这里
    return;
  }
  
  if (data.payAddress) {
    setPayWallet({...});  // ← fallback 到老式表单
    setPayStep('wallet');
  }
}
```

**问题在于：**
- ✅ 如果 `/api/v2/shop/tokens` 返回 `{ url: "https://nowpayments.io/invoice/..." }` → 跳转官方页面
- ❌ 如果报错或返回 `{ payAddress: "..." }` → 显示老式 TX Hash 表单

### ✅ 立即测试步骤

#### **Step 1: 强制清除浏览器缓存**

```bash
# 方法 A: Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)
# 方法 B: F12 → Network 标签 → 勾选 "Disable cache"
# 方法 C: 使用无痕窗口 Win+Shift+N
```

#### **Step 2: 测试积分充值流程**

1. 打开 Shop 页面 → Credits 标签
2. 点击 "1,000 credits ($9.99)"
3. 在弹窗中选择 **"NowPayments"** 支付方式
4. **观察结果：**
   - ✅ **成功:** 直接跳转到 https://nowpayments.io/invoice/[invoice-id]
   - ❌ **失败:** 出现 QR 码和 TX Hash 输入框

#### **Step 3: 检查 API 响应**

打开浏览器 DevTools → Network 标签

1. 刷新页面 (Ctrl+Shift+R)
2. 点击 1,000 credits
3. 选择 NowPayments
4. 在 Network 面板找到 `/api/v2/shop/tokens` 请求
5. **展开 Response 标签页，看内容是什么？**

**期望的正确响应：**
```json
{
  "status": "checkout_created",
  "provider": "nowpayments",
  "url": "https://nowpayments.io/invoice/xQz...",
  "package": {...},
  "token_count": 1000
}
```

**错误的响应（走 fallback）：**
```json
{
  "status": "checkout_created",
  "provider": "nowpayments",
  "type": "payment",
  "url": null,
  "payAddress": "TUE8yxwJZEMSGbQSt22CRcTqA9CxyvNhUc",
  "payAmount": 9.99,
  ...
}
```

---

## 🎯 **综合修复方案**

### **立即执行（按顺序）**

#### **1. 验证环境变量是否真的生效**

```powershell
# 创建临时测试文件 test-env.js
Set-Content test-env.ps1 -Value @"
# Check if running on Vercel production
if ($env:VERCEL_ENV -eq "production") {
    Write-Host "Running in Vercel Production"
    
    # Try to access environment variable
    \$apiKey = Get-ChildItem Env:NOWPAYMENTS_API_KEY
    if (\$apiKey) {
        Write-Host "✅ NOWPAYMENTS_API_KEY found" -ForegroundColor Green
    } else {
        Write-Host "❌ NOWPAYMENTS_API_KEY NOT FOUND" -ForegroundColor Red
    }
} else {
    Write-Host "⚠️ Not running in Vercel Production" -ForegroundColor Yellow
}
"@

# 然后在本地运行（会显示警告，因为不在 Vercel）
.\test-env.ps1
```

#### **2. 强制 Vercel 重新部署**

```powershell
# 方式 A: Dashboard 手动操作
# 1. 访问 https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
# 2. 找到最近一次部署
# 3. 点击右侧的三个点 (...)
# 4. 选择 "Redeploy"
# 5. 勾选 "Clear Caches and Rebuild"
# 6. 等待部署完成

# 方式 B: 命令行强制部署（推荐）
vercel deploy --prod --force
```

#### **3. 检查 API 是否正常工作**

在你的本地终端运行（先登录 Vercel）：

```bash
# Login to Vercel
vercel login

# Trigger a production deployment
vercel --prod

# Watch logs in real-time
vercel logs --prod
```

然后在前端点击购买按钮，观察日志输出。

---

## 📊 **快速诊断表**

| 症状 | 可能原因 | 解决方案 |
|------|---------|---------|
| 会员订阅报 500 错误 | API Key 未生效 | 检查环境变量是否勾选 Production + Redeploy |
| 会员订阅报 500 错误 | 环境变量拼写错误 | 检查大小写完全匹配 |
| 积分充值显示老表单 | 前端缓存旧代码 | Ctrl+Shift+R 硬刷新或使用无痕模式 |
| 积分充值显示老表单 | API 调用失败 | 检查 Browser Console 错误详情 |
| 两者都失败 | 完全没有重新部署 | vercel deploy --prod --force |

---

## 🔍 **需要你提供的信息**

请按顺序执行以下命令并提供输出：

### **1. 检查环境变量是否添加**
```bash
vercel env ls --prod | Select-String "NOWPAYMENTS"
```

**期望输出：**
```
NOWPAYMENTS_API_KEY
NOWPAYMENTS_IPN_SECRET
NOWPAYMENTS_PAY_CURRENCY
```

如果只有部分或没有，说明环境变量没加对！

### **2. 实时查看 Vercel 日志**
```bash
vercel logs --prod --tail
```

然后在前端点击"使用 USDT 支付"按钮，复制控制台输出的日志给我。

### **3. Browser Console 错误截图**
F12 → Console 标签 → 截图显示的内容

### **4. Network 面板 Response**
F12 → Network 标签 → 找到 `/api/crypto/initiate` 或 `/api/v2/shop/tokens` → Response 标签 → 截图

---

有了这些信息我才能精准定位问题并给出针对性解决方案！
