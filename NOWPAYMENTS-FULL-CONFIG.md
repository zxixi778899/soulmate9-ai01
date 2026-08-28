# NOWPayments 完整配置指南（会员 + 积分）

## 🎯 问题总结

**当前状态：**
- ❌ 会员订阅支付失败 - 原因：Vercel Dashboard 未配置环境变量
- ✅ 代币包价格已支持 - 代码已完善，但需要配置环境变量

**前端显示的价格：**
```
500 积分   - $5.99
1,000 积分 - $9.99
2,500 积分 - $22.99
5,000 积分 - $39.99
10,000 积分- $69.99
```

## 📋 完整配置清单

### **必须配置的 Vercel 环境变量（共 8 个）**

访问 [https://vercel.com/dashboard](https://vercel.com/dashboard) → 项目 `soulmate9-ai01` → Settings → Environment Variables

| Variable Name | Value | Environments |
|---------------|-------|--------------|
| `NOWPAYMENTS_API_KEY` | `162736a2-82ea-4a6b-85b5-18b0f72cd132` | Production<br>Preview<br>Development |
| `NOWPAYMENTS_IPN_SECRET` | `GFCGj/3nMWA7wRuW0FRcFfC6/1KfEtPU` | Production<br>Preview<br>Development |
| `NOWPAYMENTS_PAY_CURRENCY` | `usdttrc20` | Production<br>Preview<br>Development |
| `CRYPTO_TOKENS_500_PRICE` | `599` | Production<br>Preview<br>Development |
| `CRYPTO_TOKENS_1000_PRICE` | `999` | Production<br>Preview<br>Development |
| `CRYPTO_TOKENS_2500_PRICE` | `2299` | Production<br>Preview<br>Development |
| `CRYPTO_TOKENS_5000_PRICE` | `3999` | Production<br>Preview<br>Development |
| `CRYPTO_TOKENS_10000_PRICE` | `6999` | Production<br>Preview<br>Development |

### **配置说明**

#### 会员订阅价格（月付）
- Pro: $9.99 (999 cents)
- Premium: $19.99 (1999 cents)
- Unlimited: $34.99 (3499 cents)

#### 代币包价格
- 500 credits: $5.99 (599 cents)
- 1,000 credits: $9.99 (999 cents) **推荐** ⭐
- 2,500 credits: $22.99 (2299 cents) **性价比最高** 💰
- 5,000 credits: $39.99 (3999 cents)
- 10,000 credits: $69.99 (6999 cents) **最优惠** 🎉

**价格计算规则：**
- 默认基准：1,000 credits = $9.99
- 大批量更优惠：10,000 credits 单价最低（$0.00699/credit）

## 🔧 实现逻辑

### 会员订阅路径
```javascript
// /api/crypto/initiate (planId, billing)
POST { planId: "pro", billing: "monthly" }
↓
getNowPaymentsPriceCents("pro", "monthly") // → 999 cents ($9.99)
↓
create NOWPayments payment with price_amount: 9.99
```

### 代币包路径  
```javascript
// /api/v2/shop/tokens (packageId, tokens)
POST { packageId: "credits-1000", quantity: 1000 }
↓
getTokenPackagePriceCents(1000) // → 999 cents ($9.99)
↓
create NOWPayments invoice/payment with price_amount: 9.99
```

### 优先级
1. **环境变量优先** → 检查 `process.env.CRYPTO_TOKENS_XXX_PRICE`
2. ** fallback 到硬编码** → 使用 `ratePerToken * tokenCount * 100`
3. **兜底价格** → 从 `FALLBACK_PACKAGES` 读取数据库或内置值

## ✅ 验证步骤

### 测试会员订阅
```bash
curl -X POST https://yourdomain.com/api/crypto/initiate \
  -H "Content-Type: application/json" \
  -d '{"planId":"pro","billing":"monthly"}'
```

预期响应：
```json
{
  "success": true,
  "paymentId": "...",
  "payAddress": "...",
  "network": "TRC-20",
  "currency": "USDT",
  "amountUsd": 9.99,
  "payAmount": 9.99,
  ...
}
```

### 测试代币包
```bash
curl -X POST https://yourdomain.com/api/v2/shop/tokens \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user-token>" \
  -d '{
    "packageId": "credits-1000",
    "quantity": 1000,
    "provider": "nowpayments"
  }'
```

预期响应：
```json
{
  "status": "checkout_created",
  "provider": "nowpayments",
  "url": "https://nowpayments.io/invoice/...",
  "package": {...},
  "token_count": 1000,
  ...
}
```

## ⚠️ 常见问题

### Q1: 为什么之前会报 500 错误？
A: `.env.prod.local` 中的 API Key 未被推送到 GitHub，Vercel 没有读取到真实配置。

### Q2: Token 价格不生效怎么办？
A: 
1. 确认环境变量在 Vercel Dashboard 中正确配置
2. 重新部署触发新环境变量的生效
3. 检查浏览器 Network 面板的 API 请求日志

### Q3: 如何修改价格？
A: 直接更新环境变量中的价格值（单位：cents），然后重新部署即可。

### Q4: Webhook IPN 如何处理？
A: `/api/nowpayments/ipn` 会自动回调处理：
1. 验证 HMAC-SHA512 签名
2. 更新 `crypto_payments` 表状态为 `confirmed`
3. 调用 `grantTopUpCredits()` 发放代币或升级会员

## 📊 监控建议

### 关键指标
- ✅ 支付成功率：目标 > 95%
- ✅ Webhook 延迟：目标 < 30 秒
- ✅ 订单完成率：支付→Webhook 完整链路

### 日志查看
```bash
# Vercel CLI Logs
vercel logs --prod

# 搜索关键词
grep -i nowpayments vercel.log
grep -i crypto_payment vercel.log
```

## 🔐 安全提醒

1. **API Key 管理**：不要在 GitHub 提交真实密钥
2. **IPN 签名验证**：生产环境必须启用 HMAC 校验
3. **幂等性保护**：Webhook 重复调用不会重复发放权益
4. **金额一致性**：确保前后端价格一致（建议服务器端统一计算）
