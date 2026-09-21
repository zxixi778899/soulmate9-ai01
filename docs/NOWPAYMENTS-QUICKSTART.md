# NOWPayments 快速启动指南

## 🚀 5 分钟完成配置

### Step 1: 准备 NOWPayments 账户

1. **注册账户**
   - 访问 https://nowpayments.io
   - 点击 "Sign Up" → 选择企业账户
   
2. **获取 API 凭证**
   
   **API Key:**
   ```
   Settings → API Keys → Generate new key
   Copy it to clipboard
   ```
   
   **IPN Secret:**
   ```
   Settings → IPN Settings → Enable notifications
   Copy the Secret Key displayed
   ```
   
3. **配置钱包地址**
   ```
   Settings → Wallets → Add your crypto wallet address
   (Make sure it can receive USDT TRC-20 at minimum)
   ```
   
4. **启用货币**
   ```
   Settings → General settings → Enable these currencies:
   ✓ USDT (TRC-20) - Recommended for low fees
   ✓ BTC
   ✓ ETH
   ✓ LTC
   ✓ SOL
   ✓ BNB
   ✓ TRX
   ```

### Step 2: 本地环境配置

#### Windows:

```powershell
# Run the interactive setup script
.\scripts\setup-nowpayments.bat
```

Follow the prompts to enter:
- NOWPayments API Key
- IPN Secret  
- Default currency (usdttrc20 recommended)
- Token prices (defaults provided)

#### Linux/Mac:

```bash
chmod +x scripts/setup-nowpayments.sh
./scripts/setup-nowpayments.sh
```

#### Manual (alternative):

Edit `.env.local` and add:

```bash
NOWPAYMENTS_API_KEY=your_actual_api_key_here
NOWPAYMENTS_IPN_SECRET=your_actual_secret_here
NOWPAYMENTS_PAY_CURRENCY=usdttrc20

# Token pricing in USD cents
CRYPTO_TOKENS_500_PRICE=599
CRYPTO_TOKENS_1000_PRICE=999
CRYPTO_TOKENS_2500_PRICE=2299
CRYPTO_TOKENS_5000_PRICE=3999
CRYPTO_TOKENS_10000_PRICE=6999

# App URL
NEXT_PUBLIC_APP_URL=https://www.oxmate-ai.com
```

### Step 3: 配置 Webhook URL

In NOWPayments dashboard:

```
Settings → IPN Settings → Callback URL
```

Enter:
```
https://www.oxmate-ai.com/api/nowpayments/ipn
```

Click "Save".

### Step 4: 测试连接

#### Option A: Use pnpm script

```bash
pnpm np-test
```

This will:
- Check environment variables
- Test API connectivity
- Verify currency availability  
- Estimate sample price
- Show comprehensive report

#### Option B: Manual test with curl

```bash
# Test API status
curl -X GET "https://api.nowpayments.io/v1/status" \
  -H "x-api-key: $NOWPAYMENTS_API_KEY"

# Expected response: {"message": "API is working"}
```

#### Expected output:

```
🚀 NOWPayments Configuration Validator
==================================================

🔍 Testing Environment Variables
==================================================
✓ NOWPAYMENTS_API_KEY: J2D7...••••••••••
✓ NOWPAYMENTS_IPN_SECRET: Ut0N...••••••••••
✓ NOWPAYMENTS_PAY_CURRENCY: usdttrc20
✓ NEXT_PUBLIC_APP_URL: https://www.oxmate-ai.com

💰 Token Pricing Configuration:
  ✓ CRYPTO_TOKENS_500_PRICE: $5.99
  ✓ CRYPTO_TOKENS_1000_PRICE: $9.99
  ✓ CRYPTO_TOKENS_2500_PRICE: $22.99
  ✓ CRYPTO_TOKENS_5000_PRICE: $39.99
  ✓ CRYPTO_TOKENS_10000_PRICE: $69.99

🌐 Testing NOWPayments API Connectivity
==================================================
Testing /status endpoint...
✓ API Status: API is working
  → NOWPayments API is ONLINE

💵 Testing Currency Availability
==================================================
✓ Total currencies available: 387
Popular currencies found:
  ✓ BTC
  ✓ ETH
  ✓ USDT

💲 Testing Price Estimation
==================================================
Getting price for $10 USD → USDTTRC20
✓ Estimated amount: 9.98 USDT
  Rate: 0.998 USDT/USD

==================================================
📊 Test Summary
==================================================
Passed: 4/4

✅ All tests passed! Ready for production use.
```

