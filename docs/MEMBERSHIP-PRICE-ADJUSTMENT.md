# 会员价格调整指南 - Pro $12.99/月

## 📋 价格变更内容

**Pro 套餐月费从：** `~$19.99`  
**改为：** `$12.99`

---

## 🔧 实施步骤

### Step 1: 数据库价格更新（必须）

登录 Supabase Dashboard → SQL Editor，运行以下 SQL：

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

-- Verify the change
SELECT id, name, price_cents, virtual_meta, status, created_at, updated_at
FROM products
WHERE collection = 'membership' 
ORDER BY name;
```

**预期结果**: 
- `price_cents` should be `1299` (not `1999`)
- The query should return at least one row for your Pro package

---

### Step 2: 检查缓存数据

产品价格会缓存在前端，部署后可能需要：

1. **硬刷新浏览器** (Ctrl + Shift + R / Cmd + Shift + R)
2. **清除浏览器缓存**
3. **等待缓存 TTL 过期** (如果设置了的话)

---

### Step 3: 验证价格显示

访问你的网站并检查 Pro 套餐卡片的显示价格应为 **$12.99/月**。

---

## 💡 关于其他货币支持

当前系统仅支持加密货币支付（USDT TRC-20），所以"元"的概念实际上是指美元 USD。如果您想改为人民币计价：

### Option A: 保持 USD 定价（推荐）
直接使用 $12.99 USD，这是国际通用标准。

### Option B: 添加人民币换算逻辑
这需要：
1. 在数据库中为每个产品添加 CNY 字段
2. 在前端根据汇率动态转换
3. 在支付时进行货币换算

目前系统不支持法币直接支付，只接受加密货币，所以建议保持美元定价。

---

## 🔄 批量更新所有会员价格

如果你想同时调整 Premium 和 Unlimited 的价格：

```sql
-- Update all membership prices with new values
UPDATE products 
SET price_cents = CASE 
    WHEN name ILIKE '%Pro%' THEN 1299      -- Pro: $12.99
    WHEN name ILIKE '%Premium%' THEN 2499  -- Premium: $24.99  
    WHEN name ILIKE '%Unlimited%' THEN 4999 -- Unlimited: $49.99
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

-- View all changes
SELECT id, name, price_cents, virtual_meta->>'price_cents' as meta_price_cents
FROM products
WHERE collection = 'membership'
ORDER BY price_cents;
```

---

## ✅ 测试清单

部署后请测试以下项目：

- [ ] 访问 /shop?tab=membership 页面
- [ ] Pro 套餐卡片显示价格为 $12.99（不是 $19.99）
- [ ] 点击购买按钮正常工作
- [ ] 支付流程显示正确金额
- [ ] IPN webhook 记录正确的价格
- [ ] Database crypto_payments 表中的 amount_usd 字段正确

---

## 🆘 回滚方案

如果需要恢复到旧价格：

```sql
-- Rollback to original $19.99 price
UPDATE products 
SET price_cents = 1999,
    virtual_meta = jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '1999'::jsonb
    ),
    updated_at = NOW()
WHERE collection = 'membership' 
  AND name ILIKE '%Pro%'
  AND status = 'active';
```

---

## 📞 需要帮助？

如有任何问题或问题，请访问：
- GitHub Issues: https://github.com/zxixi778899/soulmate9-ai01/issues
- Documentation: docs/SQL-UPDATES/MEMBERSHIP-PRICE-CHANGE.sql

---

Last Updated: 2024-09-23  
Author: Qoder AI Assistant
