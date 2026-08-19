# 🧪 新积分系统测试计划

## 📋 测试概览

**测试目标**: 验证新的积分定价和会员赠送系统正常工作

**测试范围**:
- 积分购买流程
- 会员月度积分赠送
- 各功能积分扣除
- 前端 UI 显示
- 数据库记录

---

## ✅ Test Case 1: 基础汇率验证

### 1.1 CREDIT_EXCHANGE 配置
**文件**: `src/lib/credit-system.ts`

```typescript
// Expected:
export const CREDIT_EXCHANGE = {
  credits: 1000,
  usd_cents: 999, // $9.99
} as const;

// Verify conversion functions:
creditsToUsdCents(1000) === 999;
usdCentsToCredits(999) === 1000;
```

**测试命令**:
```bash
pnpm ts-check
pnpm lint
```

---

## ✅ Test Case 2: 功能积分数值验证

### 2.1 CREDIT_COSTS 检查
**文件**: `src/lib/credit-system.ts`

| Feature | Old Value | New Value | Cost Basis |
|---------|-----------|-----------|------------|
| image_gen | 10 → **9** | $0.045 × 200 ✓ |
| image_gen_hd | 10 → **18** | $0.09 × 200 ✓ |
| tts | 2 → **1** | $0.005 × 200 ✓ |
| video_3s | 30 (no change) | $0.15 × 200 ✓ |
| video_5s | 50 (no change) | $0.25 × 200 ✓ |
| video_10s | 100 (no change) | $0.50 × 200 ✓ |

**验证步骤**:
```bash
grep -n "CREDIT_COSTS" src/lib/credit-system.ts
```

---

## ✅ Test Case 3: 会员赠送方案验证

### 3.1 MEMBERSHIP_TIERS 检查
**文件**: `src/lib/constants.ts`

| Tier | Old Starter/Monthly | New Starter/Monthly | Changes |
|------|---------------------|---------------------|---------|
| Free | 50 / 0 | **100 / 0** | ✨ +50 welcome bonus |
| Pro | 0 / 500 | **0 / 1,500** | 🚀 3x monthly credits |
| Unlimited | 0 / 1,500 | **0 / 5,000** | 🎯 3.33x monthly credits |

**验证代码**:
```typescript
// src/lib/constants.ts should show:
free: { starter_credits: 100, monthly_credits: 0, video_gen: true }
pro: { starter_credits: 0, monthly_credits: 1500, video_gen: true }
unlimited: { starter_credits: 0, monthly_credits: 5000, video_gen: true }
```

---

## ✅ Test Case 4: 积分购买套餐验证

### 4.1 TOKEN_PACKAGES 检查
**文件**: `src/lib/credit-system.ts`

New packages:
- 100 credits @ $9.99 (unit price: $0.0999)
- 500 credits @ $39.99 (unit price: $0.07998, **save 20%**)
- 1000 credits @ $79.99 (unit price: $0.07999, **best value**)
- 2500 credits @ $199.99 (unit price: $0.079996, **bulk discount**)

**对比旧版**:
- ❌ Removed: 1200 credits @ $29.99 (bad pricing)
- ✅ Added: 1000 & 2500 tiers (proper scaling)

---

## ✅ Test Case 5: 积分扣除逻辑集成测试

### 5.1 Image Generation Flow
**Endpoint**: `POST /api/generate-image`

**测试场景**:
```bash
# 使用 curl 或 API 测试工具
curl -X POST http://localhost:3000/api/generate-image \
  -H "Content-Type: application/json" \
  -H "x-session: YOUR_SESSION_TOKEN" \
  -d '{
    "prompt": "a beautiful girl in Paris",
    "scene": "chat_selfie"
  }'
```

**预期结果**:
- 扣除 **9 credits**
- 返回生成的图片 URL
- 数据库中 `user_credits_ledger` 新增一行记录:
  ```sql
  reason: 'image_gen_extra'
  delta: -9
  balance_after: <new_balance>
  ```

### 5.2 TTS Voice Flow
**Endpoint**: `POST /api/ai/voice`

**测试场景**:
```bash
curl -X POST http://localhost:3000/api/ai/voice \
  -H "Content-Type: application/json" \
  -H "x-session: YOUR_SESSION_TOKEN" \
  -d '{
    "text": "Hello, I miss you!",
    "girlfriend_id": "test-girlfriend-id",
    "emotion": "happy"
  }'
```

**预期结果**:
- 扣除 **1 credit**
- 返回音频 URL
- Ledger entry:
  ```sql
  reason: 'tts_extra'
  delta: -1
  balance_after: <new_balance>
  ```

### 5.3 Video Generation Flow
**Endpoint**: `POST /api/generate-video`

