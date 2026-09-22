# Pro 会员价格调整 - $12.99/月

## 📋 任务概述

将 Pro 套餐的价格从 `$19.99` 调整为 `$12.99` 每月。

**注意**: 您提到的"元"在国际加密货币支付场景中通常指的是美元（USD），因为系统使用 NOWPayments 接受 USDT 稳定币，而 USDT 是与美元挂钩的。

---

## 🔧 修改步骤

### Step 1: 更新数据库中的产品价格

这是最重要的步骤，实际的产品价格在数据库中而不是代码中。

**操作方法**:

1. 登录 Supabase Dashboard
2. 进入 **SQL Editor**
3. 运行以下 SQL 脚本：

```sql
-- Update Pro membership price from $19.99 to $12.99
UPDATE products 
SET price_cents = 1299, -- Changed from $19.99 (1999 cents) to $12.99 (1299 cents)
    virtual_meta = jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '1299'::jsonb
    ),
    updated_at = NOW()
WHERE collection = 'membership' 
  AND name ILIKE '%Pro%'
  AND status = 'active';

-- Verify the change was successful
SELECT 
    id, 
    name, 
    price_cents as price_in_cents,
    price_cents / 100.0 as price_in_dollars,
    virtual_meta->>'price_cents' as meta_price_cents,
    status,
    created_at,
    updated_at
FROM products
WHERE collection = 'membership' 
ORDER BY name;

-- Expected output should show price_cents = 1299 for your Pro package
```

**预期结果**: 
- `price_cents` should be `1299`（即 $12.99）
- `meta_price_cents` should also be `1299`
- The query should return at least one row matching your Pro package criteria

---

### Step 2: 清除缓存并验证

产品价格会缓存在前端，部署后可能需要：

1. **硬刷新浏览器** (Ctrl + Shift + R / Cmd + Shift + R)
2. **清除浏览器缓存**
3. **等待缓存 TTL 过期**（如果网站设置了缓存）
4. **测试无痕模式**确保不是本地缓存问题

---

### Step 3: 前端显示验证

访问你的网站并检查以下内容：

**Shop/Membership Page (/shop?tab=membership)**:
- [ ] Pro 套餐卡片应显示价格为 **$12.99/月**
- [ ] 不要显示折扣价或其他旧价格

**购买流程**:
- [ ] 点击 "Buy" 按钮
- [ ] 弹出的支付对话框应该显示 **$12.99**
- [ ] QR Code 界面正确显示金额

**Database Verification**:
```sql
-- Check recent crypto_payments for accurate amounts
SELECT 
    user_id,
    amount_usd,
    currency,
    status,
    created_at
FROM crypto_payments
ORDER BY created_at DESC
LIMIT 5;

-- amount_usd should reflect $12.99 or close to it
```

---

## 💡 关于"元"与"USD"的说明

由于你的支付系统只接受加密货币（USDT TRC-20 为主），而 USDT 是锚定美元的稳定币，所以：

1. **价格标注**: 仍然使用 `$12.99 USD` 或 `$12.99`
2. **用户支付**: 实际支付的是等值 USDT（根据当前汇率）
3. **后端接收**: API 调用 NOWPayments 时发送的是 USD 金额

如果你确实想用人民币标价，需要：
- 添加 CNY 定价字段到 products 表
- 实现实时汇率换算逻辑
- 在支付网关层面支持货币转换

这超出了当前仅加密货币支付的系统设计范围。**建议保持美元定价**。

---

## 🔄 批量更新其他套餐（可选）

如果你还想同时调整 Premium 和 Unlimited 套餐的价格：

```sql
-- Update all membership tiers with new pricing
UPDATE products 
SET price_cents = CASE 
    WHEN name ILIKE '%Pro%' THEN 1299      -- Pro: $12.99/month
    WHEN name ILIKE '%Premium%' THEN 2499  -- Premium: $24.99/month  
    WHEN name ILIKE '%Unlimited%' THEN 4999 -- Unlimited: $49.99/month
END,
virtual_meta = CASE
    WHEN name ILIKE '%Pro%' THEN jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '1299'::jsonb
    )
    WHEN name ILIKE '%Premium%' THEN jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '2499'::jsonb
    )
    WHEN name ILIKE '%Unlimited%' THEN jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '4999'::jsonb
    )
ELSE virtual_meta
END,
updated_at = NOW()
WHERE collection = 'membership' 
AND status = 'active';

-- View all membership products after update
SELECT 
    id, 
    name, 
    price_cents / 100.0 as price_usd,
    virtual_meta->>'price_cents' as meta_price_cents,
    category,
    subcategory
FROM products
WHERE collection = 'membership'
ORDER BY price_cents;
```

---

## ✅ 完整测试清单

部署并更新数据库后，请执行以下测试：

### UI/UX Tests
- [ ] Visit `/shop?tab=membership`
- [ ] Pro card displays **$12.99/month** (not $19.99)
- [ ] Click "Use USDT to Pay" button works smoothly
- [ ] Payment modal shows correct amount ($12.99)
- [ ] QR code dialog appears correctly
- [ ] No console errors in browser DevTools

### Database Tests
- [ ] Run verification query - price_cents = 1299
- [ ] Products table updated correctly
- [ ] Virtual metadata contains price_cents field
- [ ] Updated timestamp recorded

### Purchase Flow Tests
- [ ] Initiate payment for Pro plan
- [ ] POST /api/crypto/embed-payment returns success
- [ ] Crypto dialog shows $12.99 amount
- [ ] Complete test transaction (if possible)
- [ ] crypto_payments table records $12.99
- [ ] IPN webhook triggers successfully
- [ ] User membership_tier upgrades appropriately

### Edge Case Tests
- [ ] Multiple users see same price
- [ ] Price persists across sessions
- [ ] Cache invalidation works (hard refresh required?)
- [ ] Mobile view also shows correct price

---

## 🆘 故障排查

### Problem: Price still showing $19.99 after DB update

**Possible causes**:
1. Frontend cache not cleared
2. CDN caching old data
3. API response cached

**Solutions**:
```bash
# Clear browser cache completely
# Or use incognito/private browsing mode

# Force-reload Vercel deployment if needed
vercel redeploy --force

# Check Network tab for product API responses
# F12 → Network → Look for /api/shop/v2/products
```

### Problem: Product query returns no results

**Check if package exists**:
```sql
-- Find all membership products first
SELECT * FROM products 
WHERE collection = 'membership';

-- Verify exact naming pattern
SELECT DISTINCT name FROM products 
WHERE collection = 'membership';
```

Then adjust your UPDATE WHERE clause accordingly.

---

## 📞 需要帮助？

如有任何问题：
- GitHub Issues: https://github.com/zxixi778899/soulmate9-ai01/issues
- Documentation: docs/MEMBERSHIP-PRICE-ADJUSTMENT.md
- SQL Script: docs/SQL-UPDATES/MEMBERSHIP-PRICE-CHANGE.sql

---

Last Updated: 2024-09-23  
Status: Ready for database deployment
