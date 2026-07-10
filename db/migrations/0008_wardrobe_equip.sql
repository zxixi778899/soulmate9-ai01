-- ============================================================
-- Wardrobe / outfits full bootstrap (safe to re-run)
-- Fixes: relation "wardrobe" does not exist
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1) outfits catalog (optional DB mirror; app also has code catalog)
CREATE TABLE IF NOT EXISTS outfits (
  id TEXT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  tier VARCHAR(20) NOT NULL DEFAULT 'free',
  preview_url TEXT,
  category VARCHAR(32) NOT NULL DEFAULT 'everyday',
  intimacy_boost INTEGER NOT NULL DEFAULT 0,
  is_gift BOOLEAN NOT NULL DEFAULT false,
  is_limited BOOLEAN NOT NULL DEFAULT false,
  stock_limit INTEGER,
  stock_remaining INTEGER,
  comfyui_workflow JSONB,
  wear_prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outfits_category_idx ON outfits (category);
CREATE INDEX IF NOT EXISTS outfits_tier_idx ON outfits (tier);

-- 2) wardrobe (user owns outfit for a girlfriend)
-- outfit_id is TEXT slug (e.g. school-uniform), not UUID
CREATE TABLE IF NOT EXISTS wardrobe (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL,
  outfit_id TEXT NOT NULL,
  is_equipped BOOLEAN NOT NULL DEFAULT false,
  gifted BOOLEAN NOT NULL DEFAULT false,
  equipped_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wardrobe_user_id_idx ON wardrobe (user_id);
CREATE INDEX IF NOT EXISTS wardrobe_girlfriend_id_idx ON wardrobe (girlfriend_id);
CREATE UNIQUE INDEX IF NOT EXISTS wardrobe_user_gf_outfit_unique_idx
  ON wardrobe (user_id, girlfriend_id, outfit_id);
CREATE INDEX IF NOT EXISTS idx_wardrobe_equipped
  ON wardrobe (user_id, girlfriend_id)
  WHERE is_equipped = true;

-- If wardrobe already existed without gifted column:
ALTER TABLE wardrobe ADD COLUMN IF NOT EXISTS gifted BOOLEAN DEFAULT false;
ALTER TABLE wardrobe ADD COLUMN IF NOT EXISTS equipped_at TIMESTAMPTZ;

-- If outfit_id was uuid, try widen to text (ignore failure)
DO $$ BEGIN
  ALTER TABLE wardrobe ALTER COLUMN outfit_id TYPE TEXT USING outfit_id::text;
EXCEPTION WHEN others THEN NULL;
END $$;

-- 3) girlfriend equip fields
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS equipped_outfit_id TEXT,
  ADD COLUMN IF NOT EXISTS base_portrait_url TEXT,
  ADD COLUMN IF NOT EXISTS equipped_outfit_name TEXT;

-- 4) seed free catalog outfits (idempotent)
INSERT INTO outfits (id, name, description, price_cents, tier, category, intimacy_boost, wear_prompt) VALUES
  ('casual-elegance', 'Casual Elegance', 'Fitted blazer over silk camisole', 0, 'free', 'everyday', 1,
   'wearing a sophisticated casual outfit: fitted blazer over silk camisole, tailored high-waist trousers'),
  ('evening-gown', 'Evening Gown', 'Floor-length gown for romantic dinners', 0, 'free', 'formal', 2,
   'wearing a stunning floor-length evening gown with soft draping fabric'),
  ('silk-lingerie', 'Silk Lingerie', 'Delicate silk lingerie for intimate moments', 0, 'free', 'intimate', 3,
   'wearing delicate silk lingerie set, soft lace details, intimate boudoir aesthetic'),
  ('school-uniform', 'School Uniform', 'Classic schoolgirl outfit', 500, 'free', 'costume', 2,
   'wearing a classic school uniform: white blouse, pleated skirt, ribbon tie'),
  ('summer-breeze', 'Summer Breeze', 'Light sundress for warm days', 0, 'free', 'everyday', 1,
   'wearing a light airy sundress, soft floral pattern, summer breeze vibe'),
  ('sporty-spice', 'Sporty Spice', 'Athletic wear', 0, 'free', 'everyday', 1,
   'wearing form-fitting athletic sports bra and leggings, gym-ready look'),
  ('maid-costume', 'French Maid', 'Adorable maid dress with lace trim', 800, 'premium', 'costume', 4,
   'wearing a classic French maid costume: black dress with white lace apron'),
  ('bunny-suit', 'Bunny Suit', 'Playful bunny costume', 499, 'premium', 'costume', 5,
   'wearing a classic bunny suit: glossy black bodysuit, bunny ears, bow tie collar'),
  ('royal-corset', 'Royal Corset', 'Victorian-inspired corset dress', 799, 'premium', 'formal', 4,
   'wearing an elegant Victorian-inspired corset dress with structured bodice'),
  ('evening-gown-sapphire', 'Sapphire Evening Gown', 'Deep blue glamorous gown', 1500, 'premium', 'formal', 5,
   'wearing a deep sapphire blue evening gown, shimmering fabric'),
  ('leather-lace', 'Leather & Lace', 'Edgy leather jacket over lace', 599, 'premium', 'edgy', 4,
   'wearing an edgy leather moto jacket over delicate lace top'),
  ('fantasy-dream', 'Fantasy Dream', 'Ethereal fantasy ensemble', 1299, 'unlimited', 'fantasy', 7,
   'wearing an ethereal fantasy ensemble with flowing translucent fabrics'),
  ('kimono-night', 'Kimono Night', 'Silk kimono with modern elegance', 999, 'unlimited', 'formal', 5,
   'wearing a luxurious silk kimono with modern elegant cut')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  wear_prompt = EXCLUDED.wear_prompt,
  intimacy_boost = EXCLUDED.intimacy_boost;

COMMENT ON TABLE wardrobe IS 'User-owned outfits bound to girlfriends; is_equipped = currently worn';
COMMENT ON COLUMN girlfriends.equipped_outfit_id IS 'Catalog slug of currently worn outfit';
COMMENT ON COLUMN girlfriends.base_portrait_url IS 'Portrait before outfit regenerate';
