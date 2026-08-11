/**
 * Voice Profiles — proper table storage instead of site_settings JSON
 *
 * Adds:
 * - voice_profiles table (TTS voice + promo storage)
 * - voice_profile_id, voice_promo_url to girlfriends
 *
 * Migration from site_settings JSON to table happens via data migration.
 */

-- 1. Create voice_profiles table
create table if not exists public.voice_profiles (
  id text primary key, -- vp_{companion_id}
  companion_id uuid not null unique references public.girlfriends(id) on delete cascade,
  name text not null default 'Default Voice',
  engine text not null check (engine in ('fish-speech', 'cosyvoice', 'edge-tts')) default 'fish-speech',
  reference_audio_url text,
  voice_id text,
  edge_voice text,
  language text not null check (language in ('en', 'zh', 'auto')) default 'auto',
  pitch numeric,
  speed numeric,
  emotion_presets text[] default array[]::text[],
  voice_promo_url text, -- generated self-introduction + hook audio
  voice_promo_text text, -- the text used for promo generation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.voice_profiles(companion_id);
create index on public.voice_profiles(engine);

-- 2. Add columns to girlfriends table
alter table public.girlfriends
  add column if not exists voice_profile_id text references public.voice_profiles(id) on delete set null,
  add column if not exists voice_promo_url text;

create index on public.girlfriends(voice_profile_id);

-- 3. Enable RLS
alter table public.voice_profiles enable row level security;

create policy "voice_profiles_select" on public.voice_profiles
  for select using (true); -- anyone can read (referenced by public data)

create policy "voice_profiles_admin_write" on public.voice_profiles
  for insert, update, delete using (
    exists (select 1 from public.admins where user_id = auth.uid())
  );

-- 4. Audit trigger
create trigger voice_profiles_updated_at
  before update on public.voice_profiles
  for each row
  execute function public.moddatetime(updated_at);
