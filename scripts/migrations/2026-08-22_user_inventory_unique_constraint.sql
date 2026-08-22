-- ============================================================
-- Fix: user_inventory 补齐唯一约束 user_inventory_unique_asset
--
-- 背景:
--   购买 RPC (purchase_virtual_product / merge_inventory) 使用
--     ON CONFLICT (user_id, asset_type, asset_id)
--   合并消耗品库存，但生产表缺少该唯一约束，报错:
--     there is no unique or exclusion constraint matching the ON CONFLICT specification
--   仓库基线 2026-07-01_virtual_shop.sql 定义了该约束，本迁移将生产对齐仓库。
--
-- 步骤:
--   1) 仅对 asset_id 非空的重复行：数量合并到最早一条（SUM(quantity)）
--   2) 删除其余重复行
--   3) 幂等补齐唯一约束
--   说明: asset_id 为 NULL 的行不参与去重（唯一约束允许多个 NULL，
--         且 NULL 行可能是独立的消耗品购买记录）。
--
-- 执行方式: Supabase Dashboard SQL Editor（生产库）手动执行；幂等可重复执行。
-- ============================================================

-- 1) 重复行的数量合并到保留行（每组最小 id；id::text 比较以兼容不支持 min(uuid) 的引擎）
UPDATE public.user_inventory k
SET quantity = (
  SELECT SUM(t.quantity)
  FROM public.user_inventory t
  WHERE t.user_id = k.user_id
    AND t.asset_type = k.asset_type
    AND t.asset_id = k.asset_id
)
WHERE k.asset_id IS NOT NULL
  AND k.id::text = (
    SELECT MIN(t2.id::text)
    FROM public.user_inventory t2
    WHERE t2.user_id = k.user_id
      AND t2.asset_type = k.asset_type
      AND t2.asset_id = k.asset_id
  );

-- 2) 删除非保留的重复行
DELETE FROM public.user_inventory a
USING (
  SELECT MIN(id::text) AS keep_id, user_id, asset_type, asset_id
  FROM public.user_inventory
  WHERE asset_id IS NOT NULL
  GROUP BY user_id, asset_type, asset_id
  HAVING COUNT(*) > 1
) k
WHERE a.user_id = k.user_id
  AND a.asset_type = k.asset_type
  AND a.asset_id = k.asset_id
  AND a.id::text <> k.keep_id;

-- 3) 幂等补齐唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_inventory_unique_asset'
      AND conrelid = 'public.user_inventory'::regclass
  ) THEN
    ALTER TABLE public.user_inventory
      ADD CONSTRAINT user_inventory_unique_asset
      UNIQUE (user_id, asset_type, asset_id);
  END IF;
END $$;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

-- 验证: 应返回 user_inventory_unique_asset
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.user_inventory'::regclass
  AND contype = 'u';
