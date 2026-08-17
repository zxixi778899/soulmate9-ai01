-- ============================================================================
-- Migration: 0044_unified_preset_library
-- Description: Unify all preset systems into gen_preset_catalog with 3
--              main categories: prompt | pose | scene.
--              - 'prompt': migrated from site_settings prompt_presets +
--                           generation_presets (checkpoint/LoRA stacks)
--              - 'pose':   existing pose category + action references
--              - 'scene':  existing scene/outfit/style/mood converged,
--                           + pregen_scene_templates migrated in
-- Idempotent: safe to re-run (IF NOT EXISTS everywhere).
-- ============================================================================

BEGIN;

-- 1) Expand category CHECK to include 'prompt'.
--    Existing: scene | pose | outfit | style | mood
--    Target:   prompt | pose | scene | outfit | style | mood
--    (outfit/style/mood kept for backward compat; new UI groups them under scene)
ALTER TABLE gen_preset_catalog
    DROP CONSTRAINT IF EXISTS gen_preset_catalog_category_check;

ALTER TABLE gen_preset_catalog
    ADD CONSTRAINT gen_preset_catalog_category_check
    CHECK (category IN ('prompt', 'pose', 'scene', 'outfit', 'style', 'mood'));

-- 2) Add preset_group for sub-grouping within categories.
--    prompt: 'flux' | 'sdxl' | 'custom' | 'lora_stack'
--    pose:   'standing' | 'sitting' | 'action' | 'nsfw' | 'couple'
--    scene:  'portrait' | 'selfie' | 'outfit' | 'mood' | 'nsfw' | 'environment'
ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS preset_group VARCHAR(32) DEFAULT '';

-- 3) Add extra_params JSONB for category-specific metadata.
--    prompt: { checkpoint, sampler, scheduler, steps, cfg, width, height }
--    pose:   { controlnet_weight, reference_type }
--    scene:  { template_weight, aspect_ratio }
ALTER TABLE gen_preset_catalog ADD COLUMN IF NOT EXISTS extra_params JSONB DEFAULT '{}'::jsonb;

-- 4) Seed prompt presets from DEFAULT_PROMPT_PRESETS (prompt-presets-store.ts).
--    These are the FLUX prompt presets that were stored in site_settings.
INSERT INTO gen_preset_catalog
    (category, slug, label_en, label_zh, preset_group, prompt_fragment,
     negative_fragment, nsfw_level, tier, model_family, sort_order, is_active,
     extra_params, gender, style_family)
VALUES
    ('prompt', 'flux-studio', 'Studio Portrait FLUX', '影棚肖像 FLUX', 'flux',
     'photorealistic three-quarter body portrait of a gorgeous young adult woman age 23-28, looking at viewer, sharp detailed face and eyes, natural skin texture, large breasts, wide hips, hourglass figure, bright studio softbox lighting, clean backdrop, professional fashion photo, 8k, crisp clear vibrant',
     '', 0, 'free', 'flux', 10, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-golden', 'Golden Hour FLUX', '金色时刻 FLUX', 'flux',
     'photorealistic three-quarter portrait of a stunning young woman outdoors at golden hour, warm sunlight on face, looking at viewer with soft smile, sharp detailed face, natural skin, large breasts, wide hips, sexy figure, bright well-lit, romantic atmosphere, 8k ultra photorealistic',
     '', 0, 'free', 'flux', 20, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-boudoir', 'Boudoir FLUX', '卧室私房 FLUX', 'flux',
     'photorealistic three-quarter portrait of a gorgeous young woman reclining on white sheets, looking at viewer, seductive expression, soft parted lips, sharp focus face, natural skin pores, large breasts, wide hips, bright window light, well-lit bedroom, intimate editorial, 8k photorealistic',
     '', 3, 'premium', 'flux', 30, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-cafe', 'Cafe FLUX', '咖啡馆 FLUX', 'flux',
     'photorealistic three-quarter portrait of a charming young woman at a cafe table, looking at viewer, warm smile, coffee cup, natural daylight through window, sharp detailed face, large breasts, hourglass figure, bright clear image, 8k photorealistic',
     '', 0, 'free', 'flux', 40, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-city', 'City Night FLUX', '城市夜景 FLUX', 'flux',
     'photorealistic three-quarter portrait of a stylish young woman on a city street at night, neon reflections, looking at viewer confidently, sharp face, large breasts, wide hips, well-lit by neon and street lights, crisp details, 8k cinematic photoreal',
     '', 0, 'free', 'flux', 50, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-pool', 'Pool Day FLUX', '泳池假日 FLUX', 'flux',
     'photorealistic three-quarter portrait of a gorgeous young woman by a turquoise pool, sun-kissed skin, looking at viewer playfully, swimsuit, large breasts, wide hips, thick thighs, bright midday sunlight, sharp focus, detailed face, vibrant colors, 8k photorealistic',
     '', 2, 'free', 'flux', 60, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-outfit', 'Outfit Display FLUX', '服装展示 FLUX', 'flux',
     'sexy cosplay costume as game wardrobe item, invisible ghost mannequin, full garment front view, centered product, dark studio inventory backdrop, sharp fabric detail, 8k game asset render, clothing only',
     'person, face, hands, skin, model, blurry, low quality, watermark, text', 0, 'free', 'flux', 70, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic'),

    ('prompt', 'flux-prop', 'Fantasy Prop FLUX', '特效道具 FLUX', 'flux',
     'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, centered product, dark UI backdrop, sharp details, 8k game asset',
     'person, face, body, hands, blurry, low quality, watermark, text', 0, 'free', 'flux', 80, true,
     '{"steps": 28, "cfg": 3.5, "sampler": "euler", "scheduler": "simple", "width": 704, "height": 960}'::jsonb,
     'all', 'realistic')
ON CONFLICT (category, slug) WHERE category = 'prompt' DO UPDATE SET
    label_en = EXCLUDED.label_en,
    label_zh = EXCLUDED.label_zh,
    prompt_fragment = EXCLUDED.prompt_fragment,
    negative_fragment = EXCLUDED.negative_fragment,
    nsfw_level = EXCLUDED.nsfw_level,
    tier = EXCLUDED.tier,
    model_family = EXCLUDED.model_family,
    sort_order = EXCLUDED.sort_order,
    is_active = EXCLUDED.is_active,
    extra_params = EXCLUDED.extra_params,
    preset_group = EXCLUDED.preset_group,
    updated_at = now();

-- 5) Re-create index to include new category.
DROP INDEX IF EXISTS idx_gen_preset_active;
CREATE INDEX IF NOT EXISTS idx_gen_preset_active
    ON gen_preset_catalog (category, sort_order)
    WHERE is_active;

DROP INDEX IF EXISTS idx_gen_preset_matrix_lookup;
CREATE INDEX IF NOT EXISTS idx_gen_preset_matrix_lookup
    ON gen_preset_catalog (category, gender, style_family, nsfw_level, sort_order)
    WHERE is_active;

-- Index for preset_group filtering.
CREATE INDEX IF NOT EXISTS idx_gen_preset_group
    ON gen_preset_catalog (category, preset_group, sort_order)
    WHERE is_active;

COMMIT;
