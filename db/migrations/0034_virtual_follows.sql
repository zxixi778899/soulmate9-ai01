-- 0034: 虚拟创作者关注表
-- 排行榜上的虚拟创作者（leaderboard_virtual_users）不是 auth.users，
-- 真实用户对 TA 们的关注单独存这张表；展示粉丝数 = 后台种子 fans_count + 真实关注数。

create table if not exists public.user_virtual_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  virtual_user_id uuid not null references public.leaderboard_virtual_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, virtual_user_id)
);

create index if not exists idx_user_virtual_follows_virtual
  on public.user_virtual_follows (virtual_user_id);
create index if not exists idx_user_virtual_follows_follower
  on public.user_virtual_follows (follower_id);

alter table public.user_virtual_follows enable row level security;

drop policy if exists "uvf_select_all" on public.user_virtual_follows;
create policy "uvf_select_all" on public.user_virtual_follows
  for select using (true);

drop policy if exists "uvf_insert_own" on public.user_virtual_follows;
create policy "uvf_insert_own" on public.user_virtual_follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "uvf_delete_own" on public.user_virtual_follows;
create policy "uvf_delete_own" on public.user_virtual_follows
  for delete using (auth.uid() = follower_id);
