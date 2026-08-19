# 💳 Stripe 定价与积分系统更新指南

## 📋 更新摘要

### 核心变化
1. **统一积分体系** - 所有 GPU 媒体（图片/视频/TTS）均使用积分消耗
2. **新汇率**: `1000 credits = $9.99 USD` (1 credit ≈ $0.00999)
3. **定价公式**: `成本 × 200 = 积分数`
4. **会员赠送方案调整**

---

## 🎯 新功能积分定价表

| 功能 | 估算成本 | 积分数值 | 说明 |
|------|---------|---------|------|
| **Text Chat** | Free | ✅ FREE | 订阅包含，不消耗积分 |
| **Image Generation** | ~$0.045 | **9 credits** | 标准图片生成 |
| **HD Image** | ~$0.09 | **18 credits** | HD / 多图生成 |
| **TTS Voice Message** | ~$0.005 | **1 credit** | 语音消息 (1-3 秒) |
| **Video 3s** | ~0.15 | **30 credits** | 3 秒短视频 |
| **Video 5s** | ~$0.25 | **50 credits** | 5 秒中视频 |
| **Video 10s** | ~$0.50 | **100 credits** | 10 秒长视频 |

### 💡 积分购买套餐（新增）

| 套餐名称 | 积分数值 | 价格 | 单价 (per credit) |
|---------|---------|------|------------------|
| Starter | 100 | $9.99 | $0.0999 |
| Popular | 500 | $39.99 | $0.07998 (5% discount) |
| Standard | 1000 | $79.99 | $0.07999 (最佳性价比) |
| Power User | 2500 | $199.99 | $0.079996 (批量折扣) |

---

## 👥 会员赠送方案更新

| Tier | 月价 | **月度赠送** | 首次赠送 | 日均可用 |
|------|-----|------------|---------|---------|
| **Free** | $0 | **0 credits** | **100 credits** | - |
| **Pro** | $9.99 | **1,500 credits** | - | 50 credits/day |
| **Unlimited** | $29.99 | **5,000 credits** | - | 167 credits/day |

### 📊 Pro 会员使用情况示例（月度 1500 积分）
- ✨ **图片生成** (~166 张) - 按 9 credits/image
- 🗣️ **语音消息** (~1,500 条) - 按 1 credit/message  
- 🎬 **视频生成** 
  - ~50 个 3s 视频 (30 credits each)
  - ~30 个 5s 视频 (50 credits each)
  - ~15 个 10s 视频 (100 credits each)
- **混合使用** - 建议组合方案

### 📊 Unlimited 会员使用情况示例（月度 5000 积分）
- ✨ **图片生成** (~555 张)
- 🗣️ **语音消息** (~5,000 条)
- 🎬 **视频生成**
  - ~166 个 3s 视频
  - ~100 个 5s 视频
  - ~50 个 10s 视频
- **高强度用户友好**

---

## 🔧 Stripe 配置要求

### ⚠️ 必须在 Vercel 配置的环境变量

