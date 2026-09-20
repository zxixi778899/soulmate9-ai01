# SoulMate AI — NEXA Pay 支付完整配置指南

## 🎯 概述

NEXA Pay 是专为 LATAM（拉丁美洲）市场设计的跨境支付网关，支持巴西即时支付 **Pix**、银行转账 **TED**、信用卡 **Boleto** 等多种支付方式。

**主要特性：**
- ✅ Pix（巴西即时支付，秒级到账）
- ✅ TED（巴西银行转账）
- ✅ 信用卡（LATAM 本地信用卡）
- ✅ Boleto（巴西付款券）
- 💰 货币转换：USD → BRL（自动）
- 🔐 HMAC-SHA256 webhook 签名验证

---

## 📋 第一步：注册 NexaPay 账户

1. **访问 NexaPay 官网**  
   https://www.nexapay.com

2. **创建商户账户**  
   - 填写企业/个人商户信息
   - 准备材料：身份证/护照、营业执照（如有）、银行账户信息
   - 选择支持的国家/地区

3. **获取 API 凭证**  
   登录后在 Dashboard 中找到：
   - **API Key** (Bearer token)
   - **API Secret** (用于 HMAC 签名)
   - **Merchant ID** (商户 ID)
   - **Webhook Secret** (webhook 签名密钥)

4. **配置 Webhook 端点**  
   NexaPay 会向你的服务器发送支付状态通知：
   ```
   POST https://your-domain.com/api/nexapay/webhook
   ```

---

## ⚙️ 第二步：配置环境变量

### 添加以下环境变量到 `.env.local` 或 Railway/Vercel 项目设置：

```bash
# ─── NEXA Pay (LATAM Payment Gateway) ──────────────────────────────
NEXAPAY_API_KEY=nxp_live_xxxxxxxxxxxxxxxxxxxxxx
NEXAPAY_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXAPAY_MERCHANT_ID=Mxxxxxxxxx
NEXAPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxx
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

**详细说明：**

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `NEXAPAY_API_KEY` | API 认证密钥（Bearer Token） | `nxp_live_xxx` |
| `NEXAPAY_API_SECRET` | API 机密密钥（HMAC 签名用） | `xxx` |
| `NEXAPAY_MERCHANT_ID` | 商户 ID（标识你的店铺） | `M123456789` |
| `NEXAPAY_WEBHOOK_SECRET` | Webhook 签名密钥（验证 webhook 来源） | `whsec_xxx` |
| `NEXAPAY_BASE_URL` | API 基础 URL（生产环境默认） | `https://api.nexapay.com/v1` |

⚠️ **安全提示：**
- Never commit `.env.local` to Git
- Use Railway/Vercel environment variables in production
- Rotate secrets periodically

---

## 🗄️ 第三步：数据库表结构确认

检查 `src/storage/database/shared/schema.ts` 中的 `crypto_payments` 表：

```typescript
export const cryptoPayments = pgTable(
  "crypto_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    user_id: varchar("user_id").notNull(),
    plan_id: varchar("plan_id"), // 'basic', 'pro', 'unlimited', or null for tokens
    amount_usd: decimal("amount_usd"), // USD 金额
    currency: varchar("currency"), // 'BRL' (NexaPay 返回的是 BRL)
    tx_hash: varchar("tx_hash"), // NexaPay payment_id
    wallet_address: varchar("wallet_address"),
    status: varchar("status", { 
      length: 32,
      enum: ['awaiting_payment', 'pending_verification', 'confirmed', 'failed', 'expired']
    }).notNull().default("awaiting_payment"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
    confirmed_at: timestamp("confirmed_at"),
    amount_received: decimal("amount_received"),
    admin_notes: text("admin_notes"),
  },
  (table) => ({
    user_idIdx: index().on(table.user_id),
    statusIdx: index().on(table.status),
  })
);
```

✅ **表已存在，无需额外迁移**

---

## 🔄 第四步：测试支付流程

### 4.1 本地开发测试

#### A. 启动开发服务器
```bash
pnpm dev
```

#### B. 创建测试用户
1. 访问 http://localhost:3000/register
2. 注册测试邮箱
3. 登录

#### C. 进入商城页面
1. 访问 http://localhost:3000/shop 或 http://localhost:3000/wallet
2. 选择订阅套餐（Basic/Pro/Unlimited）
3. 选择计费周期（Monthly/Quarterly/Yearly）
4. 点击 **"Pay with NEXA Pay"** 或 **"Pay with Pix/TED"**

#### D. 前端调用 `/api/nexapay`
请求示例：
```javascript
POST /api/nexapay
{
  "plan": "pro",
  "billing": "monthly",
  "payment_method": "pix"  // pix | ted | card_latam | boleto
}
```

