-- Add timezone_offset column to profiles
-- Stores user's UTC offset in minutes (e.g. UTC+8 = 480, UTC-5 = -300)
-- Detected client-side via browser Intl API

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone_offset INTEGER DEFAULT NULL;

COMMENT ON COLUMN profiles.timezone_offset IS 'User UTC offset in minutes, detected from browser timezone';