### Step 5: Start Development Server

```bash
pnpm dev
```

Visit: `http://localhost:3000/shop?tab=tokens`

### Step 6: Test Purchase Flow

1. Click on any token package (e.g., "1000 Tokens - $9.99")
2. Select cryptocurrency (USDT TRC-20 recommended)
3. Note the payment address and amount
4. Send exact amount from your wallet
5. Wait for confirmation (~10-60 seconds)
6. Verify credits appear in profile

### Step 7: Verify Webhook Reception

Check the logs:

```bash
# Watch server logs
pnpm dev

# Or check console after sending payment
# You should see:
[shop/tokens] POST error { ... }
[shop/tokens] invoice created: {...}
[crypto_payments] Insert record: { ... }
```

Check database:

```sql
SELECT * FROM crypto_payments 
ORDER BY created_at DESC 
LIMIT 5;
```

Expected status progression:
```
awaiting_payment → confirmed
```

---

## 🎯 Production Checklist

Before going live:

- [ ] Use real wallet addresses (test mode OFF)
- [ ] Set correct app URL in webhook callback
- [ ] Ensure domain is accessible from internet
- [ ] Configure firewall rules if self-hosted
- [ ] Set up monitoring/alerts (optional)
- [ ] Test complete flow with small amount ($1-5)
- [ ] Verify webhook signature verification works
- [ ] Confirm credits are granted automatically
- [ ] Check purchase_history has proper records
- [ ] Review transaction logs for errors

---

## 🔧 Troubleshooting

### Issue: "Invalid signature" error

**Symptoms:** Webhook fails to process, logs show signature mismatch

**Fix:**
1. Verify IPN_SECRET matches exactly
2. Check no trailing whitespace in .env.local
3. Restart dev server to reload env vars

### Issue: Invoice creation fails

**Symptoms:** HTTP 500 error when clicking pay button

**Fix:**
1. Verify API_KEY is valid
2. Check network access to api.nowpayments.io
3. Run `pnpm np-test` to diagnose

### Issue: Payment doesn't confirm

**Symptoms:** Transaction completed but status remains "awaiting_payment"

**Fix:**
1. Check webhook URL is publicly accessible
2. Verify callback URL format in NOWPayments dashboard
3. Test webhook manually with Postman
4. Check firewall doesn't block incoming requests

### Issue: Wrong currency received

**Symptoms:** Received different crypto than selected

**Fix:**
1. Ensure selected currency is enabled in NOWPayments settings
2. Verify user's wallet supports that chain
3. Document supported chains clearly in UI

---

## 💡 Best Practices

### Pricing Strategy

Recommended token pricing (based on industry standards):

| Package | USD | Tokens per $1 | Bonus |
|---------|-----|---------------|-------|
| Starter | $5.99 | ~84 tokens | None |
| Popular | $9.99 | ~100 tokens | None |
| Value | $22.99 | ~109 tokens | +10% |
| Power | $39.99 | ~125 tokens | +25% |
| Pro | $69.99 | ~143 tokens | +43% |

### Security

- Rotate API keys every 90 days
- Never commit `.env.local` to git
- Monitor failed transactions daily
- Set up alerts for unusual patterns
- Keep IPN_SECRET secure

### User Experience

- Display QR codes for easy mobile payments
- Show countdown timer (invoices expire in 15 min)
- Provide clear instructions on each step
- Support multiple currencies for flexibility
- Implement transaction status polling

---

## 📞 Support

**NOWPayments Official:**
- Docs: https://docs.nowpayments.io
- Telegram: @nowpayments_support  
- Email: support@nowpayments.io

**Project-specific help:**
- Check `/docs/NOWPAYMENTS-FULL-CONFIG.md` for detailed guide
- Review source code in `/src/lib/nowpayments-server.ts`
- Inspect test script at `/scripts/test-nowpayments.mjs`

---

**Last Updated:** 2026-09-21  
**Version:** 1.0  
**Author:** [@zxixi778899](https://github.com/zxixi778899)
