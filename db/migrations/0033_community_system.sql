-- 0033 Community system (Douyin-style creator economy)
-- ─────────────────────────────────────────────────────────────────────────────
--   user_follows                    粉丝系统：用户关注创作者
--   girlfriends.interaction_count   互动值：发布伴侣被调用（聊天）次数
--   leaderboard_virtual_users       排行榜虚拟账号（后台可管理 15 条种子）
--   leaderboard_virtual_companions  系统伴侣分配到虚拟账号名下
--   profiles.bio                    个人简介（账户页 / 创作者主页）
--
-- 排行榜规则：真实创作者（有已上架伴侣）按互动值与虚拟账号合并排序取 Top15，
-- 真实用户数值超过虚拟数据即自动顶替上榜。

-- ── 1) 粉丝 / 关注系统 ──────────────────────────────────────────────────────
create table if not exists public.user_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_user_follows_followee on public.user_follows (followee_id);
create index if not exists idx_user_follows_follower on public.user_follows (follower_id);

alter table public.user_follows enable row level security;
drop policy if exists "follows_select_all" on public.user_follows;
create policy "follows_select_all" on public.user_follows for select using (true);
drop policy if exists "follows_insert_own" on public.user_follows;
create policy "follows_insert_own" on public.user_follows for insert with check (auth.uid() = follower_id);
drop policy if exists "follows_delete_own" on public.user_follows;
create policy "follows_delete_own" on public.user_follows for delete using (auth.uid() = follower_id);

-- ── 2) 互动值（发布伴侣被调用次数） ─────────────────────────────────────────
alter table public.girlfriends add column if not exists interaction_count integer not null default 0;
create index if not exists idx_girlfriends_interaction_count on public.girlfriends (interaction_count desc);

-- 原子自增（chat 流 fire-and-forget 调用；同时 +1 热度，保持 HOT 榜联动）
create or replace function public.increment_girlfriend_interaction(gf_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.girlfriends
     set interaction_count = coalesce(interaction_count, 0) + 1,
         hot_score = coalesce(hot_score, 0) + 1
   where id = gf_id;
$$;

grant execute on function public.increment_girlfriend_interaction(uuid) to authenticated, service_role;

-- ── 3) 排行榜虚拟账号 ───────────────────────────────────────────────────────
create table if not exists public.leaderboard_virtual_users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  avatar_url text,
  bio text,
  interaction_score integer not null default 0,
  fans_count integer not null default 0,
  works_count integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leaderboard_virtual_companions (
  virtual_user_id uuid not null references public.leaderboard_virtual_users(id) on delete cascade,
  girlfriend_id uuid not null references public.girlfriends(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (virtual_user_id, girlfriend_id)
);

alter table public.leaderboard_virtual_users enable row level security;
alter table public.leaderboard_virtual_companions enable row level security;
-- 榜单对游客可读；写入仅经 service role（后台 API）
drop policy if exists "lb_virtual_read" on public.leaderboard_virtual_users;
create policy "lb_virtual_read" on public.leaderboard_virtual_users for select using (true);
drop policy if exists "lb_virtual_companions_read" on public.leaderboard_virtual_companions;
create policy "lb_virtual_companions_read" on public.leaderboard_virtual_companions for select using (true);

-- ── 4) 个人简介 ─────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists bio text;

-- ── 5) 种子：15 条虚拟数据（头像取已上架系统伴侣立绘，按热度序分配） ──────
insert into public.leaderboard_virtual_users
  (display_name, bio, interaction_score, fans_count, works_count, sort_order, is_active, avatar_url)
select v.name, v.bio, v.score, v.fans, v.works, v.ord, true,
       (select coalesce(g.portrait_url, g.avatar_url)
          from public.girlfriends g
         where g.is_public = true and g.review_status = 'approved'
         order by coalesce(g.hot_score, 0) desc, g.created_at asc
         offset (v.ord - 1) limit 1)
from (values
  ('Luna',   '深夜电台系陪伴 · 声音控的 3AM 树洞',        12860, 5230, 6, 1),
  ('Aria',   '古典乐与威士忌，温柔只给懂的人',            11420, 4810, 5, 2),
  ('Mia',    '元气邻家 · 每天早安第一个找你',              10250, 4460, 5, 3),
  ('Sakura', '樱花季限定温柔 · 日系纯爱担当',               9480, 3990, 4, 4),
  ('Nova',   '赛博歌姬 · 电子浪漫制造机',                   8660, 3720, 4, 5),
  ('Ivy',    '冷艳御姐 · 只对你一个人服软',                 7830, 3350, 4, 6),
  ('Zoe',    '运动系甜妹 · 陪你打卡每一天',                 7010, 2980, 3, 7),
  ('Kira',   '神秘占星师 · 算得出你的心动时刻',             6240, 2610, 3, 8),
  ('Nina',   '书店店员 · 把情诗读给你听',                   5480, 2240, 3, 9),
  ('Ruby',   '红裙爵士 · 微醺才说真心话',                   4720, 1880, 2, 10),
  ('Sofia',  '旅行博主 · 带你私奔到世界尽头',               3960, 1520, 2, 11),
  ('Ella',   '甜品师 · 把喜欢都烤进蛋糕里',                 3210, 1180, 2, 12),
  ('Vera',   '胶片摄影师 · 镜头里只有你',                   2480, 860, 1, 13),
  ('Lyra',   '天文台守夜人 · 以星星起誓',                   1750, 540, 1, 14),
  ('Iris',   '花店主理人 · 每束花都有心事',                 1020, 230, 1, 15)
) as v(name, bio, score, fans, works, ord)
where not exists (select 1 from public.leaderboard_virtual_users);

-- ── 6) 把部分系统伴侣分配到头部虚拟账号名下（供主页卡片跳转） ──────────────
with ranked as (
  select g.id as gf_id,
         row_number() over (order by coalesce(g.hot_score, 0) desc, g.created_at asc) as rn
    from public.girlfriends g
   where g.is_public = true and g.review_status = 'approved'
), vu as (
  select id as vu_id, sort_order
    from public.leaderboard_virtual_users
)
insert into public.leaderboard_virtual_companions (virtual_user_id, girlfriend_id)
select vu.vu_id, ranked.gf_id
  from vu
  join ranked on ranked.rn between (vu.sort_order - 1) * 2 + 1 and (vu.sort_order - 1) * 2 + 2
on conflict do nothing;
