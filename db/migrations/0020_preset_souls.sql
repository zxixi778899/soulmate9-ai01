-- 0020: Preset Soul Layer ("千人千面")
-- character_presets.character_soul: JSONB mirror of src/lib/preset-souls.ts (voice/scenario/rules/examples/proactive, bilingual)
-- girlfriends.preset_id: tracks which library preset a companion was created from (usage analytics, M4)

ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS character_soul JSONB;

ALTER TABLE girlfriends ADD COLUMN IF NOT EXISTS preset_id UUID;

CREATE INDEX IF NOT EXISTS idx_girlfriends_preset_id
  ON girlfriends (preset_id) WHERE preset_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
