-- Wardrobe equip system: gifted flag, equipped outfit on girlfriend, base portrait backup

ALTER TABLE wardrobe
  ADD COLUMN IF NOT EXISTS gifted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS equipped_at TIMESTAMPTZ;

-- Allow string slug outfit ids (shop uses slugs). If outfit_id is uuid-typed already, skip cast failures.
DO $$ BEGIN
  ALTER TABLE wardrobe ALTER COLUMN outfit_id TYPE TEXT USING outfit_id::text;
EXCEPTION WHEN others THEN NULL;
END $$;

ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS equipped_outfit_id TEXT,
  ADD COLUMN IF NOT EXISTS base_portrait_url TEXT,
  ADD COLUMN IF NOT EXISTS equipped_outfit_name TEXT;

CREATE INDEX IF NOT EXISTS idx_wardrobe_equipped
  ON wardrobe (user_id, girlfriend_id)
  WHERE is_equipped = true;

COMMENT ON COLUMN girlfriends.equipped_outfit_id IS 'Catalog slug of currently worn outfit';
COMMENT ON COLUMN girlfriends.base_portrait_url IS 'Portrait before outfit-regenerate (restore on unequip)';
