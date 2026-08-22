-- ============================================================================
-- Migration: 0046_male_option_expansion
-- Description: 男性创建器选项重构为 8 发型 + 8 体型。
--              发型池补 Pompadour / Textured Fringe / Curly Top / Bald / Long Hair，
--              体型池补 Balanced / Twink / Stocky / Bodybuilder / Dad Bod / Bear。
--              前端 GENDER_OPTION_SETS.Male 按用户指定选品重构；
--              旧池值保留不删（存量 girlfriends 行与预设仍引用）。
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
  ('hair_style', 'Curly Top', 'Curly Top', '蓬松卷顶', 17),
  ('hair_style', 'Bald', 'Bald', '光头', 18),
  ('hair_style', 'Long Hair', 'Long Hair', '长发', 19)
ON CONFLICT (category, value) DO NOTHING;

-- 新增男性体型（池中已有 Slim / Athletic / Tall / Lean / Muscular / Broad）
INSERT INTO creator_option_pool (category, value, label_en, label_zh, sort_order)
VALUES
  ('body_type', 'Balanced', 'Balanced', '均匀', 11),
  ('body_type', 'Twink', 'Twink', '正太', 12),
  ('body_type', 'Stocky', 'Stocky', '壮实', 13),
  ('body_type', 'Bodybuilder', 'Bodybuilder', '巨肌', 14),
  ('body_type', 'Dad Bod', 'Dad Bod', '大肚腩', 15),
  ('body_type', 'Bear', 'Bear', '胖熊', 16)
ON CONFLICT (category, value) DO NOTHING;

-- 标签归一：旧版 0046 已插入过的值统一成新标签（幂等）
UPDATE creator_option_pool
SET label_zh = '壮实'
WHERE category = 'body_type' AND value = 'Stocky';

UPDATE creator_option_pool
SET label_zh = '巨肌'
WHERE category = 'body_type' AND value = 'Bodybuilder';

COMMIT;
