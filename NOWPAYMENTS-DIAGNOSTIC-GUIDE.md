# 🛠️ NOWPayments 支付故障诊断与修复清单

## 🔴 **当前状态确认**

根据你的截图和日志，两个支付都失败的原因是同一个：**Vercel 环境变量未配置**

### ❌ 错误现象
1. **会员订阅支付** → `Failed to create payment with NOWPayments` (500 错误)
2. **积分充值** → 弹窗显示旧式 TX Hash 表单（说明走了 fallback）

### 🔍 **根本原因**
```typescript
// src/lib/nowpayments-server.ts:15-21
function getApiKey(): string {
  const key = process.env.NOWPAYMENTS_API_KEY || '';
  if (!key) {
    throw new Error('NOWPayments is misconfigured - API Key missing');
  }
  return key;
}
```

**你的 API Key 只存在于本地的 `.env.prod.local`，Vercel 部署时没有这个文件！**

---

## ✅ **完整修复步骤（必须按顺序执行）**

### Step 1: 登录 Vercel Dashboard
🔗 https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

### Step 2: 添加环境变量

点击 "Add New" → Environment Variable，添加以下 8 个变量：

#### **A. 必填的 3 个核心变量**

| Name | Value | Environments |
|------|-------|--------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | ☑️ Production<br>☑️ Preview<br>☑️ Development |

#### **B. 代币包价格变量（5 个）**

| Name | Value | Environments |
|------|-------|--------------|
| `CRYPTO_TOKENS_500_PRICE` | `599` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_1000_PRICE` | `999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_2500_PRICE` | `2299` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_5000_PRICE` | `3999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `CRYPTO_TOKENS_10000_PRICE` | `6999` | ☑️ Production<br>☑️ Preview<br>☑️ Development |

**⚠️ 重要提醒：**
- ✅ 必须勾选所有三个环境（Production、Preview、Development）
- ⚠️ 价格单位是美分 cents，所以 `$9.99 = 999`

### Step 3: 重新部署

添加完环境变量后：
1. 点击左侧菜单 → **Deployments**
2. 找到最近一次部署
3. 点击右侧的三个点 (...) → **Redeploy**
4. 等待构建完成（约 1-2 分钟）

---

## 🧪 **验证是否修复成功**

### 测试会员订阅
1. 访问生产环境的 pricing 页面
2. 点击 Pro 会员 "使用 USDT 支付" 按钮
3. **预期结果：** 
   - ✅ 出现 NOWPayments 官方支付弹窗
   - ✅ URL 类似：`https://nowpayments.io/invoice/...`
   - ✅ 金额显示：$9.99
   - ❌ 不再出现 "Failed to create payment" 错误

### 测试积分充值
1. 切换到 Shop → Credits 标签
2. 点击 1000 credits ($9.99)
3. 选择 "NowPayments" 支付方式
4. **预期结果：**
   - ✅ 跳转到 NOWPayments 发票页面
   - ❌ 不再显示老式的填写 TX Hash 表单

---

## 📊 **代码层面的支付流程**

### 会员订阅流程
```
/user-clicks-pro-plan
  ↓
/frontend calls /api/crypto/initiate (planId="pro", billing="monthly")
  ↓
/backend getsNowPaymentsPriceCents("pro", "monthly") → 999 cents
  ↓
backend nowPaymentsCreatePayment({
  price_amount: 9.99,
  pay_currency: "usdttrc20",
  order_id: "soulmate_pro_monthly_..."
})
  ↓
❌ 如果 NOWPAYMENTS_API_KEY 未配置 → 立即抛出异常
✅ 如果配置成功 → 返回支付详情
```

### 积分充值流程
```
/user-clicks-credits-package
  ↓
/frontend calls /api/v2/shop/tokens ({packageId, provider: "nowpayments"})
  ↓
/backend checks CRYPTO_TOKENS_XXX_PRICE env vars
  ↓
create NOWPayments invoice/payment
  ↓
return { url: "...", type: "invoice" }
  ↓
frontend redirects to NOWPayments checkout page
```

---

## 🔍 **进阶诊断方法**

如果按照上述步骤完成后仍有问题：

### 方法 1: 检查 Vercel 环境变量
```bash
# 需要安装 Vercel CLI
npm i -g vercel

# 查看生产环境的环境变量
vercel env ls --prod
vercel env cat NOWPAYMENTS_API_KEY --prod
```

### 方法 2: 查看 Vercel 日志
```bash
vercel logs --prod
```

搜索关键词：
- `"[nowpayments]"` - 查找 API 调用日志
- `"API Key not configured"` - 确认是否是这个问题
- `"NOWPayments API error:"` - 查看具体 API 错误

### 方法 3: 本地测试 API Key
```powershell
# 测试 NOWPayments API
$headers = @{ 'x-api-key' = '162736a2-82ea-4a6b-85b5-18b0f72cd132' }
$response = Invoke-RestMethod -Uri 'https://api.nowpayments.io/v1/status' -Headers $headers
Write-Host $response.message
```

应该返回：`"Hello! The API works"`

---

## ⚠️ **常见错误排查**

### 错误 A: "Variable already exists"
**解决:** 直接编辑现有变量并更新值

### 错误 B: 添加了但没生效
**排查:**
1. 检查是否选了 Production 环境
2. 等待 30 秒让 Vercel 同步
3. Redeploy 强制刷新

### 错误 C: 价格不对
**排查:**
1. 数据库 `token_packages` 表是否有记录？
2. 环境变量值是否为数字（不是字符串）？
3. 前端是否缓存了旧数据？

### 错误 D: Webhook 不回调
**排查:**
1. `/api/nowpayments/ipn` 路由是否存在且可访问？
2. IPN Secret 是否正确配置？
3. HMAC-SHA512 签名验证实现是否正确？

---

## 🆘 **需要进一步帮助？**

如果按照上述步骤后仍有问题，请提供：

1. **Vercel Dashboard 截图:**
   - Settings → Environment Variables 页面
   - （记得把敏感信息打码！）

2. **Browser Console 错误:**
   - F12 → Console 标签
   - 完整错误堆栈

3. **Network 面板截图:**
   - `/api/crypto/initiate` 或 `/api/v2/shop/tokens` 请求
   - Response 标签页内容

4. **Vercel 日志:**
   ```bash
   vercel logs --prod | Select-String "nowpayments" -Context 2,2
   ```

---

## 📝 **最终检查清单**

- [ ] Step 1: 已登录 Vercel Dashboard
- [ ] Step 2: 8 个环境变量全部添加完成
- [ ] Step 2b: 每个变量都勾选了 Production + Preview + Development
- [ ] Step 3: 已点击 Redeploy 重新部署
- [ ] Step 4: 等待构建完成（观察进度条 100%）
- [ ] Test 1: 会员订阅支付正常跳转 NOWPayments
- [ ] Test 2: 积分充值跳过老式 TX Hash 表单
- [ ] Verify: Browser Console 无 500 错误
- [ ] Check: Network 响应返回 paymentId/payAddress

完成以上所有步骤后，支付系统应该能正常工作！🎉
