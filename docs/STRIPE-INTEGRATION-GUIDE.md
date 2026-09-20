# Stripe 集成 - 美国及全球市场收款指南 💳

## 🎯 概述

**Stripe** 是全球最流行的在线支付网关，完美适用于：
- ✅ **美国市场** (主要目标)
- ✅ 欧洲/英国/加拿大
- ✅ 澳大利亚/日本等其他发达国家
- ✅ **加密货币用户** (Stripe Crypto Payments)

---

## 🌍 地区支付方案总览

你的项目现已支持三种支付方式，智能分配给不同地区用户：

| 地区 | 推荐网关 | 货币 | 支付方式 |
|------|----------|------|----------|
| 🇺🇸 **美国** | **Stripe** ⭐ | USD | Credit Card, Apple Pay, Google Pay |
| 🇧🇷 **巴西/LATAM** | NEXA Pay 💰 | BRL | Pix, TED, Boleto |
| 🌐 **加密货币用户** | NOWPayments ₿ | USDT/BTC/ETH | All crypto currencies |

---

## ✅ 前端 UI 已完成（最新版）

Shop 页面的支付对话框现已更新为三选一布局：

```tsx
┌─────────────────────────────────┐
│  Select payment provider:       │
├─────────────────────────────────┤
│ ┌───────────────────────────┐   │
│ │ 💳 Stripe                  │   │
│ │ [Recommended for US/EU]    │   │
│ │ Credit Card • Apple Pay    │   │
│ │ [Icons: Visa/MC/Apple]     │   │
│ └───────────────────────────┘   │
│ ┌───────────────────────────┐   │
│ │ 🇧🇷 NEXA Pay                │   │
│ │ [Best for Brazil]          │   │
│ │ Pix (Instant) • Low Fee    │   │
│ └───────────────────────────┘   │
│ ┌───────────────────────────┐   │
│ │ ₿ NOWPayments              │   │
│ │ [Crypto Only]              │   │
│ │ Global • Anonymous         │   │
│ └───────────────────────────┘   │
└─────────────────────────────────┘
```

---

## 🚀 第一步：注册 Stripe 账户

### 1.1 访问官网

前往 https://stripe.com → **Sign Up**

### 1.2 填写信息

需要准备的材料：
- ✅ Email 地址
- ✅ 公司名称（可以是个人独资）
- ✅ 网站 URL (soulmateai.shop 或 landing page)
- ✅ 业务类型描述 ("AI companion app with subscription and digital credits")
- ✅ 月度预期收入（初期可填 $500-$1000）

### 1.3 验证身份

Stripe 需要验证：
- **营业执照/税务登记证** (Business registration)
- **法人身份证/护照** (ID verification)
- **银行账号** (用于 payouts)
- **联系方式** (电话/地址)

⏱️ **审核时间：** 通常 1-3 个工作日

---

## ⚙️ 第二步：配置环境变量

### 2.1 获取 API Keys

登录 Stripe Dashboard → Developers → API keys

复制以下密钥到 `.env.local` 或 Railway/Vercel 环境设置：

```bash
# ─── Stripe Payment Gateway ────────────────────────────────
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx
```

**生产环境部署步骤：**
1. Railway 项目 → Settings → Variables
2. Vercel 项目 → Settings → Environment variables
3. 添加上述 3 个变量（不提交到 Git！）

### 2.2 价格 ID 配置（可选但推荐）

在 Stripe Dashboard → Products → 创建产品后：

```bash
# Monthly Subscriptions
STRIPE_PRO_PRICE_ID=price_XXXXXXXXXX_monthly
STRIPE_UNLIMITED_PRICE_ID=price_XXXXXXXXXX_monthly

# One-time Token Purchases
STRIPE_TOKENS_100_PRICE_ID=price_XXXXXXX_tokens_100
STRIPE_TOKENS_500_PRICE_ID=price_XXXXXXX_tokens_500
STRIPE_TOKENS_1000_PRICE_ID=price_XXXXXXX_tokens_1000

# Yearly Plans (Optional - discounted)
STRIPE_PRO_YEARLY_PRICE_ID=price_XXXXXXXXXX_yearly
STRIPE_UNLIMITED_YEARLY_PRICE_ID=price_XXXXXXXXXX_yearly
```

