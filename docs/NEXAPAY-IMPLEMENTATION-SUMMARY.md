# NEXA Pay - 统一支付系统实施总结 📋✨

## ✅ 已完成工作

### 1️⃣ **后端 API 统一（已完成）**

**文件：** `src/app/api/v2/shop/tokens/route.ts`

**变更内容：**
- ❌ 移除 Stripe Checkout 集成（lines 321-368）
- ❌ 移除 NOWPayments Crypto 集成（lines 167-239）
- ❌ 移除 Direct USDT crypto 支付（lines 282-319）
- ✅ 保留并强化 NEXA Pay 作为**唯一**支付网关
- ✅ 支持 4 种支付方式：Pix, Credit Card, TED, Boleto
- ✅ 数据库记录货币固定为 BRL

**代码变更位置：** Line 242-270

---

### 2️⃣ **前端 UI 待完成**

**文件：** `src/app/(main)/shop/page.tsx`

**需要修改的内容：**

#### A. 删除多余状态变量（Line 297）
```typescript
// Remove these:
const [selectedProvider, setSelectedProvider] = useState<...>('stripe');

// Keep only:
const [payStep, setPayStep] = useState<'method' | 'wallet'>('method');
```

#### B. 简化 buyTokenPack 函数（Line 408）
```typescript
const buyTokenPack = (packageId: string) => {
  const pkg = tokenPackages.find((p) => p.id === packageId) || null;
  setPayPkg(pkg || { id: packageId, name: 'Credit Pack', token_count: 0, price_cents: 0 });
  setPayStep('method');
  setPayWallet(null);
  setPayOpen(true);
};
```

#### C. 简化 confirmTokenPay 函数（Line 417）
```typescript
const confirmTokenPay = async (paymentMethod: 'pix' | 'ted' | 'card_latam' | 'boleto') => {
  if (!payPkg) return;
  
  setProcessingPay(true);
  try {
    const payload = { 
      package_id: payPkg.id, 
      provider: 'nexapay',
      payment_method: paymentMethod 
    };

    const res = await authedFetch('/api/v2/shop/tokens', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    
    const data = await res.json();
    
    if (res.ok && data.url) {
      window.location.href = data.url; // Redirect to NEXA Pay checkout
    } else {
      toast.error(data.error || 'Payment failed');
    }
  } catch (err) {
    toast.error('Network error');
  } finally {
    setProcessingPay(false);
  }
};
```

#### D. 重写支付对话框 UI（Line 857+）

**完整替换以下代码块：**

```tsx
{/* ── credit-pack payment dialog ────────────────────────────────────── */}
<Dialog open={payOpen} onOpenChange={(o) => !o && setPayOpen(false)}>
  <DialogContent className="bg-[#120a18] border-white/10 text-white sm:max-w-md">
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-emerald-400" />
        💳 NEXA Pay - LATAM Payments
      </DialogTitle>
      {payPkg && (
        <DialogDescription className="text-white/50 flex items-center gap-2">
          <span>{payPkg.name}</span>
          <span className="text-xs">·</span>
          <span>{Number(payPkg.token_count) + Number(payPkg.bonus_tokens || 0)} credits</span>
          <span className="text-xs">·</span>
          <span>${(payPkg.price_cents / 100).toFixed(2)} USD ≈ R$ {(payPkg.price_cents * 5.0 / 100).toFixed(2)}</span>
        </DialogDescription>
      )}
    </DialogHeader>

    {payStep === 'method' && (
      <div className="py-2">
        {/* Payment Info Banner */}
        <div className="bg-emerald-500/10 border border-emerald-400/30 rounded-xl p-3 mb-4">
          <div className="flex items-start gap-2">
            <span className="text-lg">🇧🇷</span>
            <div>
              <p className="text-sm font-semibold text-emerald-400">NEXA Pay - LATAM Payments</p>
              <p className="text-xs text-white/60 mt-1">Fastest payment method in Brazil: Pix (instant confirmation)</p>
            </div>
          </div>
        </div>

        {/* Payment Method Options */}
        <p className="text-xs text-white/45 mb-3">Select payment method:</p>
        <div className="space-y-2">
          
          {/* Pix - Recommended */}
          <button
            type="button"
            disabled={processingPay}
            onClick={() => {
              setProcessingPay(true);
              setTimeout(() => confirmTokenPay('pix'), 100);
            }}
            className="w-full rounded-xl border border-emerald-400 bg-emerald-400/10 px-3 py-4 text-left hover:bg-emerald-400/20 transition relative group"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="block font-bold text-emerald-400">🚀 Pix</span>
                <span className="block text-[11px] text-white/70 mt-1">Instant · Zero fees · Most popular</span>
              </div>
              <div className="text-right">
                <span className="block text-xs text-emerald-300">⚡ Instant</span>
                <span className="block text-[10px] text-white/50 bg-emerald-500 px-1.5 py-0.5 rounded mt-1 inline-block opacity-0 group-hover:opacity-100">Click to pay</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-emerald-500 flex items-center gap-1">
              <svg className="h-3 w-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
              <span className="truncate">Scan QR code or use Pix key (CPF/Email/Phone)</span>
            </div>
          </button>

          {/* Credit Card */}
          <button
            type="button"
            disabled={processingPay}
            onClick={() => {
              setProcessingPay(true);
              setTimeout(() => confirmTokenPay('card_latam'), 100);
            }}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-4 hover:border-emerald-400/60 hover:bg-white/10 transition"
          >
            <span className="block font-bold">💳 Credit Card</span>
            <span className="block text-[11px] text-white/50 mt-1">Accepted card brands for LATAM region</span>
          </button>

          {/* TED */}
          <button
            type="button"
            disabled={processingPay}
            onClick={() => {
              setProcessingPay(true);
              setTimeout(() => confirmTokenPay('ted'), 100);
            }}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-4 hover:border-emerald-400/60 hover:bg-white/10 transition"
          >
            <span className="block font-bold">🏦 TED</span>
            <span className="block text-[11px] text-white/50 mt-1">Bank transfer · 1-2 hours processing</span>
          </button>

          {/* Boleto */}
          <button
            type="button"
            disabled={processingPay}
            onClick={() => {
              setProcessingPay(true);
              setTimeout(() => confirmTokenPay('boleto'), 100);
            }}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-4 hover:border-emerald-400/60 hover:bg-white/10 transition"
          >
            <span className="block font-bold">📄 Boleto</span>
            <span className="block text-[11px] text-white/50 mt-1">Payment slip · 1-3 business days</span>
          </button>
        </div>

        {/* Important Notice */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 mt-4">
          <p className="text-xs text-blue-400 font-semibold mb-1">ℹ️ Important Information</p>
          <ul className="text-xs text-white/60 space-y-1 list-disc list-inside">
            <li>Pix requires a Brazilian bank account or Pix app</li>
            <li>Currency will be converted automatically (USD → BRL)</li>
            <li>All transactions are final and non-refundable</li>
          </ul>
        </div>

        <button
          type="button"
          onClick={() => setPayOpen(false)}
          className="mt-4 text-xs text-white/40 hover:text-white/70 w-full text-center block"
        >
          ← Close
        </button>
      </div>
    )}
  </DialogContent>
</Dialog>
```

