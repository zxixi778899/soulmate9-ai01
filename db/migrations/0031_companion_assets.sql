-- 0031: Companion asset library
-- Every companion's media is organized into three categories:
--   id_reference  角色一致性 ID 参考图（内部使用，默认私密）
--   photo         相册
--   video         视频
-- Each item carries a visibility flag:
--   public   公开 —— 伴侣上架（is_public=true AND review_status='approved'）后进入前端相册供所有用户使用
--   private  私密 —— 仅创建者/管理员可见
-- 用户自建伴侣采用同一套方案：审核通过前资源仅创建者私人使用，通过后随伴侣进入系统伴侣库。

create table if not exists public.companion_assets (
  id uuid primary key default gen_random_uuid(),
  girlfriend_id uuid not null references public.girlfriends(id) on delete cascade,
  category text not null check (category in ('id_reference', 'photo', 'video')),
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  url text not null,
  thumbnail_url text,
  caption text,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  sort_order integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_companion_assets_gf_cat
  on public.companion_assets (girlfriend_id, category, sort_order desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Idempotent backfill from legacy girlfriends columns
-- ---------------------------------------------------------------------------

-- album_urls[] → photo (public)
insert into public.companion_assets (girlfriend_id, category, media_type, url, visibility, meta)
select g.id, 'photo', 'image', trim(u.entry), 'public', '{"source":"album_urls"}'::jsonb
from public.girlfriends g
cross join lateral unnest(g.album_urls) as u(entry)
where trim(u.entry) <> ''
  and not exists (
    select 1 from public.companion_assets a
    where a.girlfriend_id = g.id and a.url = trim(u.entry)
  );

-- face_reference_url → id_reference (private, internal use)
insert into public.companion_assets (girlfriend_id, category, media_type, url, visibility, meta)
select g.id, 'id_reference', 'image', g.face_reference_url, 'private', '{"source":"face_reference_url"}'::jsonb
from public.girlfriends g
where g.face_reference_url is not null
  and trim(g.face_reference_url) <> ''
  and not exists (
    select 1 from public.companion_assets a
    where a.girlfriend_id = g.id and a.url = g.face_reference_url
  );

-- avatar_video_url / portrait_video_url → video (public)
insert into public.companion_assets (girlfriend_id, category, media_type, url, visibility, meta)
select g.id, 'video', 'video', g.avatar_video_url, 'public', '{"source":"avatar_video_url"}'::jsonb
from public.girlfriends g
where g.avatar_video_url is not null
  and trim(g.avatar_video_url) <> ''
  and not exists (
    select 1 from public.companion_assets a
    where a.girlfriend_id = g.id and a.url = g.avatar_video_url
  );

insert into public.companion_assets (girlfriend_id, category, media_type, url, visibility, meta)
select g.id, 'video', 'video', g.portrait_video_url, 'public', '{"source":"portrait_video_url"}'::jsonb
from public.girlfriends g
where g.portrait_video_url is not null
  and trim(g.portrait_video_url) <> ''
  and not exists (
    select 1 from public.companion_assets a
    where a.girlfriend_id = g.id and a.url = g.portrait_video_url
  );
