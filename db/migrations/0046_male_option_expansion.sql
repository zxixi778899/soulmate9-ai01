-- ============================================================================
-- Migration: 0046_male_option_expansion
-- Description: 男性创建器选项重构为 8 发型 + 8 体型。
--              发型池补 Pompadour / Textured Fringe / Curly Top，
--              体型池补 Toned / Stocky / Bodybuilder（去掉身高项 Tall，
--              Tall 保留在女性池中不受影响）。
--              前端 GENDER_OPTION_SETS.Male 按男性向选品重构。
-- Idempotent: safe to re-run (unique index IF NOT EXISTS + ON CONFLICT DO NOTHING).
-- ============================================================================

BEGIN;

-- 保证 (category, value) 幂等去重（旧库可能缺失）
CREATE UNIQUE INDEX IF NOT EXISTS uq_creator_option_pool_category_value
  ON creator_option_pool (category, value);

-- 新增男性发型（池中已有 Short Crop / Undercut / Buzz Cut / Slicked Back / Man Bun）
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('hair_style', 'Pompadour', 'Pompadour', '飞机头', 15),
  ('hair_style', 'Textured Fringe', 'Textured Fringe', '纹理碎盖', 16),
  ('hair_style', 'Curly Top', 'Curly Top', '蓬松卷顶', 17)
ON CONFLICT (category, value) DO NOTHING;

-- 新增男性体型（池中已有 Slim / Athletic / Tall / Lean / Muscular / Broad）
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('body_type', 'Toned', 'Toned', '紧实型', 11),
  ('body_type', 'Stocky', 'Stocky', '壮实型', 12),
  ('body_type', 'Bodybuilder', 'Bodybuilder', '巨肌型', 13)
ON CONFLICT (category, value) DO NOTHING;

COMMIT;