✅ **为什么需要固定 Price ID？**
- 避免每月手动调整代码中的价格
- Webhook 可以准确识别用户购买的是哪个套餐
- 审计和财务记录清晰

---

## 📊 第三步：创建产品和价格

### 3.1 订阅套餐

访问 Stripe Dashboard → Products → Add Product

#### Pro Plan (示例)
```yaml
Product Name: SoulMate AI Pro
Description: Access to AI companion with higher message limits
Type: Service (subscription)
Recurring:
  - Interval: monthly
  - Amount: $19.99 USD (或当地货币 EUR/GBP/CAD)
```

#### Unlimited Plan
```yaml
Product Name: SoulMate AI Unlimited  
Description: Full access to all features without limits
Type: Service (subscription)
Recurring:
  - Interval: monthly
  - Amount: $29.99 USD
```

### 3.2 代币包

访问 Stripe Dashboard → Products → Add Product

#### Credits-500
```yaml
Product Name: Starter Credits
Description: 500 tokens for AI interactions
Type: Physical/Digital good
One-time payment: $5.99 USD
Metadata:
  token_count: 500
  package_id: credits-500
```

#### Credits-1000
```yaml
Product Name: Popular Credits
Description: 1000 tokens + bonus value
Type: Digital good
One-time payment: $9.99 USD
```

**完成后，Stripe 会生成 `price_xxx` 格式的 ID，将其填入上面的环境变量。**

---

## 🔗 第四步：Webhook 配置

### 4.1 启用 Webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint

**URL 格式:**
```
https://your-domain.com/api/stripe/webhook
```

**选择事件类型（必须包括）:**
- ✅ `checkout.session.completed` - 支付成功
- ✅ `customer.subscription.created` - 新订阅
- ✅ `customer.subscription.updated` - 订阅修改
- ✅ `customer.subscription.deleted` - 取消订阅
- ✅ `invoice.payment_succeeded` - 自动续费成功

### 4.2 本地测试 Webhook

使用 Stripe CLI:
```bash
# Install Stripe CLI
npm install -g stripe-cli

# Login
stripe login  # Generates auth token

# Forward webhooks locally
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

**输出:**
```
Forwarding webhook from https://your-stripe-webhook-url.ngrok.dev -> http://localhost:3000/api/stripe/webhook

Webhook signing secret: whsec_xxxxxxxxxxxx
```

将这个 secret 添加到环境变量：
```bash
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
```

---

## 🛠️ 第五步：后端实现检查

你的项目已经实现了 Stripe 的后端逻辑！

### 检查点 1：Token Purchase API (`src/app/api/v2/shop/tokens/route.ts`)

查看 Line 321-368:

```typescript
// ── Stripe (default / fallback) ─────────────────────────────────────────
const stripe = getStripe();
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'],  // Supports Apple Pay, Google Pay too
  line_items: [{ 
    price_data: {
      currency: 'usd',           // 💰 USD pricing
      unit_amount: priceCents,   // e.g., 999 = $9.99
      product_data: {
        name: `${tokenPackage.name} - ${totalTokens} tokens`,
        description: `${totalTokens} SoulMate tokens`,
      },
    },
    quantity: 1,
  }],
  customer_email: auth.user.email || undefined,
  success_url: `${origin}/shop?checkout=success&tokens=${totalTokens}`,
  cancel_url: `${origin}/shop?checkout=canceled`,
  automatic_tax: { enabled: true },  // ✨ Auto VAT/Sales Tax calculation
});
```

✅ **已实现的优点：**
- Automatic tax collection (VAT/GST/Sales Tax compliant)
- Customer email capture
- Custom success/cancel URLs
- Metadata tracking for order fulfillment

### 检查点 2：Webhook Handler

如果 `/api/stripe/webhook` 不存在，需要创建：

```typescript
// src/app/api/stripe/webhook/route.ts
import { buffer } from 'micro';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-09-30.acacia', // Use latest API version
});

