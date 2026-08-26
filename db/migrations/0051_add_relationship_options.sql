-- ============================================================================
-- Migration: 0051_add_relationship_options
-- Description: Add relationship options to creator_option_pool table for UI selection
-- Time: 5min
-- ============================================================================

BEGIN;

-- Insert relationship options into creator_option_pool if they don't exist
INSERT INTO creator_option_pool (category, value, label_en, label_zh, description, sort_order)
VALUES 
  ('relationship', 'girlfriend', 'Girlfriend', '女友', 'Romantic partner with intimate connection', 1),
  ('relationship', 'boyfriend', 'Boyfriend', '男友', 'Romantic partner with intimate connection', 2),
  ('relationship', 'colleague', 'Colleague', '同事', 'Work together in the same company', 3),
  ('relationship', 'boss', 'Boss', '上司', 'Your direct supervisor at work', 4),
  ('relationship', 'sister', 'Sister', '妹妹/姐姐', 'Female sibling or sister-like bond', 5),
  ('relationship', 'brother', 'Brother', '弟弟/哥哥', 'Male sibling or brother-like bond', 6),
  ('relationship', 'neighbor', 'Neighbor', '邻居', 'Live next door or nearby', 7),
  ('relationship', 'stranger', 'Stranger', '陌生人', 'First meeting, unknown background', 8),
  ('relationship', 'lover', 'Lover', '情人', 'Passionate romantic relationship', 9),
  ('relationship', 'friend', 'Friend', '朋友', 'Close platonic friendship', 10)
ON CONFLICT (category, value) DO NOTHING;

COMMIT;
