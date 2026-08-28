# 🔧 NOWPayments 支付的隐藏问题：NEXT_PUBLIC_环境变量缺失

## 🚨 **发现的根本问题**

根据代码分析，`/api/crypto/initiate/route.ts` 第 83-85 行使用了以下环境变量来构建回调 URL：

```typescript
// 第 83-85 行
ipn_callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/crypto/webhook`,
success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?success=true`,
cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing?canceled=true`,
```

**如果 `NEXT_PUBLIC_SITE_URL` 或 `NEXT_PUBLIC_APP_URL` 没有配置，NOWPayments 会收到空的 URL 或 `undefined`，导致 API 调用失败！**

---

## 📋 **完整的环境变量清单（共 10 个）**

### ✅ **必须配置的 10 个环境变量：**

#### A. NOWPayments API 配置（3 个必需）
| Name | Value | Environments |
|------|-------|--------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | ☑️ Prod + Preview + Dev |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | ☑️ Prod + Preview + Dev |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | ☑️ Prod + Preview + Dev |

#### B. 应用 URL 配置（**新增的 2 个必需**）⚠️
| Name | Expected Value | Description | Environments |
|------|----------------|-------------|--------------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.oxmate-ai.com` | 站点基础 URL | ☑️ Prod + Preview + Dev |
| `NEXT_PUBLIC_APP_URL` | `https://www.oxmate-ai.com` | 应用主 URL | ☑️ Prod + Preview + Dev |

#### C. 代币包价格配置（5 个）
| Name | Value | Description | Environments |
|------|-------|-------------|--------------|
| `CRYPTO_TOKENS_500_PRICE` | `599` | 500 credits = $5.99 | ☑️ Prod + Preview + Dev |
| `CRYPTO_TOKENS_1000_PRICE` | `999` | 1,000 credits = $9.99 | ☑️ Prod + Preview + Dev |
| `CRYPTO_TOKENS_2500_PRICE` | `2299` | 2,500 credits = $22.99 | ☑️ Prod + Preview + Dev |
| `CRYPTO_TOKENS_5000_PRICE` | `3999` | 5,000 credits = $39.99 | ☑️ Prod + Preview + Dev |
| `CRYPTO_TOKENS_10000_PRICE` | `6999` | 10,000 credits = $69.99 | ☑️ Prod + Preview + Dev |

---

## 🔍 **为什么之前没发现这个问题？**

1. **前端代码中的默认值掩盖了问题：**
   ```typescript
   // src/lib/constants.ts:6-7
   export const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.oxmate-ai.com';
   ```
   前端有 fallback，所以页面正常显示。

2. **后端代码直接依赖环境变量：**
   ```typescript
   // /api/crypto/initiate/route.ts:83-85
   ipn_callback_url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/crypto/webhook`
   // 如果变量为空 → "undefined/api/crypto/webhook" ❌
   ```

3. **NOWPayments API 验证严格：**
   - 当它收到空 URL 或无效格式的 URL 时会拒绝创建支付
   - 返回的错误可能不会详细记录到日志

---

## ✅ **立即修复方案**

### **步骤 1: 添加缺失的 2 个环境变量**

访问：https://vercel.com/dashboard/projects/soulmate9-ai01/settings/environment-variables

**添加这两个新变量（** ⚠️ **很多人会漏掉这个）：**

| Name | Value | Environments |
|------|-------|--------------|
| `NEXT_PUBLIC_SITE_URL` | `https://www.oxmate-ai.com` | ☑️ Production<br>☑️ Preview<br>☑️ Development |
| `NEXT_PUBLIC_APP_URL` | `https://www.oxmate-ai.com` | ☑️ Production<br>☑️ Preview<br>☑️ Development |

**⚠️ 重要提示：**
- 域名需要根据你的实际网站调整（目前是 oxmate-ai.com）
- **不要**带 `/` 后缀
- 使用 `https://` 协议
- 三个环境都要勾选

---

### **步骤 2: 重新部署**

完成环境变量配置后：

1. 访问 Dashboard → **Deployments**
2. 找到最近一次部署
3. 点击 **"Redeploy"**
4. 勾选 **"Clear Caches and Rebuild"** (关键！)
5. 等待 2-3 分钟

---

## 🔬 **验证修复是否成功**

### **方法 1: 浏览器 Console 测试**

1. 打开 Browser DevTools (`F12`)
2. 切换到 **Console** 标签
3. 刷新 pricing 页面
4. 点击 Pro 会员的 "使用 USDT 支付" 按钮
5. **观察 Console 输出：**

