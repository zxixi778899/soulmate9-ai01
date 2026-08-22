-- ============================================================
-- 0047 会员体系重构（四档新口径）
-- Free 20条/日聊天仅聊官方预设 · Pro/Premium/Unlimited 创建+生成
-- 生图/TTS/NSFW/视频全走积分 · 创建卡 0/3/6/10 张/月 · 视频仅 Premium+
-- Supabase Dashboard → SQL Editor → 粘贴 → Run（幂等可重跑）
-- ============================================================

BEGIN;

-- ── A) 创建卡：复用现有 profiles.creation_cards 体系（creation-cards.ts）──
-- 月度配额已改为 Free 0 / Pro 3 / Premium 6 / Unlimited 10（代码侧月初自动补充）。
-- Free 档收回存量一次性免费卡（新口径：免费用户不能创建伴侣）。
UPDATE profiles
SET creation_cards = 0
WHERE COALESCE(membership_tier, 'free') = 'free'
  AND COALESCE(creation_cards, 0) > 0;

-- ── B) 聊天日限额同步到 ai_modules（site_settings JSONB）──
-- value.chat.tiers.<tier>.daily_message_limit:
--   free 20 / pro 100 / premium 300 / unlimited null(无限)
-- 仅当 ai_modules 行存在时更新；premium tier 不存在则基于 pro 复制后改限额。
UPDATE site_settings
SET value = jsonb_set(
      value,
      '{chat,tiers,free,daily_message_limit}',
      '20'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'ai_modules'
  AND value #> '{chat,tiers,free}' IS NOT NULL;

UPDATE site_settings
SET value = jsonb_set(
      value,
      '{chat,tiers,pro,daily_message_limit}',
      '100'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'ai_modules'
  AND value #> '{chat,tiers,pro}' IS NOT NULL;

-- premium tier：不存在时以 pro 配置为模板克隆，再覆盖限额
UPDATE site_settings
SET value = jsonb_set(
      value,
      '{chat,tiers,premium}',
      COALESCE(value #> '{chat,tiers,premium}', value #> '{chat,tiers,pro}', '{}'::jsonb),
      true
    ),
    updated_at = now()
WHERE key = 'ai_modules'
  AND value #> '{chat,tiers}' IS NOT NULL;

UPDATE site_settings
SET value = jsonb_set(
      value,
      '{chat,tiers,premium,daily_message_limit}',
      '300'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'ai_modules'
  AND value #> '{chat,tiers,premium}' IS NOT NULL;

UPDATE site_settings
SET value = jsonb_set(
      value,
      '{chat,tiers,unlimited,daily_message_limit}',
      'null'::jsonb,
      true
    ),
    updated_at = now()
WHERE key = 'ai_modules'
  AND value #> '{chat,tiers,unlimited}' IS NOT NULL;

COMMIT;

-- ── 验证（可选）──
-- SELECT value #> '{chat,tiers,free,daily_message_limit}' AS free_limit,
--        value #> '{chat,tiers,pro,daily_message_limit}' AS pro_limit,
--        value #> '{chat,tiers,premium,daily_message_limit}' AS premium_limit,
--        value #> '{chat,tiers,unlimited,daily_message_limit}' AS unlimited_limit
-- FROM site_settings WHERE key = 'ai_modules';
