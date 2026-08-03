-- 0024: Universal score-based rarity system (site-wide)
--
-- score = round((base_desire + base_development + base_kink) / 3)
--   score <  70      → N
--   score 70-79      → R
--   score 80-89      → SR
--   score 90-100     → SSR
--
-- New companions roll each stat uniformly in 70-100 at creation time
-- (src/lib/rarity.ts); this migration re-derives the rarity column of every
-- existing companion + library preset from its current stats so the whole
-- site follows one rule.

-- 1) All companions (user-created + system catalog)
UPDATE girlfriends
SET rarity = CASE
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 90 THEN 'SSR'
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 80 THEN 'SR'
  WHEN ROUND((COALESCE(base_desire, 0) + COALESCE(base_development, 0) + COALESCE(base_kink, 0))::numeric / 3) >= 70 THEN 'R'
  ELSE 'N'
END;

-- 2) Library presets carrying designed traits (traits jsonb)
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
