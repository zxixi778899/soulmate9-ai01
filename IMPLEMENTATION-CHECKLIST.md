# 🚀 Oxmate AI 会员系统优化 - 最终实施方案

**版本**: 2.0  
**更新日期**: 2026-08-18  
**状态**: ✅ Ready for Implementation

---

## 📋 一、核心变更总结

### 新定价结构（基于竞品分析）

| Tier | Monthly | Yearly | Credits | Target Users | Key Change |
|------|---------|--------|---------|-------------|------------|
| **Free** | $0 | N/A | 100 (one-time) | Casual users | No change |
| **Pro** | **$9.99** | **$99.99** (17% off) | **1,500** | Daily casuals | Price unchanged, better yearly value |
| **Premium** | **$24.99** ⭐ NEW! | **$199.99** (20% off) | **4,000** | Heavy media users | **Solves $15-25 price gap!** |
| **Unlimited** | **$34.99** 🔥 | **$299.99** (20% off) | **6,000** | Power users | +$5 vs old ($29.99 → $34.99) |

### 积分成本调整

| Feature | Old Value | New Value | Rationale |
|---------|-----------|-----------|-----------|
| Image Generation | 9 credits | **10 credits** | Round number for cleaner UX |
| HD/Multi Image | 18 credits | **20 credits** | Consistent rounding |
| TTS Voice Message | 1 credit | **1 credit** | ✅ Already perfect |
| Video 3s | 30 credits | **30 credits** | ✅ Unchanged |
| Video 5s | 50 credits | **50 credits** | ✅ Unchanged |
| Video 10s | 100 credits | **100 credits** | ✅ Unchanged |

### 积分购买套餐优化

| Package | Old Price | New Price | Discount | Positioning |
|---------|-----------|-----------|----------|-------------|
| 100 credits | $9.99 | $9.99 | - | Entry point |
| 500 credits | $39.99 | $39.99 | 20% off | Popular choice |
| 1,000 credits | $79.99 | **$69.99** | **30% off** | ⭐ **Best Value Badge** |
| 2,500 credits | $199.99 | **$179.99** | **40% off** | 💪 Bulk discount |

---

## ✅ 二、已完成的代码变更

### Modified Files Summary

#### 1. [`src/lib/credit-system.ts`](file:///c:/Users/71489/soulmate9/src/lib/credit-system.ts)
```diff
- export const CREDIT_COSTS = {
+ export const CREDIT_COSTS = {
-   image_gen: 9,
+   image_gen: 10, // Round number for cleaner UX
-   image_gen_hd: 18,
+   image_gen_hd: 20, // Round number
    tts: 1,
    video_3s: 30,
    video_5s: 50,
    video_10s: 100,
  } as const;

- export const TOKEN_PACKAGES = [
+ export const TOKEN_PACKAGES = [
    { id: 'credits-100', name: 'Starter', token_count: 100, bonus_tokens: 0, price_cents: 999, sort_order: 1 },
    { id: 'credits-500', name: 'Popular', token_count: 500, bonus_tokens: 0, price_cents: 3999, sort_order: 2 }, // Save 20%
-   { id: 'credits-1000', name: 'Standard', token_count: 1000, bonus_tokens: 0, price_cents: 7999, sort_order: 3 },
-   { id: 'credits-2500', name: 'Power User', token_count: 2500, bonus_tokens: 0, price_cents: 19999, sort_order: 4 },
+   { id: 'credits-1000', name: 'Best Value', token_count: 1000, bonus_tokens: 0, price_cents: 6999, sort_order: 3 }, // Save 30% - Recommended!
+   { id: 'credits-2500', name: 'Power User', token_count: 2500, bonus_tokens: 0, price_cents: 17999, sort_order: 4 }, // Save 40%
  ] as const;
```

#### 2. [`src/lib/constants.ts`](file:///c:/Users/71489/soulmate9/src/lib/constants.ts)
```diff
  export const MEMBERSHIP_TIERS = {
    free: { /* ... */ },
    pro: {
      price_cents: 999,
-     yearly_price_cents: 10188,
+     yearly_price_cents: 9999, // $99.99/yr = 17% off
      /* ... */
    },
+   premium: {
+     name: 'Premium',
+     price_cents: 2499, // $24.99/mo
+     yearly_price_cents: 19999, // $199.99/yr = 20% off
+     messages_per_day: 500,
+     max_girlfriends: 50,
+     monthly_credits: 4000,
+     quest_reward_multiplier: 1.75,
+   },
    unlimited: {
      price_cents: 3499, // $34.99/mo (+$5 from old)
-     yearly_price_cents: 28788,
+     yearly_price_cents: 29999, // $299.99/yr
-     monthly_credits: 5000,
+     monthly_credits: 6000, // +1000 credits
      /* ... */
    },
  } as const;
```

