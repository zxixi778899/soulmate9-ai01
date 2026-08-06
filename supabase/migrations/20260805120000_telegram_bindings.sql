-- Telegram bot bindings: links a Telegram account to a Supabase auth user
-- and stores per-user bot state (active companion, locale, pending image job).
--
-- Access model: RLS enabled with NO policies → only the service role
-- (server-side webhook code) can read/write this table.

create table if not exists public.telegram_bindings (
  telegram_id bigint primary key,
  user_id uuid not null,
  current_girlfriend_id uuid,
  locale text not null default 'auto', -- 'auto' | 'zh' | 'en'
  refresh_token text,
  notifications_enabled boolean not null default true,
  last_image_job jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists telegram_bindings_user_id_idx
  on public.telegram_bindings (user_id);

alter table public.telegram_bindings enable row level security;

-- No policies on purpose: service-role only.

comment on table public.telegram_bindings is
  'Telegram bot account bindings and per-user bot state (service-role only).';
