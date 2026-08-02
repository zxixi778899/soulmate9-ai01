-- Daily check-in columns on profiles (referenced by /api/checkin but never created)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_checkin_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS checkin_streak integer NOT NULL DEFAULT 0;