#### 3. [`src/hooks/useMembership.ts`](file:///c:/Users/71489/soulmate9/src/hooks/useMembership.ts)
```diff
- export type MembershipTier = 'free' | 'pro' | 'unlimited' | 'admin';
+ export type MembershipTier = 'free' | 'pro' | 'premium' | 'unlimited' | 'admin';

  export const MEMBERSHIP_LIMITS = {
    free: { videoGen: true, /* ... */ }, // Updated to allow video via credits
    pro: { /* ... */ },
+   premium: {
+     dailyMessageLimit: 500,
+     maxGirlfriends: 50,
+     questMultiplier: 1.75,
+   },
    unlimited: { /* ... */ },
  } as const;

- const VALID_TIERS = new Set(['free', 'pro', 'unlimited', 'admin']);
+ const VALID_TIERS = new Set(['free', 'pro', 'premium', 'unlimited', 'admin']);

  function normalizeTier(raw: unknown): MembershipTier {
-   if (raw === 'premium' || raw === 'basic') return 'pro';
+   if (raw === 'basic') return 'pro';
+   // New 'premium' tier is legitimate - don't downgrade!
    if (typeof raw === 'string' && VALID_TIERS.has(raw as MembershipTier)) {
      return raw as MembershipTier;
    }
    return 'free';
  }
```

---

## 🎯 三、Stripe Dashboard 配置清单

### Required Price IDs to Create

**Access Stripe Dashboard > Products & Pricing:**

1. **Create Premium Product** (NEW!)
   ```yaml
   Name: Oxmate AI - Premium
   Description: Best value! 500 messages/day, 4000 monthly credits
   Currency: USD
   
   # Monthly Price
   - Amount: $24.99
   - Interval: Month
   - Lookup Key: premium_monthly
   
   # Yearly Price (with 20% discount)
   - Amount: $199.99
   - Interval: Year
   - Lookup Key: premium_yearly
   ```

2. **Update Pro Product**
   ```yaml
   Name: Oxmate AI - Pro
   Description: Great for daily use! 200 messages/day, 1500 monthly credits
   
   # Monthly Price (existing)
   - Amount: $9.99
   - Interval: Month
   - Lookup Key: pro_monthly
   
   # Yearly Price (adjusted)
   - Amount: $99.99 ← Changed from ~$101.88
   - Interval: Year
   - Lookup Key: pro_yearly
   ```

3. **Update Unlimited Product**
   ```yaml
   Name: Oxmate AI - Unlimited
   Description: Maximum freedom! Unlimited messages, 6000 monthly credits
   
   # Monthly Price
   - Amount: $34.99 ← Changed from $29.99
   - Interval: Month
   - Lookup Key: unlimited_monthly
   
   # Yearly Price (adjusted)
   - Amount: $299.99 ← Changed from ~$287.88
   - Interval: Year
   - Lookup Key: unlimited_yearly
   ```

### Environment Variables Setup

**In Vercel Project Settings > Environment Variables:**

```bash
# Monthly Plans
NEXT_PUBLIC_STRIPE_PRO_PRICE_ID=<copy_from_stripe_dashboard>
STRIPE_PRO_PRICE_ID=<same_as_above>

NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID=<new_premium_monthly_id>
STRIPE_PREMIUM_PRICE_ID=<same_as_above>

NEXT_PUBLIC_STRIPE_UNLIMITED_PRICE_ID=<new_unlimited_monthly_id>
STRIPE_UNLIMITED_PRICE_ID=<same_as_above>

# Yearly Plans
NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID=<pro_yearly_id>
STRIPE_PRO_YEARLY_PRICE_ID=<same_as_above>

NEXT_PUBLIC_STRIPE_PREMIUM_YEARLY_PRICE_ID=<premium_yearly_id>
STRIPE_PREMIUM_YEARLY_PRICE_ID=<same_as_above>

NEXT_PUBLIC_STRIPE_UNLIMITED_YEARLY_PRICE_ID=<unlimited_yearly_id>
STRIPE_UNLIMITED_YEARLY_PRICE_ID=<same_as_above>

# Payment Keys (Production ready)
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxx
```

