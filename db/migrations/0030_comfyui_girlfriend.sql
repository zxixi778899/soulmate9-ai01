-- ComfyUI console girlfriend linkage
alter table public.comfyui_jobs add column if not exists girlfriend_id uuid;
create index if not exists comfyui_jobs_girlfriend_idx on public.comfyui_jobs (girlfriend_id);
comment on column public.comfyui_jobs.girlfriend_id is 'Optional companion; outputs are registered into generation_assets under this girlfriend';
notify pgrst, 'reload schema';
