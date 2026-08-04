-- 0027: Gift stat boosts (desire / development / kink) + rarity re-sync
--
-- Gifts now add desire / development / kink to the receiving companion in
-- addition to intimacy (src/app/api/gifts/send/route.ts). When the boosted
-- stats cross the universal score thresholds the companion's rarity upgrades
-- automatically (rarity.ts: score = round(avg(3 stats)), 70/80/90 → R/SR/SSR).
--
-- 1) chat_gifts (only if the dedicated table exists — production currently
--    stores gifts in site_settings) gains the three boost columns.
-- 2) Idempotent rarity re-sync of every companion + library preset from the
--    same score rule, so all existing records follow one spec.

DO $$
BEGIN
  IF to_regclass('public.chat_gifts') IS NOT NULL THEN
    ALTER TABLE public.chat_gifts
      ADD COLUMN IF NOT EXISTS desire_boost INT NOT NULL DEFAULT 0;
    ALTER TABLE public.chat_gifts
      ADD COLUMN IF NOT EXISTS development_boost INT NOT NULL DEFAULT 0;
    ALTER TABLE public.chat_gifts
      ADD COLUMN IF NOT EXISTS kink_boost INT NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Re-sync companion rarity from current stats (same rule as 0024)
UPDATE girlfriends
SET rarity = CASE
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 90 THEN 'SSR'
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 80 THEN 'SR'
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 70 THEN 'R'
  ELSE 'N'
END;

-- Re-sync library presets carrying designed traits
UPDATE character_presets
SET rarity = CASE
  WHEN ROUND(((traits->>'base_desire')::int + (traits->>'base_development')::int + (traits->>'base_kink')::int)::numeric / 3) >= 90 THEN 'SSR'
  WHEN ROUND(((traits->>'base_desire')::int + (traits->>'base_development')::int + (traits->>'base_kink')::int)::numeric / 3) >= 80 THEN 'SR'
  WHEN ROUND(((traits->>'base_desire')::int + (traits->>'base_development')::int + (traits->>'base_kink')::int)::numeric / 3) >= 70 THEN 'R'
  ELSE 'N'
END
WHERE traits IS NOT NULL
  AND traits ? 'base_desire'
  AND traits ? 'base_development'
  AND traits ? 'base_kink';

NOTIFY pgrst, 'reload schema';
