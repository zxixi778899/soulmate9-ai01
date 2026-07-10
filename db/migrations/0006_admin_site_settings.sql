-- Site key-value settings for admin CMS
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Ensure token_packages exists (commerce)
CREATE TABLE IF NOT EXISTS token_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL,
  token_count INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS token_packages_active_idx ON token_packages (is_active);
CREATE INDEX IF NOT EXISTS token_packages_sort_idx ON token_packages (sort_order);

-- Ensure featured_girlfriends exists
CREATE TABLE IF NOT EXISTS featured_girlfriends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_girlfriend_id UUID,
  name VARCHAR(64) NOT NULL,
  subtitle VARCHAR(128),
  personality_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  avatar_url TEXT NOT NULL,
  quick_chat_enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  greeting_message TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS featured_girlfriends_sort_idx ON featured_girlfriends (sort_order);
CREATE INDEX IF NOT EXISTS featured_girlfriends_active_idx ON featured_girlfriends (is_active);

-- Seed default token packs if empty
INSERT INTO token_packages (id, name, token_count, price_cents, is_featured, sort_order)
SELECT gen_random_uuid(), v.name, v.token_count, v.price_cents, v.is_featured, v.sort_order
FROM (VALUES
  ('Starter Pack', 100, 499, false, 1),
  ('Popular Pack', 500, 1999, true, 2),
  ('Best Value', 1000, 3499, false, 3)
) AS v(name, token_count, price_cents, is_featured, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM token_packages LIMIT 1);