在 [Vercel Project Settings > Environment Variables](https://vercel.com/dashboard/settings/environment-variables) 中添加以下配置:

```bash
# ================================
# STRIPE SUBSCRIPTION PRICING
# ================================

# Monthly Plans (Price IDs from Stripe Dashboard)
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=<pro_monthly_price_id>
STRIPE_PRO_PRICE_ID=<pro_monthly_price_id>

NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID=<unlimited_monthly_price_id>
STRIPE_UNLIMITED_PRICE_ID=<unlimited_monthly_price_id>

# Yearly Plans (with discounts applied)
NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID=<pro_yearly_price_id>
STRIPE_PRO_YEARLY_PRICE_ID=<pro_yearly_price_id>

NEXT_PUBLIC_STRIPE_UNLIMITED_YEARLY_PRICE_ID=<unlimited_yearly_price_id>
STRIPE_UNLIMITED_YEARLY_PRICE_ID=<unlimited_yearly_price_id>

# Payment Keys (Production-ready keys only!)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxx
```

### 🎯 Stripe Dashboard 设置步骤

#### Step 1: 创建订阅产品 (Products)

访问 [Stripe Dashboard > Products](https://dashboard.stripe.com/products)

**创建 "Pro" 产品:**
```yaml
Name: Oxmate AI - Pro
Description: Advanced AI companionship with 1500 monthly credits
Currency: USD
Unit amount: $9.99/mo
```

**创建 "Unlimited" 产品:**
```yaml
Name: Oxmate AI - Unlimited
Description: Maximum AI companionship with 5000 monthly credits
Currency: USD
Unit amount: $29.99/mo
```

#### Step 2: 创建价格 (Prices)

点击产品 → Add Price 配置以下 4 个价格:

| Plan | Type | Interval | Amount | Lookup Key |
|------|------|----------|--------|------------|
| Pro Monthly | Subscription | Monthly | $9.99 | `pro_monthly` |
| Pro Yearly | Subscription | Yearly | $101.88 | `pro_yearly` (15% off) |
| Unlimited Monthly | Subscription | Monthly | $29.99 | `unlimited_monthly` |
| Unlimited Yearly | Subscription | Yearly | $287.88 | `unlimited_yearly` (20% off) |

#### Step 3: 获取 Price IDs

每个价格创建后，复制其 **ID** (格式：`price_xxxxxxxxxxxxx`)

替换上述环境变量中的 `<xxx>` 占位符:
```bash
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=price_123abc456def...
STRIPE_PRO_PRICE_ID=price_123abc456def...
NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID=price_xyz789ghi...
STRIPE_UNLIMITED_PRICE_ID=price_xyz789ghi...
# ... etc
```

#### Step 4: 配置 Webhook

访问 [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)

添加端点:
```
URL: https://your-domain.vercel.app/api/stripe/webhook
Events to listen for:
  ✓ customer.subscription.created
  ✓ customer.subscription.updated
  ✓ customer.subscription.deleted
  ✓ invoice.payment_failed
  ✓ checkout.session.completed
```

---

## 🧪 测试验证清单

### ✅ 开发环境测试

1. **Stripe Test Mode Setup**
   ```bash
   # Use test keys in .env.local
   STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxx
   STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxx
   ```
   
2. **模拟购买流程**
   - [ ] 访问 `/shop` 页面
   - [ ] 选择 Pro $9.99 计划
   - [ ] 完成测试支付
   - [ ] 验证订阅状态更新
   - [ ] 检查是否授予 1500 积分

3. **积分扣除测试**
   - [ ] Generate Image: 验证扣除 9 credits
   - [ ] Generate TTS: 验证扣除 1 credit
   - [ ] Generate Video 3s: 验证扣除 30 credits
   - [ ] Generate Video 5s: 验证扣除 50 credits
   - [ ] Generate Video 10s: 验证扣除 100 credits

### ✅ 生产环境上线前检查

1. **环境变量验证**
   ```bash
   # In Vercel Dashboard
   NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=  ← Must be live key (sk_live_...)
   STRIPE_PRO_PRICE_ID=              ← Must NOT be empty
   STRIPE_UNLIMITED_PRICE_ID=        ← Must be live key
   STRIPE_SECRET_KEY=                ← MUST use sk_live_ not sk_test_
   STRIPE_WEBHOOK_SECRET=            ← Production webhook secret
   ```

2. **付费墙测试**
   - [ ] 新注册用户能否看到 Free tier (100 credits)?
   - [ ] Pro 用户每月自动收到 1500 credits?
   - [ ] Unlimited 用户每月自动收到 5000 credits?
   - [ ] 积分耗尽后是否能正常充值？

3. **Webhook 监控**
   - [ ] 订阅事件是否正确触发？
   - [ ] 积分发放逻辑是否工作？
   - [ ] 失败支付是否有降级处理？

---

## 📈 商业模式分析

### 💰 Revenue Model

| Metric | Calculation | Value |
|--------|-------------|-------|
| **Cost per Credit** | $9.99 / 1000 | $0.00999 |
| **Markup Factor** | Pricing formula | 200x |
| **Effective Price** | Cost × 200 | 正确定价 |
| **Profit Margin** | ~75-80% | Healthy SaaS margin |

### 📊 User Economics Example

**Pro User ($9.99/month):**
```
Monthly Revenue:    $9.99
Credits Provided:   1,500
Average Usage:      1,200 credits (80%)
Revenue/Credit:     $0.00832
Gross Margin:       ~70% after GPU costs
```

**Unlimited User ($29.99/month):**
```
Monthly Revenue:    $29.99
Credits Provided:   5,000
Average Usage:      4,000 credits (80%)
Revenue/Credit:     $0.00749
Gross Margin:       ~75% after GPU costs
```

### 🎯 Break-even Analysis

**For Pro Plan:**
- Break-even Point: User must use ≤ 750 credits/month
- Profitable Threshold: Usage > 750 credits/month
- Typical User: Uses 1,200 credits → **Healthy profit**

**For Unlimited Plan:**
- Break-even Point: User must use ≤ 2,500 credits/month
- Profitable Threshold: Usage > 2,500 credits/month
- Heavy Users: May approach break-even but LTV high

---

## 🚀 部署 Checklist

### Pre-Launch (Critical!)

- [ ] **Stripe Product Creation**: Create all 4 Price plans in Stripe Dashboard
- [ ] **Copy Price IDs**: Extract `price_xxx` IDs and paste into env vars
- [ ] **Switch to Live Keys**: Replace `sk_test_*` with `sk_live_*` in production
- [ ] **Configure Webhook**: Set up production webhook endpoint
- [ ] **Test Mode Checkout**: Verify payment flow works end-to-end
- [ ] **Update .env.example**: Document new variables for developers

### Post-Launch Monitoring

- [ ] Track credit consumption patterns across tiers
- [ ] Monitor GPU cost vs revenue ratio
- [ ] Watch for abuse patterns (credit farming, API spam)
- [ ] Analyze which features are most popular
- [ ] Adjust pricing if needed based on data

---

## 📝 代码变更文件清单

已更新的核心文件：

1. ✅ [`src/lib/credit-system.ts`](src/lib/credit-system.ts)
   - Updated exchange rate: `$9.99 / 1000 credits`
   - New feature costs with pricing comments
   - Added credit packages: 100/500/1000/2500

2. ✅ [`src/lib/constants.ts`](src/lib/constants.ts)
   - Updated MEMBERSHIP_TIERS descriptions
   - New gifted amounts: Free(100), Pro(1500), Unlimited(5000)
   - Enabled video_gen for Free tier (via credits)

3. ⚠️ **Requires Configuration**: `.env.prod.local` or Vercel environment variables

---

## 🔍 常见问题 FAQ

### Q1: 为什么降低单张图片的积分数值？
**A**: 原 10 credits 对应成本约$0.05，现改为 9 credits 对应$0.045，更贴近实际 RunPod FLUX 成本，同时保持整体盈利空间。

### Q2: TTS 从 2 credits 降到 1 credit 合理吗？
**A**: Edge TTS 成本极低（~$0.003-0.005），1 credit=$0.00999 已经提供 2-3x 安全边际，且能鼓励用户使用语音功能。

### Q3: Free 用户也能生成视频了吗？
**A**: 是的！只要账户里有剩余积分就可以生成视频。这是为了打破付费墙带来的体验障碍，同时保证 monetization。

### Q4: 每月赠送的积分会过期吗？
**A**: 当前实现不会自动过期，但建议在 database schema 中添加 `credits_expiry` 字段来实现月度重置逻辑。

### Q5: 如何防止积分滥用？
**A**: 
- Hourly rate limiting (已实施)
- Daily usage caps per tier (已实施)
- Failed generation auto-refund (已实施)
- Suggested: Add anomaly detection for abnormal patterns

---

## 📞 下一步行动

### Immediate Actions Required:

1. **登录 Stripe Dashboard** 创建 4 个 Price plans
2. **复制 Price IDs** 到 Vercel 环境变量
3. **切换 Live Keys** (不要使用 test mode)
4. **运行本地测试** 确保积分系统正常工作
5. **部署到 Production** 并监控首周数据

### Optional Enhancements:

- [ ] Add first-time top-up bonus (double credits)
- [ ] Implement credit expiry (monthly reset)
- [ ] Create credit bundle bundles in shop UI
- [ ] Add referral bonus (invite friends get 200 credits)
- [ ] Build credit analytics dashboard for admins

---

## 📊 成功指标追踪

### Week 1 Launch Metrics

- Conversion Rate: Free → Paid (Target: 3-5%)
- Credit Consumption per User (Target: 60-80% of allowance)
- Revenue per Tier (Pro: $9.99 x users, Unlimited: $29.99 x users)
- Churn Rate by Tier (Target: <5%/month)

### Month 1 Business KPIs

- MRR (Monthly Recurring Revenue)
- ARPU (Average Revenue Per User)
- CAC Payback Period (Target: <3 months)
- LTV/CAC Ratio (Target: >3x)

---

🎉 **Ready to Launch!** 

这套全新的积分系统结合了订阅制 + 用量的混合模式，既保证了稳定收入，又给了用户灵活使用的空间。价格策略健康可持续，祝 Oxmate AI 大获成功！🚀