**期望看到：**
```
[crypto/initiate] Received request: {planId: 'pro', billing: 'monthly'}
✅ Success! Response: {paymentId: '...', payAddress: '...', ...}
```

**如果还是错误，看详细的 error message。**

---

### **方法 2: Network 面板验证**

1. **Network** 标签
2. 刷新页面
3. 点击购买按钮
4. 找到 `/api/crypto/initiate` 请求
5. **展开 Details → Request Headers**

**确认发送给 NOWPayments 的 URL 是否正确：**

```json
{
  "price_amount": 9.99,
  "price_currency": "usd",
  "pay_currency": "usdttrc20",
  "order_id": "soulmate_pro_monthly_xxx",
  "order_description": "Pro Monthly Membership",
  "ipn_callback_url": "https://www.oxmate-ai.com/api/crypto/webhook",  ✅ 正确格式
  "success_url": "https://www.oxmate-ai.com/pricing?success=true",     ✅ 正确格式
  "cancel_url": "https://www.oxmate-ai.com/pricing?canceled=true"      ✅ 正确格式
}
```

如果看到这些 URL 是完整的 https 格式，说明修复成功了！

---

### **方法 3: 通过 Vercel Logs 查看详细日志**

```bash
vercel logs --prod | Select-String "crypto/initiate|nowpayments" -Context 2,2
```

**期望的正确日志：**
```
[info] [crypto/initiate] Received request: {"planId":"pro","billing":"monthly"}
[info] [nowpayments] Creating payment: {price_amount: 9.99, order_id: "..."}
[info] [crypto/initiate] Payment created successfully: paymentId=xxx
```

---

## 🎯 **完整诊断流程总结**

如果你的环境变量确实都配置了但还是失败，请按顺序检查：

### **Step 1: 确认所有 10 个环境变量都存在**
```powershell
# 如果有 Vercel CLI
vercel env ls --prod | Select-String 'NOWPAYMENTS\|SITE_URL\|APP_URL'
```

**应该看到 10 行输出：**
```
NOWPAYMENTS_API_KEY
NOWPAYMENTS_IPN_SECRET
NOWPAYMENTS_PAY_CURRENCY
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_APP_URL
CRYPTO_TOKENS_500_PRICE
CRYPTO_TOKENS_1000_PRICE
CRYPTO_TOKENS_2500_PRICE
CRYPTO_TOKENS_5000_PRICE
CRYPTO_TOKENS_10000_PRICE
```

### **Step 2: 检查 `NEXT_PUBLIC_SITE_URL` 和 `NEXT_PUBLIC_APP_URL` 的值**
在 Vercel Dashboard 中查看这两个变量的具体值是什么：
- ✅ 应该是：`https://www.oxmate-ai.com`
- ❌ 不应该：空、undefined、localhost、或其他无效值

### **Step 3: 检查是否有重复的环境变量名**
有时候会有拼写错误，比如：
- ❌ `NEXT_PUBLIC_SITE_URL ` (后面有空格)
- ❌ `NEXT_PUBLIC_SITE_URL_OLD`
- ❌ `NEXT_PUBLIC_SITE_URL_BACKUP`

删除所有重复项。

### **Step 4: 强制重新部署并清除缓存**
```powershell
vercel deploy --prod --force
```

或者直接点击 Dashboard → Deployments → Redeploy

---

## 💡 **为什么会出现这种情况？**

这是常见的陷阱：

1. **Next.js 中 `NEXT_PUBLIC_` 前缀的变量比较特殊：**
   - 需要在客户端和服务端都能访问
   - 但服务端代码中使用 `process.env.XXX` 读取时不会自动 fallback

2. **很多开发者只配置了业务相关的环境变量（如 NOWPAYMENTS_*），忘了配置平台级的 URL 变量**

3. **本地开发时 `.env.local` 通常会有这些 URL 配置，但生产环境的 Vercel Dashboard 经常被忽略**

---

## 🆘 **如果还是不行**

请提供以下信息：

1. **Vercel Dashboard 中 `NEXT_PUBLIC_SITE_URL` 和 `NEXT_PUBLIC_APP_URL` 的具体值截图**

2. **Browser Console 的详细错误堆栈**：
   - F12 → Console 标签
   - 完整的错误信息和堆栈追踪

3. **Vercel 日志中的 NOWPayments 错误详情**：
   ```bash
   vercel logs --prod --since 1h
   ```
   然后在测试时实时复制输出的内容给我

有了这些信息我才能进一步帮你精准定位问题！
