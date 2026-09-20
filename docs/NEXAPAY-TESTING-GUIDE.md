# NEXA Pay 支付 - 完整测试指南

## 📋 目录
1. [环境配置](#1-环境配置)
2. [前端集成验证](#2-前端集成验证)
3. [API 测试](#3-api-测试)
4. [Webhook 测试](#4-webhook-测试)
5. [端到端测试](#5-端到端测试)
6. [常见问题排查](#6-常见问题排查)

---

## 1. 环境配置

### 1.1 注册 NexaPay 账户

**步骤：**
1. 访问 https://www.nexapay.com
2. 点击 "Sign Up" 或 "Register"
3. 填写商户信息（国家/地区选 Brazil）
4. 准备材料：
   - 身份证/护照
   - Business info (如有)
   - Bank account details

**获取 API 凭证：**
登录 Dashboard → Settings/API → 复制以下密钥：
- `NEXAPAY_API_KEY` (Bearer token, 如 `nxp_live_xxx`)
- `NEXAPAY_API_SECRET` (用于 HMAC 签名)
- `NEXAPAY_MERCHANT_ID` (商户 ID, 如 `M123456789`)
- `NEXAPAY_WEBHOOK_SECRET` (webhook 签名密钥，如 `whsec_xxx`)

### 1.2 配置环境变量

在项目根目录创建 `.env.local` 文件（开发）或在 Railway/Vercel 项目设置中添加：

```bash
# ─── NEXA Pay (LATAM Payment Gateway) ──────────────────────────────
NEXAPAY_API_KEY=nxp_live_your_api_key_here
NEXAPAY_API_SECRET=your_secret_here
NEXAPAY_MERCHANT_ID=M_your_merchant_id_here
NEXAPAY_WEBHOOK_SECRET=whsec_your_webhook_secret_here
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

⚠️ **安全提示：**
- Never commit `.env.local` to Git
- Use Railway/Vercel environment variables in production
- Rotate secrets periodically

### 1.3 验证变量加载

运行以下命令检查环境变量是否加载成功：

```bash
# Development
pnpm dev

# Check console logs
echo "Environment check: $NEXAPAY_API_KEY" # Should show your key
```

或者在浏览器打开 http://localhost:3000/admin/debug 查看环境配置（如果启用）。

---

## 2. 前端集成验证

### 2.1 UI 组件已集成位置

✅ **Shop Page**: `/shop` → Credits Tab

用户购买代币的流程：
1. 进入 Shop 页面 → 点击 "TOP UP" 标签
2. 选择任意代币套餐（如 1000 credits）
3. 点击套餐卡片 → 弹出支付对话框
4. **关键改进**：现在会显示 **Payment Provider Selection**：
   - **NOWPayments** (Cryptocurrency)
   - **NEXA Pay** (LATAM fiat payment)

### 2.2 测试步骤

#### A. 启动应用并导航至商城

```bash
# Start development server
pnpm dev

# Open browser
http://localhost:3000/shop?tab=credits
```

#### B. 测试 NEXA Pay 支付流程

1. **选择代币套餐**  
   点击任意 credit pack（如 "Popular - 1000 credits"）

2. **选择支付提供商**  
   在弹出的对话框中：
   ```
   ├── NOWPayments (默认)
   │   └── USDT, BTC, ETH, LTC...
   └── NEXA Pay ← 点击这里
   ```

3. **选择支付方式**  
   NEXA Pay 支持：
   - ✨ **Pix** - 巴西即时支付（推荐，秒级到账）
   - 🏦 **TED** - 巴西银行转账（1-2h）
   - 💳 **Credit Card** - LATAM 信用卡
   - 📄 **Boleto** - 巴西付款券（1-3 天）

4. **完成支付**  
   选择后会自动跳转到 NexaPay Checkout URL

### 2.3 预期结果

| 步骤 | 预期显示 | 错误信号 |
|------|----------|----------|
| 点击套餐 | 弹窗出现，显示金额 | ❌ 弹窗未出现 |
| Provider 选择 | 显示 NOWPayments / NEXA Pay 两个选项 | ❌ 只有 Crypto 选项 |
| 选择 NEXA Pay | 显示 Pix/TED/Card/Boleto 四种方式 | ❌ 支付方法列表为空 |
| 选择支付方式 | 自动跳转至 nexapay.com/checkout | ❌ 控制台报错 |

---

## 3. API 测试

### 3.1 创建支付请求

使用 curl 或 Postman 直接测试 API：

#### 测试数据准备
```bash
# Get JWT token from browser (login first)
Cookie: jwt=<your_jwt_token_from_browser>

# Test payload
PAYLOAD='{
  "package_id": "credits-1000",
  "provider": "nexapay",
  "payment_method": "pix"
}'
```

#### 发送 POST 请求

```bash
curl -X POST http://localhost:3000/api/v2/shop/tokens \
  -H "Content-Type: application/json" \
  -H "Cookie: jwt=YOUR_JWT_TOKEN_HERE" \
  -d "$PAYLOAD"
```

#### 预期响应示例

```json
{
  "status": "checkout_created",
  "provider": "nexapay",
  "url": "https://checkout.nexapay.com/pay/xxxxx",
  "amountBrl": 49.90,
  "package": {
    "id": "credits-1000",
    "name": "Popular",
    "token_count": 1000,
    "price_cents": 999
  },
  "token_count": 1000
}
```

### 3.2 验证数据库记录

支付创建后，检查 `crypto_payments` 表：

```sql
-- Check pending payment
SELECT * FROM crypto_payments 
WHERE user_id = 'YOUR_USER_ID' 
ORDER BY created_at DESC 
LIMIT 1;
```

**预期字段：**
| 字段 | 值类型 | 示例 |
|------|--------|------|
| tx_hash | string | `nxp_user_xxx_123456` |
| amount_usd | decimal | `9.99` |
| currency | string | `'BRL'` |
| status | enum | `'awaiting_payment'` |
| metadata | JSONB | `{'provider': 'nexapay'}` |

---

## 4. Webhook 测试

### 4.1 本地测试（Ngrok 隧道）

由于 Webhook 需要 HTTPS 端点，使用 ngrok：

```bash
# Install ngrok globally
npm install -g ngrok

# Tunnel localhost:3000
ngrok http 3000

# Output shows URL like:
# Forwarding: https://abc123.ngrok.io -> http://localhost:3000
```

### 4.2 配置 Webhook 回调

在 NexaPay Dashboard：
```
Settings → Webhooks → Add Endpoint
URL: https://abc123.ngrok.io/api/nexapay/webhook
Events: payment.completed, payment.failed, payment.expired
Signature: Enable HMAC-SHA256
```

### 4.3 模拟 Webhook 回调

使用 curl 手动触发 webhook：

```bash
PAYLOAD='{
  "payment_id": "test_np_xxxx",
  "status": "completed",
  "order_id": "nxp_test_user_pro_monthly_1234567890",
  "amount_usd": 19.99,
  "amount_brl": 99.90,
  "payment_method": "pix",
  "created_at": "2024-09-20T10:00:00Z",
  "completed_at": "2024-09-20T10:01:00Z"
}'

# Generate HMAC signature
SECRET="your_webhook_secret"
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" --macopt hexkey:true | awk '{print $2}')

curl -X POST https://abc123.ngrok.io/api/nexapay/webhook \
  -H "Content-Type: application/json" \
  -H "X-NexaPay-Signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

#### 预期响应

```json
{
  "success": true
}
```

### 4.4 日志监控

```bash
# Railway logs (production)
railway logs

# Local logs (console)
# Watch for:
# [nexapay/webhook] Received { payment_id: "xxx", status: "completed" }
# [nexapay/webhook] Payment processed { userId: "xxx", plan: "pro" }
```

---

## 5. 端到端测试

### 5.1 完整支付流程（真实场景）

#### Step 1: 用户侧操作
1. 访问 https://your-domain.com/shop
2. 注册/登录账号
3. 进入 Credits 页面
4. 选择 1000 credits
5. 选择 **NEXA Pay** → **Pix**
6. 扫描二维码或用 Pix APP 支付

#### Step 2: 后端处理
NexaPay 自动发送 webhook 到你的服务器：
```
POST /api/nexapay/webhook
Body: {"payment_id": "np_xxx", "status": "completed", ...}
Headers: {"X-NexaPay-Signature": "hmac_sha256_sig"}
```

#### Step 3: 系统响应
1. ✅ Webhook 签名验证通过
2. ✅ 幂等性检查（避免重复处理）
3. ✅ Update `crypto_payments` table: `status='confirmed'`
4. ✅ Grant tokens: Insert into `credit_tokens` table
5. ✅ Update profile: `profiles.credits_remaining += 1000`
6. ✅ Log event: Record in `purchase_history`

#### Step 4: 用户验证
刷新页面后应看到：
- 💎 Token balance: 1000 (新增)
- ✅ Toast notification: "Payment verified! 1000 credits added."

### 5.2 测试矩阵

| 场景 | 参数组合 | 预期结果 | 优先级 |
|------|----------|----------|--------|
| **基本 Pix 支付** | `provider=nexapay, method=pix, pkg=1000` | Tokens granted instantly | 🔴 Must |
| **Ted 支付延迟** | `provider=nexapay, method=ted` | Pending until bank confirmation | ⚙️ Low |
| **Card 失败重试** | `method=card_latam, failed=true` | Status=failed, no tokens | ⚙️ Medium |
| **幂等性** | Same `payment_id` twice | Ignore duplicate webhook | 🔒 Critical |
| **非法签名** | Forged signature | Return 401 error | 🔒 Critical |
| **Invalid order_id** | Malformed order format | Reject with error | 🔒 Critical |

---

## 6. 常见问题排查

### Q1: `NEXAPAY_API_KEY is not configured`

**原因：** 环境变量未正确加载  
**解决：**
```bash
# Check if env file exists
ls -la .env.local

# Restart dev server after adding vars
pnpm dev

# Verify in code (add temporary debug log):
console.log("NEXA Pay enabled:", !!process.env.NEXAPAY_API_KEY);
```

### Q2: `Invalid signature` in webhook

**原因：** 
- Webhook Secret 不匹配
- Body 编码问题（UTF-8 vs Base64）

**调试步骤：**
1. 检查 `.env.local` 中的 `NEXAPAY_WEBHOOK_SECRET`
2. 确保 NexaPay Dashboard 配置的 secret 一致
3. 验证 body 为原始 JSON 字符串（非 Base64）

### Q3: 支付成功但 tokens 未增加

**可能原因：**
1. Webhook 未到达服务器
2. Database insert 被回滚
3. User ID 解析错误

**排查：**
```bash
# 1. 查看 webhook 日志
tail -f railway.log | grep "nexapay/webhook"

# 2. 手动查询数据库
SELECT status FROM crypto_payments WHERE tx_hash = 'np_xxx';
SELECT credits_remaining FROM profiles WHERE email = 'user@example.com';

# 3. 重发 webhook
curl -X POST <webhook_url> -d "<same_payload>"
```

### Q4: Amount BRL 换算不正确

**说明：** NexaPay 实时汇率转换，以 `amount_brl` 为准，`amount_usd` 仅用于记录。

**建议：** 
- 前端显示 USD 价格时保留±5% 误差容限
- 记录 `amount_brl` 与 `amount_usd` 比率用于审计

---

## 附录 A: 完整 API Schema

### Create Payment
```typescript
// POST /api/v2/shop/tokens
Request:
{
  package_id: string;        // 代币包 ID
  provider: 'nexapay';       // 必须为 'nexapay'
  payment_method: 'pix'|'ted'|'card_latam'|'boleto';
}

Response:
{
  status: 'checkout_created';
  provider: 'nexapay';
  url: string;               // 跳转 URL
  amountBrl: number;         // BRL 金额
  package: { ... };          // 代币包详情
  token_count: number;       // 总代币数
}
```

### Webhook Payload
```typescript
// POST /api/nexapay/webhook
{
  payment_id: string;        // NexaPay 支付 ID
  status: 'pending'|'completed'|'failed'|'expired';
  order_id: string;          // nxp_{userId}_{plan/pack}_{ts}
  amount_usd: number;        // USD 等价
  amount_brl: number;        // BRL 实际金额
  payment_method: string;
  created_at: ISO8601;
  completed_at?: ISO8601;
}
```

---

## 附录 B: 相关文件索引

| 文件路径 | 功能描述 |
|----------|----------|
| [`src/lib/nexapay-server.ts`](src/lib/nexapay-server.ts) | NEXA Pay API 客户端 |
| [`src/app/api/nexapay/route.ts`](src/app/api/nexapay/route.ts) | 创建支付 API |
| [`src/app/api/nexapay/webhook/route.ts`](src/app/api/nexapay/webhook/route.ts) | Webhook 处理器 |
| [`src/app/api/v2/shop/tokens/route.ts`](src/app/api/v2/shop/tokens/route.ts) | 代币购买 API (集成 NEXA Pay) |
| [`src/app/(main)/shop/page.tsx`](src/app/(main)/shop/page.tsx) | Shop UI (已更新支持 NEXA Pay) |
| [`docs/NEXAPAY-PAYMENT-CONFIGURATION.md`](docs/NEXAPAY-PAYMENT-CONFIGURATION.md) | 配置指南 |

---

## ✅ 验收清单

上线前必须完成：

- [ ] NEXA Pay 账户已注册并激活
- [ ] 环境变量全部配置并通过 `.env.example` 核对
- [ ] API 测试通过（curl 创建支付成功）
- [ ] Webhook 可接收并正确验证签名
- [ ] 端到端测试：从 UI 到数据库全流程通顺
- [ ] 幂等性测试：重复 Webhook 不重复授权益
- [ ] 安全性测试：伪造 signature 被拒绝
- [ ] 日志完整性：关键步骤有 traceable log
- [ ] 降级预案：NEXA Pay 不可用时可切换 NOWPayments

---

**文档版本：** v1.0  
**最后更新：** 2024-09-20  
**维护者：** Your Name
