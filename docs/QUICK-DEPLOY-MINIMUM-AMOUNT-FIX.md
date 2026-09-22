# Quick Deploy Guide - Minimum Amount Fix

## 🚨 Critical Fix Applied

**Problem**: NOWPayments returns error when payment amount is below minimum:
```
Crypto amount 6.282758 is less than minimal
```

**Solution**: Added automatic minimum amount validation and upgrade recommendation

---

## 📦 What Was Fixed

### 1. Backend API Validation (`/api/crypto/embed-payment`)
- Query NOWPayments `/minimum-amount` endpoint before creating payment
- If selected package is below minimum, return recommended higher-tier package
- User-friendly error response with upgrade suggestion

### 2. Wallet UI Enhancement (`/wallet/page.tsx`)
- Detect "Amount too low" error from backend
- Show toast notification with "Upgrade Package" action button
- Automatically redirect user to select the recommended higher-priced package

### 3. Currency-Specific Limits
Different cryptocurrencies have different minimum amounts in NOWPayments:
- USDT TRC-20: Usually ~$5-10 minimum
- BTC: Higher absolute value (fractional BTC)
- ETH: Medium minimum (~$10)
- LTC/SOL: Lower thresholds

---

## 🧪 Test Flow

### Step 1: Local Build Verification
```bash
cd E:/soulmate9
pnpm build
```

Should complete without TypeScript errors.

### Step 2: Manual Deployment (GitHub Push Failed Due to SSL)

#### Option A: Vercel Dashboard (Recommended)
1. Visit: https://vercel.com/dashboard/projects/soulmate9-ai01/deployments
2. Click "Import Git Repository" → Select `zxixi778899/soulmate9-ai01`
3. Environment variables should auto-populate
4. Click "Deploy"

#### Option B: Git Fallback
If you have another accessible git repo:
```bash
git remote add backup <your-backup-repo-url>
git push backup main:main
# Then deploy from that branch in Vercel
```

---

## ✅ What to Expect After Deploy

### Scenario 1: Buying $5.99 Starter Pack (Below Minimum)

**User Action:**
1. Click "$5.99 · Starter" card
2. Select "USDT (TRC-20)"
3. System checks minimum amount for USDT TRC-20

**Expected Response:**
```json
{
  "success": false,
  "error": "Amount too low",
  "message": "Minimum payment of $9.99 required",
  "currentPrice": 5.99,
  "recommendedPackage": {
    "id": "credits-1000",
    "name": "Popular",
    "price": 9.99
  }
}
```

**UI Behavior:**
- Toast appears: "金额太小 - 最低需要 $9.99，是否升级？"
- Action button: "升级套餐"
- Clicking it reopens currency selector with $9.99 package pre-selected
- User can confirm purchase at correct price

### Scenario 2: Buying $9.99+ Package (Above Minimum)

**Direct Success:**
```json
{
  "success": true,
  "paymentId": "1234567890",
  "payAddress": "Txxxxxxxx...",
  "payAmount": 9.99,
  "payCurrency": "USDT",
  "network": "TRC-20",
  ...
}
```

- Payment dialog opens immediately
- QR code displayed
- User scans and pays
- Auto-detection kicks in after blockchain confirmation

---

## 🔍 Monitoring & Debugging

### Check Logs in Production
```bash
# Via Vercel CLI (if installed locally)
vercel logs --since 5m | grep "embed-payment"

# Expected log entries:
[embed-payment] Min amount check { packagePrice: 5.99, requiredMin: 9.99, currency: 'USDT' }
[embed-payment] Price below minimum, upgrading to: { original: 5.99, upgradedTo: 9.99 }
```

### Test Network Requests

Open DevTools → Network tab while testing purchase:

**POST /api/crypto/embed-payment Request:**
```json
{
  "package_id": "credits-500",
  "payment_method": "usdttrc20",
  "is_membership_upgrade": false
}
```

**Response Types:**

**Type 1 - Upgrade Needed (400 Bad Request):**
```json
{
  "success": false,
  "error": "Amount too low",
  "message": "Minimum payment of $9.99 required",
  "currentPrice": 5.99,
  "recommendedPackage": { ... }
}
```

**Type 2 - Direct Success (200 OK):**
```json
{
  "success": true,
  "provider": "nowpayments",
  "paymentId": "...",
  "payAddress": "Txxxx...",
  "payAmount": 9.99,
  "payCurrency": "USDT",
  "network": "TRC-20",
  "status": "awaiting_payment",
  "expiresAt": "..."
}
```

---

## ⚠️ Known Issues & Workarounds

### Issue 1: Different Minimums Per Currency

**Symptom**: User selects ETH and gets different minimum than USDT

**Fix**: We query NOWPayments API dynamically per currency selection. The `/minimum-amount` endpoint returns exact threshold.

**Log Output**:
```javascript
[embed-payment] Min amount check { 
  packagePrice: 5.99, 
  requiredMin: 10.5, // USD equivalent
  currency: 'ETH' 
}
```

### Issue 2: No Suitable Higher Package Found

**Scenario**: All available packages are below minimum amount

**Current Behavior**: Returns error message explaining no suitable upgrade found

**Manual Fix Required**:
Create a new credit package with higher price in admin/shop

**Database Query**:
```sql
-- Insert new package
INSERT INTO products (name, type, status, price_cents, virtual_meta)
VALUES ('Premium', 'virtual', 'active', 2999, '{"kind":"credits","token_amount":3000,"bonus_tokens":0}');
```

---

## 🔄 Rollback Plan

If this fix causes issues:

### Quick Revert
```bash
git revert HEAD
git push origin main
```

Or use Vercel Dashboard to rollback to previous deployment.

---

## 📊 Success Metrics

After deployment, monitor these metrics:

| Metric | Target | Measurement |
|--------|--------|-------------|
| Minimum amount rejection rate | < 5% | % of purchases blocked |
| Upgrade acceptance rate | > 60% | Users who accept recommended upgrade |
| Successful payment completion | > 80% | Payments completing within time limit |
| Auto-detect success rate | > 95% | IPN webhooks triggering correctly |

---

## 🆘 Emergency Contacts

**NOWPayments Support**: support@nowpayments.io  
**Vercel Support**: https://vercel.com/support  
**Project Repo**: https://github.com/zxixi778899/soulmate9-ai01

---

Last Updated: 2024-09-23  
Status: Ready for manual deployment via Vercel Dashboard