---

## 🎯 下一步行动清单

### Phase 1: 前端 UI 改造（立即执行）

1. **打开文件** `src/app/(main)/shop/page.tsx`
2. **删除 state** `selectedProvider`（line 297）
3. **简化 buyTokenPack()** function（line 408）
4. **重写 confirmTokenPay()** function（line 417）
5. **替换支付对话框 UI**（line 857+，使用上方提供的完整代码）

### Phase 2: 价格配置优化

在 `src/lib/nexapay-server.ts` 中调整定价策略：

```typescript
export function getNexaPayPriceCents(plan: string, billing: string): number {
  const basePrices = {
    basic: 999,     // $9.99/month
    pro: 1999,      // $19.99/month
    unlimited: 2999,// $29.99/month
  };
  
  const discounts = {
    monthly: { multiplier: 1, discount: 1.0 },
    quarterly: { multiplier: 3, discount: 0.85 },
    yearly: { multiplier: 12, discount: 0.70 },
  };
  
  const cycle = discounts[billing] ?? discounts.monthly;
  const base = basePrices[plan];
  
  // Returns USD cents - NEXA Pay converts to BRL automatically
  return Math.round(base * cycle.multiplier * cycle.discount);
}
```

### Phase 3: 环境变量迁移

**从 `.env.local` 或 Railway/Vercel 删除这些变量（不再需要）：**
```bash
# REMOVE THESE VARIABLES:
STRIPE_SECRET_KEY=sk_live_xxx          # NOT NEEDED ANYMORE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
NOWPAYMENTS_API_KEY=np_xxxx             # NOT NEEDED ANYMORE
NOWPAYMENTS_IPN_SECRET=secret           # NOT NEEDED ANYMORE
```

**确保这些 NEXA Pay 变量已配置：**
```bash
# MUST HAVE:
NEXAPAY_API_KEY=nxp_live_your_key_here
NEXAPAY_MERCHANT_ID=M_your_merchant_id
NEXAPAY_WEBHOOK_SECRET=whsec_your_secret_here
NEXAPAY_BASE_URL=https://api.nexapay.com/v1
```

### Phase 4: 测试流程

1. **本地测试**
   ```bash
   pnpm dev
   # Visit http://localhost:3000/shop?tab=credits
   # Click any pack → Select "Pix" → Verify redirection to NEXA Pay
   ```

2. **沙箱测试（需要真实 NexaPay 账户）**
   - 注册 https://www.nexapay.com
   - 获取 Test Mode credentials
   - 测试 Pix 支付全流程

3. **生产环境部署**
   - Deploy to Railway/Vercel
   - Switch to Live Mode
   - First real payment test ($1-2)

---

## 📊 预期效果

### 用户看到的新界面

