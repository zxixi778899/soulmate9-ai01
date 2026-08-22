-- ============================================================
-- Fix: user_inventory.asset_id uuid → text
--
-- Background:
--   购买 RPC purchase_virtual_product 会向 user_inventory.asset_id
--   写入 text 资产 ID（商品 sku / virtual_meta.asset_id 等非 uuid 字符串），
--   但生产库建表时该列被建成 uuid，导致购买报错：
--     column "asset_id" is of type uuid but expression is of type text
--   仓库基线 2026-07-01_virtual_shop.sql 定义该列为 text，本迁移将生产对齐仓库。
--
-- 执行方式：Supabase Dashboard SQL Editor（生产库）手动执行；幂等可重复执行。
-- 说明：ALTER COLUMN TYPE 会自动重建依赖该列的唯一约束
--   user_inventory_unique_asset (user_id, asset_type, asset_id)。
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_inventory'
      AND column_name = 'asset_id'
      AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.user_inventory
      ALTER COLUMN asset_id TYPE text USING asset_id::text;
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- 验证：应返回 text
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_inventory'
  AND column_name = 'asset_id';