**预期响应：**
```json
{
  "success": true,
  "paymentId": "nxp_userId_12345_pro_monthly_1234567890",
  "url": "https://checkout.nexapay.com/pay/xxx",
  "amountBrl": 199.9,
  "expiresAt": "2024-09-20T10:00:00Z"
}
```

#### E. 模拟 Webhook 回调（跳过 NexaPay 真实回调）

使用 `curl` 或 Postman 手动触发 webhook：

```bash
curl -X POST http://localhost:3000/api/nexapay/webhook \
  -H "Content-Type: application/json" \
  -H "X-NexaPay-Signature: $(echo -n '{"payment_id":"test123","status":"completed","order_id":"nxp_test_user_pro_monthly_123"}' | openssl dgst -sha256 -hmac "YOUR_WEBHOOK_SECRET" --macopt hexkey:true | awk '{print $2}')" \
  -d '{
    "payment_id": "test123",
    "status": "completed",
    "order_id": "nxp_test_user_pro_monthly_123456",
    "amount_usd": 19.99,
    "amount_brl": 99.9,
    "payment_method": "pix",
    "created_at": "2024-09-20T10:00:00Z",
    "completed_at": "2024-09-20T10:01:00Z"
  }'
```

**预期结果：**
- ✅ 用户 membership_tier 更新为 `pro`
- ✅ 生成一条 `subscriptions` 记录
- ✅ `crypto_payments` 状态变为 `confirmed`

---

### 4.2 使用 NexaPay Sandbox（推荐正式测试）

#### A. 切换至 Sandbox 模式

修改环境变量：
```bash
NEXAPAY_BASE_URL=https://sandbox-api.nexapay.com/v1
```

#### B. 创建测试数据

访问 NexaPay Sandbox Dashboard：
https://sandbox.nexapay.com

1. 使用测试商户账号
2. 创建测试订单
3. 使用测试 Pix 二维码扫描支付

#### C. 监听真实 Webhook

在 Railway/Vercel 上临时部署或使用 ngrok 暴露本地服务：

```bash
# 安装 ngrok
npm install -g ngrok

# 暴露本地开发服务器
ngrok http 3000
```

将 ngrok 生成的 HTTPS URL 配置到 NexaPay Webhook 设置：
```
https://abc123.ngrok.io/api/nexapay/webhook
```

---

## 🔧 第五步：关键 API 路由功能验证

### 5.1 创建支付 `POST /api/nexapay`

**文件位置：** `src/app/api/nexapay/route.ts`

**验证步骤：**
```bash
# 1. 获取用户 JWT cookie（登录状态）
# 2. 发起支付请求
curl -X POST http://localhost:3000/api/nexapay \
  -H "Cookie: jwt=YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan": "pro",
    "billing": "yearly",
    "payment_method": "pix"
  }'
```

**检查点：**
- ✅ 成功创建 NexaPay 订单
- ✅ `crypto_payments` 表插入新记录
- ✅ 返回支付 URL 或重定向地址

---

### 5.2 Webhook 处理 `POST /api/nexapay/webhook`

**文件位置：** `src/app/api/nexapay/webhook/route.ts`

**验证步骤：**
1. 在 NexaPay Dashboard 配置 Webhook URL
2. 创建真实测试订单并完成支付
3. 查看服务器日志：
```bash
# Railway 日志
railway logs

# Vercel 日志
vercel logs
```

**检查日志输出：**
```
[nexapay/webhook] Received { payment_id: "xxx", status: "completed", order_id: "nxp_..." }
[nexapay/webhook] Payment processed { payment_id: "xxx", userId: "xxx", plan: "pro" }
```

**检查数据库：**
```sql
-- 查看支付记录
SELECT * FROM crypto_payments WHERE tx_hash = 'test_payment_id';

-- 查看订阅记录
SELECT * FROM subscriptions WHERE stripe_subscription_id LIKE 'nexapay_%';

-- 查看用户会员等级
SELECT membership_tier FROM profiles WHERE email = 'test@example.com';
```

---

## 🧪 第六步：完整集成测试清单

### 测试用例矩阵：

| 场景 | 参数组合 | 预期结果 |
|------|----------|----------|
| **基本订阅** | `plan=pro, billing=monthly, method=pix` | 支付成功，membership 升级为 pro |
| **年度订阅** | `plan=unlimited, billing=yearly, method=ted` | 正确计算折扣价（70% off），激活 unlimited |
| **代币购买** | `package_id=5000, provider=nexapay` | 充值 5000 credits |
| **重复 Webhook** | 相同 payment_id 再次回调 | 幂等性检查，忽略重复请求 |
| **失败支付** | `status=failed` | 不更新 membership，标记为 failed |
| **过期支付** | `status=expired` | 不授予权益 |
| **非法签名** | 伪造 signature | 返回 401 Invalid signature |