**测试场景 (3s)**:
```bash
curl -X POST http://localhost:3000/api/generate-video \
  -H "Content-Type: application/json" \
  -H "x-session: YOUR_SESSION_TOKEN" \
  -d '{
    "input_image": "https://...",
    "duration": 3,
    "girlfriend_id": "test-girlfriend-id"
  }'
```

**预期结果**:
- 扣除 **30 credits** (video_3s)
- 返回视频 URL
- Ledger entry:
  ```sql
  reason: 'video_gen'
  delta: -30
  balance_after: <new_balance>
  ```

---

## ✅ Test Case 6: 会员订阅与积分发放

### 6.1 Stripe Webhook 集成测试
**前提**: 已配置 Stripe test mode 并创建 Price IDs

**测试步骤**:
1. 在 Stripe Dashboard 创建 test checkout session
   ```bash
   # Use Stripe CLI
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   stripe trigger customer.subscription.created
   ```

2. 模拟订阅事件触发
   - Event: `customer.subscription.created`
   - Plan: pro_monthly ($9.99)

3. **预期行为**:
   - Database: `subscriptions` table updated with status=active
   - Profile: `profiles.credits_remaining += 1500`
   - Ledger: `reason='subscription_grant', delta=+1500`

### 6.2 Monthly Credit Grant Scheduling
**Database Function Check**:
```sql
-- Check if grant_monthly_credits RPC function exists
SELECT proname FROM pg_proc WHERE proname LIKE '%grant_monthly%';
```

**Expected SQL Migration**:
```sql
CREATE OR REPLACE FUNCTION grant_monthly_credits(uid uuid, tier text)
RETURNS INTEGER AS $$
BEGIN
  RETURN CASE tier
    WHEN 'pro' THEN 1500
    WHEN 'unlimited' THEN 5000
    ELSE 0
  END;
END;
$$ LANGUAGE plpgsql;
```

---

## ✅ Test Case 7: 前端 UI 显示验证

### 7.1 Membership State Hook
**组件**: `src/hooks/useMembership.ts`

**Expected Display**:
```typescript
{
  tier: 'pro' | 'unlimited' | 'free',
  creditsRemaining: 1500 | 5000 | 100, // Based on tier
  todayMessagesCount: 0,
  remainingFreeMessages: 200 | Infinity | 40,
  capabilities: { /* ... */ },
}
```

### 7.2 Shop Page Credit Packages
**Page**: `/shop` (or similar)

**Verify**: Shows new package options:
- [ ] Starter: 100 credits @ $9.99
- [ ] Popular: 500 credits @ $39.99
- [ ] Standard: 1000 credits @ $79.99
- [ ] Power User: 2500 credits @ $199.99

**Buy Button Action**:
- Calls Stripe Checkout
- On success → grants credits via webhook
- Updates UI with new balance

---

## ✅ Test Case 8: 积分耗尽提示与充值流程

### 8.1 Insufficient Credits Error Handling
**Test Scenario**: User has 5 credits, tries to generate image (costs 9)

**API Response**:
```json
{
  "error": "Daily image limit reached. Insufficient credits (need 9).",
  "code": "insufficient_credits",
  "required": 9,
  "balance": 5
}
```

**Frontend Behavior**:
- Show error modal/banner
- Display "Buy more credits" button
- Link to shop page or inline checkout

### 8.2 Balance Threshold Warnings
**UI Elements to Add**:
```typescript
// When balance < threshold, show warning
if (creditsRemaining < 50) {
  return <Banner>Only {creditsRemaining} credits left! Recharge now.</Banner>;
}
if (creditsRemaining < 10) {
  return <Banner Critical>Your credits are almost gone!</Banner>;
}
```

---

## ✅ Test Case 9: Rate Limiting Integration

### 9.1 Image Generation Rate Limit
**Configured Limits** (from `route.ts`):
```typescript
const HOURLY_HARD_CAP = { maxRequests: 20, windowMs: 60 * 60 * 1000 };
```

**Test Command**:
```bash
# Send 21 rapid requests
for i in {1..21}; do
  curl -X POST http://localhost:3000/api/generate-image \
    -d '{"prompt":"test"}' &
done
wait
```

**Expected Result**:
- First 20 requests: Process normally (deduct 9 credits each)
- 21st request: Return HTTP 429 Too Many Requests

---

## ✅ Test Case 10: Refund on Failure

### 10.1 Failed Generation Auto-Refund
**Trigger**: Simulate RunPod API failure or timeout

**Test Scenario**:
```typescript
// Mock runpodClient.generate to throw error
mock(() => runpodClient.generate).rejects(new Error('GPU Timeout'));
```

