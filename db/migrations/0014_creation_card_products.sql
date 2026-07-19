-- 0014_creation_card_products.sql
-- Adds creation card products to the shop.
-- Creation cards are consumed when creating a new companion.
-- Free users get 1 free card (already set in migration 0013).
-- Pro: 3/month, Unlimited: 5/month (auto-refill in creation-cards.ts).
-- Additional cards can be purchased from the shop.
--
-- Run once in Supabase SQL editor.

-- ── Safety: ensure products table exists with all required columns ────────────
-- The products table may have been created from an older schema that is missing
-- columns like type, display_order, is_new, etc.  This block creates the table
-- if absent, then adds any missing columns one-by-one.
DO $$
BEGIN
  -- 1. Create table if it doesn't exist at all
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'products') THEN
    CREATE TABLE products (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      type text NOT NULL DEFAULT 'virtual',
      sku text UNIQUE NOT NULL,
      name text NOT NULL,
      description text,
      category text NOT NULL,
      subcategory text,
      price_cents int NOT NULL DEFAULT 0,
      price_credits int NOT NULL DEFAULT 0,
      compare_at_price_cents int,
      images jsonb DEFAULT '[]'::jsonb,
      tags text[] DEFAULT '{}',
      virtual_meta jsonb DEFAULT '{}'::jsonb,
      rarity text DEFAULT 'common',
      stock_type text DEFAULT 'unlimited',
      stock_remaining int,
      physical_meta jsonb,
      inventory_count int DEFAULT 0,
      is_adult_only boolean DEFAULT true,
      age_verification_required boolean DEFAULT true,
      status text DEFAULT 'active',
      is_active boolean DEFAULT true,
      is_featured boolean DEFAULT false,
      is_new boolean DEFAULT false,
      display_order int DEFAULT 0,
      sales_count int DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;

  -- 2. Add any missing columns (idempotent)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'type') THEN
    ALTER TABLE products ADD COLUMN type text NOT NULL DEFAULT 'virtual';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'sku') THEN
    ALTER TABLE products ADD COLUMN sku text UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'category') THEN
    ALTER TABLE products ADD COLUMN category text NOT NULL DEFAULT 'consumable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'subcategory') THEN
    ALTER TABLE products ADD COLUMN subcategory text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_credits') THEN
    ALTER TABLE products ADD COLUMN price_credits int NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'rarity') THEN
    ALTER TABLE products ADD COLUMN rarity text DEFAULT 'common';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'virtual_meta') THEN
    ALTER TABLE products ADD COLUMN virtual_meta jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'images') THEN
    ALTER TABLE products ADD COLUMN images jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_featured') THEN
    ALTER TABLE products ADD COLUMN is_featured boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_new') THEN
    ALTER TABLE products ADD COLUMN is_new boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'display_order') THEN
    ALTER TABLE products ADD COLUMN display_order int DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'status') THEN
    ALTER TABLE products ADD COLUMN status text DEFAULT 'active';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'is_active') THEN
    ALTER TABLE products ADD COLUMN is_active boolean DEFAULT true;
  END IF;

  -- 3. Ensure NOT NULL columns have defaults (existing columns may lack them)
  -- price_cents
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_cents') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'price_cents' AND column_default IS NOT NULL) THEN
      ALTER TABLE products ALTER COLUMN price_cents SET DEFAULT 0;
    END IF;
    UPDATE products SET price_cents = 0 WHERE price_cents IS NULL;
  END IF;
  -- compare_at_price_cents
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'compare_at_price_cents') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'compare_at_price_cents' AND column_default IS NOT NULL) THEN
      ALTER TABLE products ALTER COLUMN compare_at_price_cents SET DEFAULT 0;
    END IF;
    UPDATE products SET compare_at_price_cents = 0 WHERE compare_at_price_cents IS NULL;
  END IF;
END $$;

-- ── Creation card products ────────────────────────────────────────────────────

INSERT INTO products (type, sku, name, description, category, subcategory, price_cents, compare_at_price_cents, price_credits, rarity, virtual_meta, images, is_featured, is_new, display_order, status)
VALUES
  ('virtual', 'CARD-CREATOR-001', 'Creation Card x1',
   'Create a new AI companion. One use.',
   'consumable', 'creation_card', 0, 0, 200, 'common',
   '{"collection":"creator","kind":"creation_card","card_amount":1}'::jsonb,
   '[]'::jsonb, false, true, 1, 'active'),

  ('virtual', 'CARD-CREATOR-003', 'Creation Card x3',
   'Create three new AI companions. Save 15% vs single cards.',
   'consumable', 'creation_card', 0, 0, 500, 'rare',
   '{"collection":"creator","kind":"creation_card","card_amount":3}'::jsonb,
   '[]'::jsonb, true, true, 2, 'active'),

  ('virtual', 'CARD-CREATOR-010', 'Creation Card x10',
   'Create ten new AI companions. Best value pack.',
   'consumable', 'creation_card', 0, 0, 1500, 'epic',
   '{"collection":"creator","kind":"creation_card","card_amount":10}'::jsonb,
   '[]'::jsonb, true, false, 3, 'active');

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running, reload PostgREST schema cache:
NOTIFY pgrst, 'reload schema';
