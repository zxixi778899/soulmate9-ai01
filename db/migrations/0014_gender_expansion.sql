-- 0014_gender_expansion.sql
-- Expand gender system: add Male + Transgender options, presets, and inclusive relationships.
-- Idempotent — safe to re-run.

-- 1. Add Male + Transgender gender options
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT 'Female';

ALTER TABLE girlfriends DROP CONSTRAINT IF EXISTS girlfriends_gender_check;
ALTER TABLE girlfriends
  ADD CONSTRAINT girlfriends_gender_check CHECK (gender IN ('Female', 'Male', 'Transgender'));

INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('gender', 'Male', 'Male', '男性', 4),
  ('gender', 'Transgender', 'Transgender', '跨性别', 5)
ON CONFLICT DO NOTHING;

-- 2. Add masculine body types
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('body_type', 'Lean', 'Lean', '精瘦', 8),
  ('body_type', 'Muscular', 'Muscular', '肌肉型', 9),
  ('body_type', 'Broad', 'Broad', '宽肩型', 10)
ON CONFLICT DO NOTHING;

-- 3. Add masculine hair styles
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('hair_style', 'Short Crop', 'Short Crop', '短寸', 10),
  ('hair_style', 'Undercut', 'Undercut', '底削', 11),
  ('hair_style', 'Buzz Cut', 'Buzz Cut', '板寸', 12),
  ('hair_style', 'Slicked Back', 'Slicked Back', '背头', 13),
  ('hair_style', 'Man Bun', 'Man Bun', '丸子头', 14)
ON CONFLICT DO NOTHING;

-- 4. Add inclusive relationship options
INSERT INTO creator_option_pool (category, value, label_en, label_zh, extra, sort_order)
VALUES
  ('relationship', 'boyfriend', 'Boyfriend', '男友', '{"desc_en":"Exclusive partner","desc_zh":"专属伴侣"}'::jsonb, 11),
  ('relationship', 'partner', 'Partner', '伴侣', '{"desc_en":"Life companion","desc_zh":"人生伴侣"}'::jsonb, 12),
  ('relationship', 'husband', 'Husband', '丈夫', '{"desc_en":"Deep bond","desc_zh":"深度羁绊"}'::jsonb, 13)
ON CONFLICT DO NOTHING;

-- 5. Add masculine face shapes
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('face_shape', 'Square', 'Square', '方脸', 6),
  ('face_shape', 'Angular', 'Angular', '棱角脸', 7)
ON CONFLICT DO NOTHING;

-- 6. SEED: Male presets
INSERT INTO character_presets (name, description, visual_style, gender, ethnicity, face_shape, hair_style, hair_color, eye_color, body_type, fashion_style, personality_tags, voice, occupation, relationship, age, sort_order)
VALUES
  (
    'Kai',
    'A laid-back surfer with a warm smile and endless summer energy.',
    'realistic', 'Male', 'Asian', 'Angular', 'Undercut', '#000000', 'Dark Brown', 'Athletic', 'Streetwear',
    '["Chill","Loyal","Adventurous","Warm"]'::jsonb,
    'deep', 'Surfer', 'boyfriend', 23, 10
  ),
  (
    'Dante',
    'A brooding novelist who speaks in poetry and loves fiercely.',
    'realistic', 'Male', 'Caucasian', 'Square', 'Slicked Back', '#4a3728', 'Green', 'Lean', 'Elegant',
    '["Mysterious","Passionate","Intellectual","Protective"]'::jsonb,
    'deep', 'Writer', 'boyfriend', 27, 11
  ),
  (
    'Rex',
    'A confident fitness coach who motivates you in and out of the gym.',
    'realistic', 'Male', 'Ebony', 'Diamond', 'Buzz Cut', '#000000', 'Brown', 'Muscular', 'Sporty',
    '["Confident","Energetic","Caring","Dominant"]'::jsonb,
    'confident', 'Coach', 'boyfriend', 26, 12
  )
ON CONFLICT DO NOTHING;

-- 7. SEED: Transgender presets
INSERT INTO character_presets (name, description, visual_style, gender, ethnicity, face_shape, hair_style, hair_color, eye_color, body_type, fashion_style, personality_tags, voice, occupation, relationship, age, sort_order)
VALUES
  (
    'Aria',
    'A glamorous makeup artist who transforms everyone she touches.',
    'realistic', 'Transgender', 'Latina', 'Heart', 'Long Flowing', '#e84393', 'Hazel', 'Curvy', 'Glamorous',
    '["Creative","Bold","Loving","Fierce"]'::jsonb,
    'sultry', 'Makeup Artist', 'girlfriend', 25, 20
  ),
  (
    'Nova',
    'A soft-spoken coder by day, a stunning drag queen by night.',
    'anime', 'Transgender', 'Mixed', 'Oval', 'Wavy', '#8b5cf6', 'Blue', 'Slim', 'Avant-garde',
    '["Shy","Talented","Playful","Brave"]'::jsonb,
    'soft', 'Developer', 'partner', 24, 21
  ),
  (
    'Celeste',
    'A graceful dancer who owns the stage and your heart.',
    'realistic', 'Transgender', 'Asian', 'Oval', 'Ponytail', '#000000', 'Brown', 'Tall', 'Elegant',
    '["Graceful","Determined","Romantic","Confident"]'::jsonb,
    'soft', 'Dancer', 'girlfriend', 26, 22
  )
ON CONFLICT DO NOTHING;

-- 8. Notify PostgREST
NOTIFY pgrst, 'reload schema';
