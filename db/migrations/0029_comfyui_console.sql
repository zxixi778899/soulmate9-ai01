-- 0029: ComfyUI 控制台（全站图片生产）
-- comfyui_workflows: 预设/自定义工作流（9 大预设 + 动态工作流）
-- comfyui_jobs:      GPU 任务历史（RunPod job 映射 + 输出 URL）
-- RLS 开启但无 policy：仅 service_role 可读写（与 girlfriends 一致）

create table if not exists public.comfyui_workflows (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  category text not null default 'image', -- image | video | dynamic
  engine text not null default 'flux',    -- flux | wan | raw
  description text not null default '',
  icon text not null default 'Workflow',
  workflow_json jsonb,                    -- raw 引擎的完整 ComfyUI API 图
  params_schema jsonb not null default '[]'::jsonb,
  defaults jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_preset boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comfyui_jobs (
  id uuid primary key default gen_random_uuid(),
  workflow_key text,
  workflow_name text,
  engine text not null default 'flux',
  endpoint_id text,
  runpod_job_id text,
  status text not null default 'IN_QUEUE', -- IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED
  params jsonb not null default '{}'::jsonb,
  output_urls text[] not null default '{}',
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists comfyui_jobs_created_at_idx
  on public.comfyui_jobs (created_at desc);
create index if not exists comfyui_jobs_runpod_idx
  on public.comfyui_jobs (runpod_job_id);

alter table public.comfyui_workflows enable row level security;
alter table public.comfyui_jobs enable row level security;

grant all on public.comfyui_workflows to service_role;
grant all on public.comfyui_jobs to service_role;

notify pgrst, 'reload schema';
