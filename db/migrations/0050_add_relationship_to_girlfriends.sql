-- ============================================================================
-- Migration: 0050_add_relationship_to_girlfriends
-- Description: Add relationship column to girlfriends table for generation prompts
-- Time: 5min
-- ============================================================================

BEGIN;

-- Add relationship column to girlfriends table
ALTER TABLE girlfriends 
ADD COLUMN IF NOT EXISTS relationship VARCHAR DEFAULT 'girlfriend' 
CHECK (relationship IN ('girlfriend', 'boyfriend', 'colleague', 'boss', 'sister', 'brother', 'neighbor', 'stranger', 'lover', 'friend'));

COMMIT;
