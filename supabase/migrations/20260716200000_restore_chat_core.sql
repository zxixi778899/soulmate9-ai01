-- Restore the core chat persistence schema on the production data project.
-- The application accesses these tables only through server-side service_role.

create extension if not exists vector;

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  girlfriend_id uuid not null,
  role varchar(16) not null default 'user'
    check (role in ('user', 'assistant', 'system')),
  content text,
  media_url text,
  media_type varchar(16),
  is_proactive boolean not null default false,
  metadata jsonb,
  content_nsfw_level integer not null default 0,
  content_nsfw_flagged boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_user_id_idx
  on public.chat_messages (user_id);
create index if not exists chat_messages_girlfriend_id_idx
  on public.chat_messages (girlfriend_id);
create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);
create index if not exists chat_messages_gf_created_idx
  on public.chat_messages (girlfriend_id, created_at desc);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);
create index if not exists chat_messages_user_role_idx
  on public.chat_messages (user_id, role);

create table if not exists public.intimacy_scores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  girlfriend_id uuid not null,
  score numeric(10, 2) not null default 0,
  level integer not null default 1,
  last_interacted_at timestamptz,
  daily_message_count integer not null default 0,
  daily_score_gained numeric(10, 2) not null default 0,
  last_daily_reset date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intimacy_scores_user_girlfriend_key unique (user_id, girlfriend_id)
);

create index if not exists intimacy_scores_user_id_idx
  on public.intimacy_scores (user_id);
create index if not exists intimacy_scores_girlfriend_id_idx
  on public.intimacy_scores (girlfriend_id);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  girlfriend_id uuid not null,
  content text not null,
  type varchar(32) not null default 'chat',
  category varchar(64) not null default 'general',
  importance integer not null default 1,
  embedding vector(1024),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists memories_user_girlfriend_created_idx
  on public.memories (user_id, girlfriend_id, created_at desc);

create or replace function public.search_memories(
  p_user_id uuid,
  p_girlfriend_id uuid,
  p_embedding vector(1024),
  p_match_count integer default 5,
  p_min_similarity double precision default 0.5
)
returns table (
  id uuid,
  content text,
  type text,
  category text,
  score double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    m.content,
    m.type::text,
    m.category::text,
    (1 - (m.embedding <=> p_embedding))::double precision as score
  from public.memories as m
  where m.user_id = p_user_id
    and (p_girlfriend_id is null or m.girlfriend_id = p_girlfriend_id)
    and m.embedding is not null
    and (1 - (m.embedding <=> p_embedding)) >= p_min_similarity
  order by m.embedding <=> p_embedding
  limit greatest(p_match_count, 1);
$$;

alter table public.chat_messages enable row level security;
alter table public.intimacy_scores enable row level security;
alter table public.memories enable row level security;

revoke all on table public.chat_messages from anon, authenticated;
revoke all on table public.intimacy_scores from anon, authenticated;
revoke all on table public.memories from anon, authenticated;

grant select, insert, update, delete on table public.chat_messages to service_role;
grant select, insert, update, delete on table public.intimacy_scores to service_role;
grant select, insert, update, delete on table public.memories to service_role;
grant execute on function public.search_memories(uuid, uuid, vector, integer, double precision)
  to service_role;
