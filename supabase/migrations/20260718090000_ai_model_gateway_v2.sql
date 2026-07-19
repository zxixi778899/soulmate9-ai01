-- AI Model Gateway v2 observability and image-generation traceability.
alter table public.ai_model_usage_logs
  add column if not exists membership_tier text,
  add column if not exists scene text,
  add column if not exists route_reason text,
  add column if not exists endpoint_id text,
  add column if not exists fallback_count integer not null default 0,
  add column if not exists time_to_first_token_ms integer,
  add column if not exists queue_ms integer,
  add column if not exists quality_score numeric,
  add column if not exists reference_similarity numeric,
  add column if not exists estimated_cost_usd numeric not null default 0;

create index if not exists ai_usage_tier_created_idx on public.ai_model_usage_logs (membership_tier, created_at desc);
create index if not exists ai_usage_endpoint_created_idx on public.ai_model_usage_logs (endpoint_id, created_at desc);

alter table public.ai_model_usage_logs enable row level security;
revoke all on table public.ai_model_usage_logs from anon, authenticated;
grant all on table public.ai_model_usage_logs to service_role;

create table if not exists public.ai_generation_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  girlfriend_id uuid not null,
  scene text not null,
  membership_tier text not null,
  endpoint_id text not null,
  model_id text not null,
  route_reason text not null,
  quality_tier text not null,
  seed bigint not null,
  character_version text,
  reference_urls jsonb not null default '[]'::jsonb,
  prompt_summary text,
  quality_score numeric,
  reference_similarity numeric,
  success boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ai_generation_audits enable row level security;
revoke all on table public.ai_generation_audits from anon, authenticated;
grant all on table public.ai_generation_audits to service_role;
create index if not exists ai_generation_audits_girlfriend_idx on public.ai_generation_audits (girlfriend_id, created_at desc);