---

## 🧪 四、测试检查清单

### Pre-Launch Testing

- [ ] **Unit Tests**
  ```bash
  pnpm test
  # Ensure all credit deduction calculations pass
  ```

- [ ] **Type Checking**
  ```bash
  pnpm validate
  # Run full ts-check + lint build
  ```

- [ ] **Integration Tests**
  - [ ] Test Free tier user (100 credits one-time)
  - [ ] Test Pro tier subscription flow ($9.99/mo)
  - [ ] **Test Premium tier NEW subscription ($24.99/mo)** ⭐ Critical!
  - [ ] Test Unlimited tier subscription ($34.99/mo)
  - [ ] Verify monthly credit grant automation
  - [ ] Test credit top-up packages
  - [ ] Verify failed generation auto-refund

- [ ] **UI Verification**
  - [ ] Check pricing page shows 4 tiers correctly
  - [ ] Verify "Best Value" badge on 1000 credit package
  - [ ] Test credit display in header/navigation
  - [ ] Validate cost labels on image/TTS/video buttons
  - [ ] Test balance warning banners (<100, <50, <20 credits)

- [ ] **Migration Safety**
  - [ ] Existing Pro subscribers → Keep $9.99 pricing (grandfathered)
  - [ ] Existing Unlimited subscribers → Migrate to $34.99 with grace period
  - [ ] Verify their existing credits are preserved

---

## 📊 五、预期业务影响

### Conversion Metrics Forecast

| Metric | Current Baseline | Post-Launch Prediction | Expected Change |
|--------|-----------------|-----------------------|-----------------|
| Free→Paid Conversion | ~10% | **12-13%** | **+20-30%** 📈 |
| Pro→Upgrade Rate | Low | **Moderate-High** | **+30-40%** (due to mid-tier) 📈 |
| Premium Tier Adoption | N/A | **15-20% of paid users** | New segment capture 🆕 |
| Average Revenue Per User | $5.40 | $5.10-5.60 | ±5% neutral/brighter 😊 |
| Gross Margin (avg) | ~25% | **30-35%** | +5-10pp profitability boost 📈 |

### User Experience Improvements

- ✅ Reduced cognitive load (tier comparison clearer)
- ✅ Solved "$3x price jump" complaint
- ✅ Transparent pricing builds trust
- ✅ Better perceived value at each tier

---

## 🚨 六、风险缓解策略

### Risk 1: Revenue dip during transition
**Probability**: Medium | **Impact**: Medium
```
Mitigation:
- A/B test new pricing on 10% traffic first
- Grandfather existing subscribers indefinitely
- Emphasize "First Month 50% Off" promotion
```

### Risk 2: User confusion about new tiers
**Probability**: High | **Impact**: Low
```
Mitigation:
- Add clear comparison table on pricing page
- Implement tooltip explanations for features
- Create FAQ section addressing common questions
- Train customer support team beforehand
```

### Risk 3: Over-consumption by Premium users
**Probability**: Medium | **Impact**: Medium
```
Mitigation:
- Smart rate limiting based on tier
- Mandatory confirmation dialogs for large transactions (>500 credits)
- Weekly spending summary emails
- Auto-adjust future allowances based on patterns
```

---

## 📅 七、部署时间表

### Phase 1: Stripe Configuration (Day 1)
- [ ] Log into Stripe Dashboard
- [ ] Create Premium product and 2 price plans
- [ ] Update Pro and Unlimited price plans
- [ ] Copy all Price IDs to Vercel environment variables
- [ ] Test webhook endpoint configuration

### Phase 2: Code Deployment (Day 1-2)
- [ ] Deploy updated code to staging environment
- [ ] Run full test suite (unit + integration)
- [ ] Verify no TypeScript errors
- [ ] Smoke test checkout flows with test keys

### Phase 3: Soft Launch (Day 3)
- [ ] Enable new pricing for 10% of incoming traffic (A/B test)
- [ ] Monitor conversion rates hourly
- [ ] Track error logs for any glitches
- [ ] Gather user feedback via support tickets

