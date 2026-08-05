-- 0032: Seed companion album with the real portrait image.
-- Legacy girlfriends.album_urls was empty for every companion, so the 0031
-- backfill left all albums blank. System companions must show real backend
-- data, so seed each companion's album (photo category) with their
-- portrait_url. Idempotent: skips companions whose portrait is already an asset.

insert into public.companion_assets (girlfriend_id, category, media_type, url, visibility, meta)
select g.id, 'photo', 'image', g.portrait_url, 'public', '{"source":"portrait_url"}'::jsonb
from public.girlfriends g
where g.portrait_url is not null
  and trim(g.portrait_url) <> ''
  and not exists (
    select 1 from public.companion_assets a
    where a.girlfriend_id = g.id and a.url = g.portrait_url
  );
