-- 0022: Preset folders (admin preview management)
-- Generic containers for preset library items. kind='character' folders hold
-- character_presets today; scene/pose/closeup kinds reserve room for future
-- preset types. Deleting a folder keeps its presets (folder_id → NULL).

CREATE TABLE IF NOT EXISTS preset_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_zh TEXT,
  kind TEXT NOT NULL DEFAULT 'character', -- character | scene | pose | closeup | other
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS preset_folders_kind_idx ON preset_folders (kind, sort_order);

ALTER TABLE character_presets ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES preset_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS character_presets_folder_idx ON character_presets (folder_id);

-- Default folder + backfill (idempotent guard via NOT EXISTS)
INSERT INTO preset_folders (name, name_zh, kind, description, sort_order)
SELECT 'Character Presets', E'\u89d2\u8272\u9884\u8bbe', 'character', 'Default folder for library character presets', 0
WHERE NOT EXISTS (SELECT 1 FROM preset_folders);

UPDATE character_presets
SET folder_id = (SELECT id FROM preset_folders ORDER BY created_at LIMIT 1)
WHERE folder_id IS NULL;

NOTIFY pgrst, 'reload schema';
