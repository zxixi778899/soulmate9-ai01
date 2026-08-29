'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Layers,
  Loader2,
  CloudUpload,
  BookOpen,
  SlidersHorizontal,
  UserRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import ComfyConsole from '../comfy/ComfyConsole';
import { StudioWorkbench } from '@/components/studio-workbench/StudioWorkbench';
import AdminUnifiedPresetsContent from '@/components/admin/AdminUnifiedPresetsContent';
import CreatorPreviewsAdminContent from '@/components/admin/CreatorPreviewsAdminContent';
import PublicAssetsAdminContent from '@/components/admin/PublicAssetsAdminContent';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';

type Section = 'studio' | 'unified-presets' | 'public-assets';

const SECTIONS: Array<{
  id: Section;
  label: string;
  icon: LucideIcon;
  hint: string;
}> = [
  {
    id: 'studio',
    label: '创作工作台',
    icon: Workflow,
    hint: 'Comfy 出图 · LoRA · 角色生产管线',
  },
  {
    id: 'unified-presets',
    label: '预设库',
    icon: SlidersHorizontal,
    hint: '提示词 · 姿势动作 · 场景',
  },
  {
    id: 'public-assets',
    label: '公共资源库',
    icon: CloudUpload,
    hint: '公共图片、模型与素材资源管理',
  },
];

function StudioInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const girlfriendId = (
    searchParams.get('girlfriendId')
    || searchParams.get('girlfriend_id')
    || ''
  ).trim();
  const sectionParam = searchParams.get('section');
  const section: Section =
    sectionParam === 'unified-presets' || sectionParam === 'public-assets' ? sectionParam : 'studio';
  const useLegacy = searchParams.get('v') === 'legacy';

  // 头部引擎徽章跟随 SDXL 矩阵总闸（服务端 env 客户端不可见，走 API 下发）。
  const [matrixReady, setMatrixReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch('/api/admin/comfy?view=volume');
        if (!res.ok) return;
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        if (!cancelled) setMatrixReady(data?.sdxl_models_ready === true);
      } catch {
        /* keep FLUX-only badge */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b12]/95 px-3 py-2.5 backdrop-blur md:px-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white md:text-lg">创建与素材</h1>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                {matrixReady ? 'FLUX + SDXL 矩阵 · RunPod Comfy' : 'FLUX · RunPod Comfy'}
              </span>
            </div>
            {girlfriendId ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-violet-300">
                <UserRound className="h-3 w-3 shrink-0" />
                当前伴侣：{girlfriendId}
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-400">生成结果统一进入公共资产库</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/admin/studio?section=unified-presets"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> 预设库
            </Link>
            <Link
              href="/admin/model-library"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <Layers className="h-3.5 w-3.5" /> 模型与 LoRA
            </Link>
            <Link
              href="/admin/girlfriends"
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-500"
            >
              伴侣管理 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ─── Section tabs ─────────────────────────────────────── */}
        <div className="mx-auto mt-2.5 max-w-[1600px]">
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
            {SECTIONS.map((item) => {
              const active = section === item.id;
              return (
                <Link
                  key={item.id}
                  href={`/admin/studio${girlfriendId ? `?girlfriendId=${encodeURIComponent(girlfriendId)}` : ''}${
                    item.id === 'studio' ? '' : `${girlfriendId ? '&' : '?'}section=${item.id}`
                  }`}
                  className={cn(
                    'flex flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm transition sm:flex-none sm:px-4',
                    active ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:bg-white/5 hover:text-white',
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.label}</span>
                  <span className="hidden text-[10px] font-normal opacity-70 lg:inline">{item.hint}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </header>

      {/* ─── Content ────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[1600px] px-3 py-4 md:px-4">
        {section === 'studio' && (useLegacy
          ? <ComfyConsole girlfriendId={girlfriendId || undefined} embedded />
          : <StudioWorkbench girlfriendId={girlfriendId || undefined} />)
        }
        {section === 'unified-presets' && <AdminUnifiedPresetsContent embedded />}
        {section === 'public-assets' && <PublicAssetsAdminContent />}
      </div>
    </div>
  );
}

export default function AdminStudioPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}