export async function POST(req: Request) {
  const body = await buffer(req);
  const signature = req.headers.get('stripe-signature')!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    logger.error('Webhook signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  
  if (event.type === 'checkout.session.completed') {
    const userId = session.client_reference_id;
    const metadata = session.metadata as {
      type: 'tokens' | 'subscription',
      package_id: string,
      token_count: string,
      price_cents: string,
    };

    // Grant tokens or activate subscription
    if (metadata.type === 'tokens') {
      await grantCredits(supabase, userId, parseInt(metadata.token_count));
    } else if (metadata.type === 'subscription') {
      await activateSubscription(supabase, userId, metadata.package_id);
    }
  }

  return NextResponse.json({ received: true });
}
```

---

## 🎨 第六步：UI 配置（已完成 ✅）

Shop 页面支付对话框已更新，显示三个选项：

1. **Stripe** (蓝色主题) - 默认选中
2. **NEXA Pay** (绿色主题) - LATAM 专用
3. **NOWPayments** (金色主题) - Crypto only

代码位置：`src/app/(main)/shop/page.tsx` Line 874-1020

**无需改动** - 已经可以工作！

---

## 🧪 第七步：测试支付流程

### 7.1 沙箱测试模式

Stripe 提供测试卡号（非真实扣款）：

```javascript
// Test card numbers (use in Test Mode only!)
Card Number: 4242 4242 4242 4242  (Visa)
Expiration: 12/34
CVV: 123
Postal Code: 12345

// Other test cards
Gold: 5555 5555 5555 4444 (Mastercard)
Amex: 3782 822463 10005 (American Express)
```

### 7.2 完整测试场景

#### 场景 A: 代币购买
1. 登录 → Shop → TOP UP
2. 点击 "Popular - 1000 credits"
3. 选择 **Stripe** → **Continue with Stripe**
4. 浏览器跳转到 Stripe Checkout 页
5. 输入测试卡号：4242...
6. 点击 **Pay $9.99**
7. 返回 `/shop?checkout=success`
8. Token balance 应该更新为 1000

#### 场景 B: 订阅激活
1. Pricing Page → 选择 Pro Plan
2. 选择 Monthly ($19.99)
3. 输入测试卡号
4. 完成支付
5. Profile → 会员状态应升级为 **Pro**

---

## 📈 第八步：生产上线检查清单

### Production Deployment

- [ ] Stripe 账户已激活（从 Test Mode 切换到 Live Mode）
- [ ] 所有 API keys 已更换为 `sk_live_` / `pk_live_` 格式
- [ ] Webhook endpoint 已添加生产 URL
- [ ] Prices/Products 已在 Live Mode 创建
- [ ] .env.local 已更新为生产密钥
- [ ] Railway/Vercel 环境变量已部署
- [ ] 已进行一次真实小额支付测试（$1-2）

### Compliance & Legal

- [ ] Terms of Service 包含支付条款
- [ ] Privacy Policy 说明数据处理
- [ ] Refund Policy 明确退款规则
- [ ] VAT/Tax 合规（Stripe Tax 自动处理）
- [ ] PCI DSS 合规（Stripe 托管，无需担心）

---

## 🔧 常见问题排查

### Q1: "Your account is restricted to test mode"

**原因：** Stripe 账户未完全审核通过  
**解决：** 完成 KYC 验证（上传 ID+Business docs）

---

### Q2: Webhook 验证失败 "Invalid signature"

**可能原因：**
1. 环境变量 `STRIPE_WEBHOOK_SECRET` 错误
2. Body 编码问题（需用 `buffer()`）

**调试：**
```typescript
console.log('Webhook secret:', process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 8));
console.log('Request headers:', req.headers.get('stripe-signature'));
```

---

### Q3: 支付成功后 tokens 未增加

**排查步骤：**
1. 查看 Webhook logs (Railway/Vercel 日志)
2. 数据库查询：`SELECT * FROM purchase_history WHERE user_id='xxx'`
3. Check achievements trigger: `checkAchievements()` called?

---

### Q4: 信用卡被拒 "Your card was declined"

**常见原因：**
- Insufficient funds
- Card not enabled for international transactions
- Bank fraud protection triggered

**解决方案：**
- 用户使用其他卡重试
- Enable "Card Present" option for local cards

---

## 📊 手续费与结算

### Stripe Fee Structure (2024)

| Region | Standard Fee | International | Payout Time |
|--------|--------------|---------------|-------------|
| **USA** | 2.9% + $0.30 | +1% | Instant (1%) / Free (1-2 days) |
| **EU** | ~3.0% + €0.25 | +1.5% | Instant |
| **UK** | ~3.0% + £0.25 | +1% | Instant |

**对比 NEXA Pay:**
- Stripe USA: **2.9%** ← 行业标准
- NEXA Pay Brazil: **~2.5%** (Pix) ← 更便宜！

**最佳策略：**
- 美国用户用 Stripe (信任度高)
- 巴西用户用 NEXA Pay Pix (费率低 + 即时到账)

---

## 💡 高级功能扩展

### 1. 多货币动态定价

```typescript
// Detect user's country via IP
const region = detectUserRegion();
let priceCurrency = 'usd';
let amount = priceCents;