### Phase 4: Full Rollout (Day 5-7)
- [ ] If A/B test positive → 100% traffic migration
- [ ] If negative → rollback to original pricing
- [ ] Send announcement email to existing users
- [ ] Update all marketing materials

### Phase 5: Monitoring & Optimization (Ongoing)
- [ ] Week 1: Daily review of key metrics
- [ ] Week 2: Adjust promotions if needed
- [ ] Month 1: Comprehensive analysis and iteration

---

## 💡 八、配套功能推荐

### High-Priority UX Enhancements

1. **Credit Transparency Display** (Week 1)
   ```typescript
   // Show on all generation buttons
   <Button className="generate-image-btn">
     📸 Generate Portrait (10 credits)
   </Button>
   ```

2. **Balance Warning System** (Week 1)
   ```typescript
   // Header notification component
   {creditsRemaining < 100 && (
     <Banner variant="warning">
       Less than 100 credits left. Consider topping up!
     </Banner>
   )}
   ```

3. **Monthly Reset Reminder** (Week 2)
   ```typescript
   // Automated email on day 1 of billing cycle
   Subject: "Your {month} credits have been gifted!"
   Body: "Welcome back! You've received 1,500 credits for this month."
   ```

4. **Comparison Tool** (Week 2)
   ```typescript
   // Interactive pricing calculator
   <PricingComparator
     tiers={['pro', 'premium', 'unlimited']}
     showFeatures={true}
     highlightBestValue={'premium'}
   />
   ```

---

## ✅ 九、成功指标定义

### Week 1 KPIs

- ✅ Zero critical errors in Sentry logs
- ✅ Conversion rate uplift ≥15% (vs baseline)
- ✅ Premium tier captures ≥10% of paid users
- ✅ Support ticket volume remains stable

### Month 1 KPIs

- ✅ Net revenue impact neutral or positive
- ✅ Churn rate unchanged or improved
- ✅ Gross margin ≥30% average across all tiers
- ✅ User satisfaction score (NPS) maintained

---

## 🔧 十、Rollback Plan

If critical issues occur:

```bash
# Option 1: Quick rollback
vercel rollback --target=previous-successful-deployment

# Option 2: Disable new tiers temporarily
# Update constants.ts to only expose pro/unlimited
# Rebuild and redeploy

# Option 3: Feature flag approach
# Set ENV variable: DISABLE_PREMIUM_TIER=true
# Backend logic will hide premium option
```

---

## 📞 十一、下一步行动清单

### Immediate Actions (Next 24 Hours)

1. [ ] **Review this document** with technical team
2. [ ] **Create Stripe products/prices** as specified above
3. [ ] **Configure Vercel environment variables** with live keys
4. [ ] **Run local tests** with staging database
5. [ ] **Prepare customer support script** for user inquiries

### Short-term Actions (Week 1)

6. [ ] Deploy to production during low-traffic window (Tuesday 3AM UTC)
7. [ ] Enable "First Month 50% Off" promotion immediately
8. [ ] Monitor dashboard real-time for 48 hours post-launch
9. [ ] Collect user feedback via support channels
10. [ ] Document lessons learned for next iteration

### Long-term Optimizations (Month 1-3)

11. [ ] Implement referral program (200 credits per invite)
12. [ ] Add annual spend progress tracker toward prizes
13. [ ] Experiment with dynamic credit bundles based on usage patterns
14. [ ] Build admin analytics dashboard for credit consumption trends
15. [ ] Quarterly pricing review based on LTV/CAC data

---

## 🎯 总结

这套经过竞品分析优化的定价方案解决了原有系统的三大痛点：

1. ✅ **消除了 3x 价格断层**（$9.99 → $29.99）
2. ✅ **填补了 $15-25 市场空白**（新增 Premium 档）
3. ✅ **优化了心理定价点**（round numbers + volume discounts）

**预期收益**：
- 转化率提升 20-30%
- 捕获原本会流失的重度用户
- 毛利率提升 5-10 percentage points
- 用户满意度显著提高

**实施风险可控**，回滚方案明确，建议按计划推进。

🎉 **祝 Oxmate AI 大获成功！**

---

📄 **相关文档链接**：
- [原始重新设计方案](./CREDIT-SYSTEM-REDESIGN.md)
- [完整测试计划](./CREDIT-SYSTEM-TEST-PLAN.md)  
- [竞品分析详细报告](./CREDIT-SYSTEM-OPTIMIZATION-V2.md)
