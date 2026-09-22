-- Update Pro membership price from $19.99 to $12.99
-- Run this in your Supabase SQL Editor

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