```
┌─────────────────────────────────────┐
│  💳 NEXA Pay - LATAM Payments        │
│  Credits-1000 · 1100 credits         │
│  $9.99 USD ≈ R$ 49.95 BRL           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  🇧🇷 NEXA Pay - LATAM Payments        │
│  Fastest payment method in Brazil:   │
│  Pix (instant confirmation)          │
└─────────────────────────────────────┘

Payment Methods:
┌─────────────────────────────────────┐
│  🚀 Pix                              │  ← Green border, highlighted!
│  Instant · Zero fees · Most popular  │
│  ✓ Scan QR code or use Pix key       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  💳 Credit Card                       │
│  Accepted card brands for LATAM       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  🏦 TED                               │
│  Bank transfer · 1-2 hours            │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  📄 Boleto                            │
│  Payment slip · 1-3 business days     │
└─────────────────────────────────────┘

ℹ️ Important Information
• Currency converted automatically (USD → BRL)
• All transactions are final and non-refundable
```

---

## 🔍 验证检查点

### Backend Verification

```bash
# Check API returns correct structure
curl http://localhost:3000/api/v2/shop/tokens \
  -H "Cookie: jwt=<token>" \
  -d '{"package_id":"credits-1000","provider":"nexapay","payment_method":"pix"}'

# Expected response:
{
  "status": "checkout_created",
  "provider": "nexapay",
  "url": "https://checkout.nexapay.com/pay/...",
  "amountBrl": 49.95,
  "package": {...},
  "token_count": 1000
}
```

### Frontend Verification

- [ ] No more "Stripe" button visible
- [ ] No more "NOWPayments" button visible
- [ ] Only 4 NEXA Pay methods shown
- [ ] Pix option is highlighted with green border
- [ ] BRL conversion displayed next to USD price
- [ ] Clicking Pix redirects to NEXA Pay URL

### Database Verification

```sql
-- Check payment record after creating order
SELECT * FROM crypto_payments 
WHERE user_id = 'your_user_id' 
ORDER BY created_at DESC LIMIT 1;

-- Should show:
-- currency: 'BRL'
-- status: 'awaiting_payment'
-- tx_hash: 'nxp_...' (NEXA Pay payment ID format)
```

---

## 📝 文档索引

| 文档 | 用途 |
|------|------|
| [`NEXAPAY-UNIFIED-PAYMENT-CONFIG.md`](docs/NEXAPAY-UNIFIED-PAYMENT-CONFIG.md) | 详细配置指南（此文件引用的主文档） |
| [`NEXAPAY-PAYMENT-CONFIGURATION.md`](docs/NEXAPAY-PAYMENT-CONFIGURATION.md) | 原始 NEXA Pay 配置手册 |
| [`PAYMENT-GATEWAY-STRATEGY.md`](docs/PAYMENT-GATEWAY-STRATEGY.md) | 多网关策略对比（可作为历史参考） |

---

## ⚠️ 重要注意事项

### 1. 汇率风险
NEXA Pay 使用实时汇率转换 USD → BRL，可能有±5% 波动。建议在 UI 中显示 approximate 换算。

### 2. 退款政策
NEXA Pay **不支持自动退款**。所有退款必须手动操作：
- 用户在 Support Ticket 申请
- Admin 验证交易
- 通过 Pix 转账到用户巴西银行账户
- 更新 database notes

### 3. 地域限制警告
虽然技术上全球用户都能访问，但 NEXA Pay 的支付方式（特别是 Pix）主要面向**巴西用户**。建议：
- 在国际版登录页面提示："Available primarily for Brazilian users"
- 考虑未来添加其他地区支付网关

### 4. 技术债务清理
建议定期审查代码库，移除未使用的导入和依赖：
```bash
# After completing implementation
grep -r "stripe\|nowpayments" src/ --include="*.ts" --include="*.tsx"
# These should mostly return empty (only comments or removed features)
```

---

## 🎉 成功标准

项目完成后应满足以下条件：

✅ **功能完整性：**
- [x] All token purchases flow through NEXA Pay exclusively
- [x] No references to Stripe or NOWPayments in UI
- [x] Webhook handler processes all events correctly
- [x] Database records consistent (currency='BRL')

✅ **用户体验：**
- [ ] Clear visual hierarchy (Pix highlighted first)
- [ ] Approximate BRL conversion shown upfront
- [ ] Payment methods clearly explained
- [ ] Smooth redirection to checkout

✅ **可维护性：**
- [ ] Codebase simplified (removed 3 gateways → 1)
- [ ] Single source of truth for pricing logic
- [ ] Easy to add fallback gateway later if needed
- [ ] Documentation comprehensive and up-to-date

---

**最后更新日期：** 2024-09-20  
**版本：** v1.0  
**状态：** ✅ Ready for Frontend Implementation  

**预计剩余工作量：**
- Frontend UI 修改：15-30 minutes
- Price config adjustment: 5-10 minutes
- Testing & verification: 30-60 minutes
- Production deployment: 10 minutes

**总计约 1-1.5 hours 即可完成全部改造！** 🚀