---

## 🛠️ 常见问题排查

### Q1: "NEXAPAY_API_KEY is not configured"
**原因：** 环境变量未设置或未重启服务器  
**解决：** 检查环境变量并重启开发服务器

### Q2: "Invalid signature" in webhook
**原因：** 
- Webhook Secret 配置错误
- Body 编码问题（UTF-8 vs Base64）  
**解决：** 确保使用原始 body 字符串进行 HMAC 签名验证

### Q3: 支付成功但 membership 未升级
**原因：**
- Webhook 未收到或处理失败
- Database insert 被回滚  
**解决：** 查看日志 + 数据库事务状态

### Q4: Amount 换算不正确
**原因：** NexaPay 实时汇率波动  
**解决：** 以 NexaPay 返回的 `amount_brl`为准，`amount_usd` 仅用于记录

---

## 🚀 第七步：正式上线配置

### 7.1 更新 Production Environment Variables

在 Railway/Vercel 项目中添加：
```bash
NEXAPAY_API_KEY=nxp_live_your_production_key_here
NEXAPAY_API_SECRET=your_secret_here
NEXAPAY_MERCHANT_ID=M_your_merchant_id
NEXAPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

### 7.2 配置 Webhook URL

在 NexaPay Dashboard 设置：
```
Webhook URL: https://your-domain.com/api/nexapay/webhook
Events: payment.completed, payment.failed, payment.expired
Signature: Enable HMAC-SHA256
```

### 7.3 更新定价策略

编辑 `src/lib/nexapay-server.ts` 的 `getNexaPayPriceCents()`：
```typescript
const basePrices: Record<string, number> = {
  basic: 999,     // $9.99/month
  pro: 1999,      // $19.99/month
  unlimited: 2999,// $29.99/month
};
```

### 7.4 前端 UI 集成

在商城页面显示 NEXA Pay 选项：
```tsx
// src/app/(main)/shop/page.tsx
const confirmPayment = async (provider: 'nexapay') => {
  const result = await fetch('/api/nexapay', {
    method: 'POST',
    body: JSON.stringify({ plan, billing, payment_method }),
  });
  
  if (result.success) {
    window.location.href = result.url; // 跳转至 NexaPay 收银台
  }
};
```

---

## 📊 监控与日志

### 关键指标：

- ✅ 支付转化率（创建订单 → 完成支付）
- ✅ Webhook 成功率（成功处理 vs 失败重试）
- ✅ 平均支付时间（从创建到 confirmed）
- ✅ 各支付方式分布（Pix % TED % Card % Boleto）

### 日志追踪：

```typescript
logger.info('[nexapay] Create payment', { 
  orderId, 
  amount, 
  method,
  userId: user.id.slice(-8) 
});

logger.warn('[nexapay/webhook] Invalid signature', { orderId });
logger.error('[nexapay/webhook] Webhook processing failed', { err });
```

---

## 📞 技术支持

### NexaPay 官方支持
- 文档：https://docs.nexapay.com
- 邮箱：support@nexapay.com
- 技术支援：tech@nexapay.com

### 内部联系
- 支付系统负责人：[你的名字]
- Telegram/GitHub Issues：报告支付相关 bug

---

## ✅ 验收标准

上线前必须完成以下验证：

- [ ] 环境变量全部配置并通过 `.env.example` 核对
- [ ] 单元测试：`createNexaPayPayment` 函数可调用（即使 sandbox 未就绪）
- [ ] 端到端测试：从 UI 发起支付 → 跳转到 NexaPay → 完成支付 → Webhook 回调 → membership 激活
- [ ] 幂等性测试：重复 Webhook 不重复授权益
- [ ] 安全性测试：伪造 webhook signature 被拒绝
- [ ] 日志完整性：关键步骤有 traceable log
- [ ] 回滚预案：如 NexaPay 服务中断，可降级为 NOWPayments/手动支付

---

## 🔗 参考链接

- [NexaPay 官方文档](https://docs.nexapay.com)
- [现有代码实现](src/lib/nexapay-server.ts)
- [API Route](src/app/api/nexapay/route.ts)
- [Webhook Handler](src/app/api/nexapay/webhook/route.ts)
- [Crypto Payment Modal](src/components/crypto/CryptoPaymentModal.tsx)
- [Database Schema](src/storage/database/shared/schema.ts)

---

**最后更新：** 2024-09-20  
**版本：** v1.0  
**状态：** ✅ 实现完成，等待沙箱测试与生产上线