**Expected Behavior**:
```typescript
// In catch block:
await deductCredits(client, userId, cost, 'image_gen');
try {
  await runpodClient.generate(...);
} catch (err) {
  // REFUND IMMEDIATELY
  await grantCredits(client, userId, cost, 'refund');
  throw err;
}
```

**Database Verification**:
```sql
-- Should have two entries:
SELECT * FROM user_credits_ledger 
WHERE user_id = '<your_user>' 
ORDER BY created_at DESC LIMIT 2;
/*
- deduction: delta=-9, reason='image_gen_extra'
- refund: delta=+9, reason='refund'
Net change: 0 ✅
*/
```

---

## 🎯 完整测试工作流

### Phase 1: Local Development (Day 1)
```bash
# 1. Run type check & linting
pnpm validate

# 2. Start dev server
pnpm dev

# 3. Create test user via Supabase dashboard
# Email: test@example.com
# Get session token from browser DevTools

# 4. Test credit purchase flow (with Stripe test keys)
npm install -g stripe-cli
stripe login
stripe listen --forward-to=http://localhost:3000/api/stripe/webhook

# 5. Simulate subscription events
stripe trigger customer.subscription.created

# 6. Monitor console logs for credit operations
# Look for: "Granted 1500 credits to user X"
```

### Phase 2: Integration Testing (Day 2-3)
```bash
# Run automated tests (create if not exist)
pnpm test:unit
pnpm test:integration

# Manual API testing with Postman/Insomnia
# Import collection: ./tests/integration/api-collection.json
```

### Phase 3: Staging Environment (Day 4)
```bash
# Deploy to Vercel preview URL
vercel deploy --prod

# Share staging link with team for QA
# Collect feedback on UX issues
```

### Phase 4: Production Launch (Day 5)
```bash
# 1. Backup database (critical!)
pg_dump <prod_db_url> > backup_$(date +%Y%m%d).sql

# 2. Enable monitoring
# Sentry alerts, Datadog metrics, etc.

# 3. Deploy to production
pnpm build
vercel --prod

# 4. Monitor real-time dashboards
# - Credit consumption rate
# - Revenue per user
# - Support ticket volume
```

---

## 🔍 Debugging Checklist

### Issue: Credits not being deducted correctly

**Checklist**:
- [ ] Confirm `CREDIT_COSTS` values are correct
- [ ] Verify `deductCredits` RPC function exists in DB
- [ ] Check user balance before deduction attempt
- [ ] Review ledger entries for reason codes
- [ ] Ensure session token is valid and authenticated

### Issue: Monthly credits not granted

**Checklist**:
- [ ] Stripe webhook endpoint responding 200 OK
- [ ] Webhook secret matches in Stripe Dashboard
- [ ] `grant_monthly_credits` function exists
- [ ] Subscription status = active
- [ ] Cron job or scheduled task running

### Issue: Frontend showing wrong credit balance

**Checklist**:
- [ ] Call `/api/membership` endpoint directly
- [ ] Compare backend response with frontend state
- [ ] Clear localStorage cache (`credits_remaining`)
- [ ] Refresh membership hook on visibility change
- [ ] Check for multiple tabs causing race conditions

---

## 📊 Success Metrics

### Week 1 KPIs

- **Credit Deduction Accuracy**: 100% (all transactions correct)
- **Monthly Grant Success Rate**: ≥99%
- **Failed Transaction Refund Time**: <5 seconds
- **User Complaint Volume**: Low (no reports of missing credits)

### Month 1 Business Metrics

- Conversion Rate: Free → Paid ≥3%
- Average Credit Consumption: 60-80% of allowance
- Revenue Growth: MoM ≥15%
- Churn Rate by Tier: Pro ≤8%, Unlimited ≤12%

---

## 🎉 Sign-off Criteria

**Deployment Approval Required Before Going Live:**

- [ ] All unit tests pass (pnpm test)
- [ ] Type checking passes (pnpm validate)
- [ ] ESLint no errors (pnpm lint)
- [ ] Integration tests green (10+ scenarios)
- [ ] Stripe webhook events firing correctly
- [ ] Database migrations applied successfully
- [ ] Monitoring dashboards configured
- [ ] Rollback plan documented

---

## 📞 Emergency Rollback Plan

If critical issues occur post-launch:

```bash
# Option 1: Revert deployment
vercel rollback --target=previous-successful-deployment

# Option 2: Temporarily disable credit deduction
# Update environment variable:
DISABLE_CREDIT_DEDUCTION=true
# This blocks all GPU media generation until fixed

# Option 3: Reset to old pricing temporarily
# Comment out changes in credit-system.ts
# Restart dev server or redeploy
```

---

✅ **Ready to Test!** 

按照这个计划逐步验证，确保新的积分系统在上线前万无一失。祝测试顺利！🚀