if (region.country === 'BR') {
  priceCurrency = 'brl';
  amount = usdToBrl(amount); // Approximate conversion
} else if (region.country === 'GB') {
  priceCurrency = 'gbp';
  amount = usdToGbp(amount);
}
```

### 2. Subscription Management Portal

Stripe 提供现成的 Customer Portal:
```typescript
const session = await stripe.billingPortal.sessions.create({
  customer: customer.stripe_customer_id,
  return_url: `${origin}/profile`,
  flow_data: {
    created_flow: {
      data: {
        subscription_update: {
          items: [{ id: sub.items.data[0].id, quantity: 1 }],
        },
      },
      type: 'subscription_update',
    },
  },
});
```

**效果：** 用户可以自己升级/降级/取消订阅，无需客服介入。

---

## 📞 官方资源

| 资源 | 链接 |
|------|------|
| Stripe Docs | https://stripe.com/docs |
| Stripe Dashboard | https://dashboard.stripe.com |
| Test Cards | https://stripe.com/docs/testing/cards |
| API Reference | https://stripe.com/docs/api |
| Webhook Guide | https://stripe.com/docs/webhooks |

---

## ✅ 最终验收清单

部署前必须确认：

- [ ] Stripe 账户完全激活（Test → Live）
- [ ] API keys 正确配置且生效
- [ ] Products + Prices 已在 Live Mode 创建
- [ ] Webhook 已成功接收并处理测试支付
- [ ] Tokens/Subscriptions 自动授予正常工作
- [ ] 用户端 UI 显示 Stripe 选项（已完成 ✅）
- [ ] 真实支付测试通过（建议先做 $1-2 小额测试）

---

## 🎉 总结

通过集成 Stripe，你现在可以：

✅ **接受来自全球（尤其是美国）的信用卡付款**  
✅ **支持 Apple Pay / Google Pay 移动端支付**  
✅ **自动计算 VAT/Sales Tax，税务合规无忧**  
✅ **低手续费（2.9% + $0.30），行业标准水平**  
✅ **高转化率（Stripe 品牌认知度强）**  

配合 NEXA Pay 和 NOWPayments，你已经拥有了一套**完整的全球化支付系统**！

**下一步行动：**
1. 注册 Stripe 账户（30 分钟）
2. 创建 Products & Prices（15 分钟）
3. 配置 API keys（5 分钟）
4. 部署到 Railway/Vercel（5 分钟）
5. 测试支付流程（10 分钟）
6. **开始收款！** 💰🇺🇸

祝你在全球市场大获成功！🚀
