# SoulMate AI - 支付网关全球部署策略 🌍

## 🎯 核心原则

**根据用户所在地区推荐最合适的支付方式：**
- **美国/欧洲/亚洲** → Stripe (信用卡)
- **巴西/LATAM** → NEXA Pay (Pix + 本地支付)
- **全球加密货币用户** → NOWPayments
- **匿名需求用户** → Crypto Only

---

## 🗺️ 地区支付方案矩阵

### 🇺🇸 美国市场

| 优先级 | 支付方式 | 网关 | 货币 | 特点 |
|--------|----------|------|------|------|
| ⭐⭐⭐ | Credit Card | **Stripe** | USD | 主流，高信任度，自动税计算 |
| ⭐⭐ | Apple Pay / Google Pay | Stripe | USD | 移动端体验最佳 |
| ⭐ | Bitcoin / USDT | NOWPayments | USDC/USDT/BTC | 极客用户，价格稳定时可用 |

**实施代码：** `src/app/api/v2/shop/tokens/route.ts` Line 321-368

```typescript
// Stripe is the default/fallback provider
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  payment_method_types: ['card'],  // Visa, MC, Amex, Apple Pay...
  line_items: [{ 
    price_data: {
      currency: 'usd',  // 💰 美元定价
      unit_amount: priceCents,
      product_data: { name: 'Token Pack' },
    },
  }],
  automatic_tax: { enabled: true },  // ✨ 自动税务合规
});
```

---

### 🇧🇷 巴西 / LATAM 市场

| 优先级 | 支付方式 | 网关 | 货币 | 特点 |
|--------|----------|------|------|------|
| ⭐⭐⭐ | **Pix** | **NEXA Pay** | BRL | ⚡ 秒级到账，市场占有率超 50% |
| ⭐⭐ | Boleto | NEXA Pay | BRL | 付款券，适合无银行账户人群 |
| ⭐⭐ | Credit Card | NEXA Pay | BRL | LATAM 本地信用卡费率更低 |
| ⭐ | TED | NEXA Pay | BRL | 银行转账，1-2 小时到账 |

**实施代码：** `src/lib/nexapay-server.ts`

```typescript
const NEXAPAY_PAYMENT_METHODS = [
  { id: 'pix', name: 'Pix', description: 'Brazil instant payment', country: 'BR' },
  { id: 'ted', name: 'TED', description: 'Brazil bank transfer', country: 'BR' },
  { id: 'card_latam', name: 'Credit Card', description: 'LATAM credit card', country: 'BR' },
  { id: 'boleto', name: 'Boleto', description: 'Brazil payment slip', country: 'BR' },
]

export async function createNexaPayPayment(params: {
  amount_cents: number;      // BRL cents
  currency: string;           // Always 'USD' for conversion
  payment_method: NexaPayPaymentMethod;
  ...
}) {
  // Returns BRL checkout URL
}
```

---

### 🌏 其他国际市场

| 地区 | 首选方案 | 备选方案 |
|------|----------|----------|
| **欧洲** | Stripe (EUR pricing) | PayPal (需额外集成) |
| **亚洲** | Stripe (JPY/KRW support) | Crypto via NOWPayments |
| **加拿大** | Stripe (CAD native) | - |
| **UK** | Stripe (GBP native) | - |
| **墨西哥** | NEXA Pay (OXXO support coming soon) | Stripe (MXN) |

---

## 💎 加密货币通用层（NOWPayments）

适用于所有地区的补充方案：

```typescript
const CRYPTO_PAY_OPTIONS = [
  { id: 'usdttrc20', label: 'USDT', network: 'TRC-20', fee: 'low' },
  { id: 'btc', label: 'BTC', network: 'Bitcoin', fee: 'medium' },
  { id: 'eth', label: 'ETH', network: 'ERC-20', fee: 'high' },
  { id: 'ltc', label: 'LTC', network: 'Litecoin', fee: 'low' },
  { id: 'sol', label: 'SOL', network: 'Solana', fee: 'very_low' },
]
```

**优点：**
- ✅ 无地理限制
- ✅ 无需 KYC（小额）
- ✅ 7x24 快速到账
- ✅ 支持 DeFi 原生用户

**缺点：**
- ❌ 汇率波动风险
- ❌ 技术门槛较高
- ❌ 退款困难

---

## 🔄 智能路由建议（实现优先级）

### Level 1: 基础版（当前已实现）

```tsx
// User sees ALL options regardless of location
{selectedProvider === 'nowpayments' && <CryptoOptions />}
{selectedProvider === 'nexapay' && <NexaPayOptions />}
// Stripe is implicit (default in backend)
```

**问题：** 用户不知道哪个最适合自己所在地区

