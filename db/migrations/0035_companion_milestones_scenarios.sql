-- 0035: 千人千面 · 伴侣关键节点记录与情景状态
-- 1. companion_milestones: 结构化事件记录（电影、餐厅、礼物、对话主题等）
-- 2. companion_scenarios: 情景模式状态追踪
-- 3. scenario_participants: 情景参与者

-- ─────────────────────────────────────────────────────────────
-- 1. 关键节点表：记录她和用户之间的结构化事件
-- ─────────────────────────────────────────────────────────────
create table if not exists public.companion_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  girlfriend_id uuid not null references public.girlfriends(id) on delete cascade,

  -- 事件类型：movie, restaurant, gift, anniversary, conversation, date, game, etc.
  event_type varchar(64) not null,

  -- 事件标题与详细描述
  title varchar(255) not null,
  description text,

  -- 事件发生日期（区别于记录创建时间）
  event_date date,

  -- 参与者（JSON 数组：["user_name", "girlfriend_name", "friend1"]）
  participants jsonb default '[]'::jsonb,

  -- 地点
  location varchar(255),

  -- 情感语境：happy, romantic, sad, playful, intimate, serious, funny, etc.
  emotional_context varchar(64),

  -- 关键词数组，用于触发回忆（["电影", "约会", "浪漫"] 等）
  keywords jsonb default '[]'::jsonb,

  -- 重要性等级 1-5（5 = 最重要）
  importance integer default 3 check (importance >= 1 and importance <= 5),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_milestones_gf_user
  on public.companion_milestones (girlfriend_id, user_id);
create index if not exists idx_milestones_event_type
  on public.companion_milestones (event_type);
create index if not exists idx_milestones_created_at
  on public.companion_milestones (created_at desc);
create index if not exists idx_milestones_event_date
  on public.companion_milestones (event_date desc);
create index if not exists idx_milestones_importance
  on public.companion_milestones (importance desc);

-- GIN 索引用于关键词搜索
create index if not exists idx_milestones_keywords
  on public.companion_milestones using gin (keywords);

alter table public.companion_milestones enable row level security;

drop policy if exists "milestones_select" on public.companion_milestones;
create policy "milestones_select" on public.companion_milestones
  for select using (auth.uid() = user_id);

drop policy if exists "milestones_insert" on public.companion_milestones;
create policy "milestones_insert" on public.companion_milestones
  for insert with check (auth.uid() = user_id);

drop policy if exists "milestones_update" on public.companion_milestones;
create policy "milestones_update" on public.companion_milestones
  for update using (auth.uid() = user_id);

drop policy if exists "milestones_delete" on public.companion_milestones;
create policy "milestones_delete" on public.companion_milestones
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 2. 情景状态表：追踪情景模式的进度与上下文
-- ─────────────────────────────────────────────────────────────
create table if not exists public.companion_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  girlfriend_id uuid not null references public.girlfriends(id) on delete cascade,

  -- 情景标题
  title varchar(255) not null,
  description text,

  -- 关系类型：teacher, sister, younger_sister, family, boss, neighbor, stranger, bestie, coworker, roommate, maid, princess, rival
  relationship_type varchar(64),

  -- 情景状态 JSON：{ "phase": "intro|development|climax|resolution", "context": {...}, "props": [...], "emotional_beat": "..." }
  scenario_state jsonb default '{}'::jsonb,

  -- 是否激活
  is_active boolean default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scenarios_gf_user
  on public.companion_scenarios (girlfriend_id, user_id);
create index if not exists idx_scenarios_active
  on public.companion_scenarios (is_active);
create index if not exists idx_scenarios_created_at
  on public.companion_scenarios (created_at desc);

alter table public.companion_scenarios enable row level security;

drop policy if exists "scenarios_select" on public.companion_scenarios;
create policy "scenarios_select" on public.companion_scenarios
  for select using (auth.uid() = user_id);

drop policy if exists "scenarios_insert" on public.companion_scenarios;
create policy "scenarios_insert" on public.companion_scenarios
  for insert with check (auth.uid() = user_id);

drop policy if exists "scenarios_update" on public.companion_scenarios;
create policy "scenarios_update" on public.companion_scenarios
  for update using (auth.uid() = user_id);

drop policy if exists "scenarios_delete" on public.companion_scenarios;
create policy "scenarios_delete" on public.companion_scenarios
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- 3. 情景参与者表（可选，用于复杂情景多人互动）
-- ─────────────────────────────────────────────────────────────
create table if not exists public.scenario_participants (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.companion_scenarios(id) on delete cascade,

  -- 参与者名字
  name varchar(255) not null,

  -- 参与者角色描述
  role varchar(255),

  -- 参与者特性 JSON
  traits jsonb default '{}'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists idx_scenario_participants_scenario
  on public.scenario_participants (scenario_id);

alter table public.scenario_participants enable row level security;

drop policy if exists "participants_select" on public.scenario_participants;
create policy "participants_select" on public.scenario_participants
  for select using (
    exists (
      select 1 from public.companion_scenarios cs
      where cs.id = scenario_participants.scenario_id
      and auth.uid() = cs.user_id
    )
  );

drop policy if exists "participants_insert" on public.scenario_participants;
create policy "participants_insert" on public.scenario_participants
  for insert with check (
    exists (
      select 1 from public.companion_scenarios cs
      where cs.id = scenario_participants.scenario_id
      and auth.uid() = cs.user_id
    )
  );
