-- Update Pro membership price from $19.99 to $12.99
-- Products table schema: id, name, type (virtual), status, price_cents, virtual_meta (JSONB)
-- Run this in your Supabase SQL Editor

-- First, let's see what membership products exist
SELECT 
    id, 
    name, 
    type,
    status,
    price_cents / 100.0 as price_usd,
    virtual_meta->>'kind' as product_kind,
    virtual_meta->>'membership_tier' as tier_name
FROM products
WHERE type = 'virtual'
  AND status = 'active'
ORDER BY name;

-- Now update Pro membership price
UPDATE products 
SET price_cents = 1299, -- Changed from $19.99 (1999 cents) to $12.99 (1299 cents)
    virtual_meta = jsonb_set(
        COALESCE(virtual_meta, '{}'::jsonb),
        '{price_cents}',
        '1299'::jsonb
    ),
    updated_at = NOW()
WHERE type = 'virtual' 
  AND status = 'active'
  AND virtual_meta->>'kind' = 'membership';

-- Verify the change was successful
SELECT 
    id, 
    name, 
    price_cents / 100.0 as price_usd,
    virtual_meta->>'kind' as product_kind,
    virtual_meta->>'membership_tier' as tier_name,
    status
FROM products
WHERE type = 'virtual' 
  AND status = 'active'
  AND virtual_meta->>'kind' = 'membership'
ORDER BY name;

-- Expected output should show price_cents = 1299 for your Pro package(s)