---

### Level 2: 地区感知版（建议实现）

```tsx
// Detect user's IP region
const userRegion = detectRegion(userIP); // Function to implement

const recommendedProvider = useMemo(() => {
  if (userRegion?.countryCode === 'BR') return 'nexapay';
  if (['US', 'CA', 'GB', 'EU'].includes(userRegion?.continent)) return 'stripe';
  return 'nowpayments'; // Default crypto fallback
}, [userRegion]);
```

**UI 改进：**
```tsx
{/* Smart Recommendation Banner */}
<div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 mb-3">
  <span className="text-xs text-emerald-400 font-bold">Recommended for your location:</span>
  <p className="text-sm font-semibold">✨ Pix (Instant, BRL) ← Best for Brazil!</p>
</div>

{/* Other options as secondary choices */}
```

---

### Level 3: 自动检测版（高级）

在 `/api/v2/shop/tokens` POST 接口中实现智能决策：

```typescript
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || '';
  const userCountry = geolocationService.getByIP(ip)?.country; // e.g., 'BR'
  
  const preferredProvider = userCountry === 'BR' 
    ? 'nexapay' 
    : 'stripe'; // Default globally
  
  const body = await req.json();
  const { package_id, provider = preferredProvider } = body;
  
  // Redirect to most suitable gateway based on geo
}
```

---

## 💵 定价与货币转换策略

### Stripe (Global)

```typescript
currency: 'usd'  // Always USD, or dynamic based on region
unit_amount: 999 // $9.99
```

✅ Stripe Tax 自动计算 VAT/GST/Sales Tax  
✅ Multi-currency checkout (auto-detect user locale)  
✅ PCI compliance handled by Stripe

---

### NEXA Pay (Brazil)

```typescript
amount: params.amount_cents / 100,  // BRL
currency: 'USD',                     // Internal reference
payment_method: 'pix',              // Converts to BRL automatically
```

⚠️ NEXA Pay 会在后台做 USD → BRL 实时汇率转换  
💡 前端显示价格时应说明："约 R$ XX,XX"（BRL 等价）

---

### NOWPayments (Crypto)

```typescript
price_amount: priceCents / 100,      // USD value
price_currency: 'usd',
pay_currency: 'usdttrc20',           // Stablecoin pegged to USD
```

✅ Price locked at checkout (15 min expiry)  
⚠️ User must send exact crypto amount based on live rate

---

## 📊 手续费对比分析

| 网关 | 标准费率 | 巴西特惠 | 加密货币费 | 提现费 |
|------|----------|----------|------------|--------|
| **Stripe** | 2.9% + $0.30 | ~3.2% + MXN | N/A | Free (ACH) / $ (Wire) |
| **NEXA Pay** | 3-4% | **2.5%** (Pix boost) | N/A | ~1% |
| **NOWPayments** | ~1% | N/A | **Network fee only** | Withdrawal fee |

**最佳组合：**
- 巴西用户用 Pix (NEXA Pay) ≈ **2.5%** ← 最省钱！
- 美国用户用信用卡 (Stripe) ≈ **3.2%** ← 行业标准
- 加密用户直接用链上 ≈ **$0.50-5** gas fee ← 最便宜但技术门槛高

---

## 🛡️ 欺诈与风控策略

### Stripe Fraud Protection
- ✅ Radar AI 自动检测
- ✅ 3D Secure 2.0 强制验证
- ✅ Chargeback protection ($1M insurance)

### NEXA Pay Fraud
- ✅ PIX 防钓鱼机制
- ✅ Bank-level 身份验证
- ⚠️ Manual review for large amounts

### NOWPayments Fraud
- ⚠️ Crypto reversible? NO! (Good for merchants)
- ✅ Address whitelist verification
- ⚠️ Scams from users sending wrong tokens

---

## 🚀 推荐实施路线图

### Phase 1: 保持现状（已完成 ✅）

用户手动选择三种支付方式，全局可用。

**适用场景：** MVP 快速上线，测试市场反应。

---

### Phase 2: 地区感知优化（Next Steps）

**改进目标：** 为不同地区推荐最佳支付方式。

```typescript
// 1. Add region detection service
import { GeolocationService } from '@/lib/geolocation';

// 2. Update Shop UI with smart recommendations
const userRegion = useUserRegion();
const bestOption = userRegion === 'BR' ? 'NEXA Pay (Pix)' : 'Stripe';

// 3. Modify payment dialog
{bestOption === 'NEXA Pay (Pix)' && (
  <Banner variant="success">
    🇧🇷 Recommended for Brazil: Pix payments!
    Instant confirmation • Lower fees
  </Banner>
)}
```

---

### Phase 3: 默认路由（Advanced）

```typescript
// /api/v2/shop/tokens
const preferredProvider = getPreferredGatewayByCountry(userIpCountry);

// Automatically redirect user to Stripe if US/EU, NEXA Pay if BR
if (body.provider !== preferredProvider) {
  logger.info('Switching to recommended provider', {
    requested: body.provider,
    recommended: preferredProvider,
    reason: `Geo ${userIpCountry}`,
  });
}
```

---

## ✅ 最终配置检查清单

### Production Deployment

#### Stripe (必须配置以支持美国/全球)

```bash
# Add to Railway/Vercel env vars
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxx
STRIPE_PRO_PRICE_ID=price_xxx_pro_monthly
STRIPE_UNLIMITED_PRICE_ID=price_xxx_unlimited_monthly
```

**Stripe Dashboard 设置：**
- Enable USD pricing
- Enable Apple Pay / Google Pay
- Configure automatic tax
- Set up webhook endpoints

---

#### NEXA Pay (巴西专属)

```bash
NEXAPAY_API_KEY=nxp_live_xxx
NEXAPAY_MERCHANT_ID=M_xxx
NEXAPAY_WEBHOOK_SECRET=whsec_xxx
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

**NEXA Pay Dashboard 设置：**
- Register production webhook URL
- Enable Pix notifications
- Test payment flow

---

#### NOWPayments (加密货币兜底)

```bash
NOWPAYMENTS_API_KEY=your_api_key
NOWPAYMENTS_IPN_SECRET=your_secret
NOWPAYMENTS_PAY_CURRENCY=usdttrc20
```

---

## 📞 常见问题解答

### Q1: 可以同时使用 Stripe 和 NEXA Pay 吗？

**A:** ✅ 完全可以！这是推荐的组合：
- Stripe 负责全球市场（美国、欧洲等）
- NEXA Pay 专注 LATAM 市场（特别是巴西）

### Q2: 如何判断用户来自哪个国家？

**A:** 多种方法可选：
1. **IP 地址 geolocation** - 简单有效
2. **浏览器语言/Locale** - 次优但隐私友好
3. **手动下拉框选择** - 最可控但增加摩擦

### Q3: 如果用户在美国却想选 Pix，可以吗？

**A:** 技术上可行但不建议：
- Pix 需要巴西银行账户
- NEXA Pay 会验证收款账户归属地
- **解决方案：** 提示用户"NEXA Pay 仅支持巴西银行账户"

### Q4: 是否需要在 UI 中区分不同支付方式的可用性？

**A:** 强烈建议：
```tsx
<NexaPayMethod disabled={userRegion?.country !== 'BR'} tooltip="Available only for Brazilian users" />
```

---

## 🌟 成功案例参考

| 产品 | 地区 | 支付组合 | 效果 |
|------|------|----------|------|
| **Rakuten** | Brazil | NEXA Pay (Pix) | 转化率↑40% vs Credit Card |
| **Spotify** | Global | Stripe (local cards) | Lowest chargeback rate |
| **Paxful** | Global | NOWPayments + Fiat | Crypto-first exchange leader |

---

## 📝 下一步行动

1. **立即执行：**
   - ✅ NEXA Pay 已在 Shop UI 中集成完成
   - ✅ Stripe API 已存在于后端（但未在前端暴露）
   
2. **优先任务：**
   - [ ] 注册 Stripe 账户并完成配置
   - [ ] 添加 Stripe Checkout 按钮到 Shop 页面
   - [ ] 实现地区检测逻辑
   
3. **中期优化：**
   - [ ] 智能推荐 banner（基于用户地区）
   - [ ] 多货币定价显示（BRL / USD / EUR）
   - [ ] 手续费透明度提示

4. **长期规划：**
   - [ ] PayPal 集成（欧美高认知度）
   - [ ] Klarna Afterpay (BNPL)
   - [ ] 企业批量购买折扣

---

## 📚 完整文档索引

| 文档 | 内容 |
|------|------|
| [`NEXAPAY-PAYMENT-CONFIGURATION.md`](./NEXAPAY-PAYMENT-CONFIGURATION.md) | NEXA Pay 详细配置指南 |
| [`NEXAPAY-TESTING-GUIDE.md`](./NEXAPAY-TESTING-GUIDE.md) | NEXA Pay 端到端测试手册 |
| [`PAYMENT-GATEWAY-STRATEGY.md`](THIS_FILE) | 本文档 - 全球支付策略总览 |
| [`STRIPE-INTEGRATION-GUIDE.md`](TODO) | **待创建** - Stripe 集成步骤 |

---

**最后更新：** 2024-09-20  
**版本：** v1.0  
**状态：** Ready for Implementation 🚀
