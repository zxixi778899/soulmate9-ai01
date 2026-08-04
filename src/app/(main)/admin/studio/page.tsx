'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, FolderOpen, Library, Loader2, UserRound } from 'lucide-react';
import ComfyConsole from '../comfy/ComfyConsole';

function StudioInner(): React.JSX.Element {
  const searchParams = useSearchParams();
  const girlfriendId = (
    searchParams.get('girlfriendId')
    || searchParams.get('girlfriend_id')
    || ''
  ).trim();

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b12]/95 px-3 py-2.5 backdrop-blur md:px-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white md:text-lg">创建与素材</h1>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                FLUX · RunPod Comfy
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
              href="/admin/preset-library"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <Library className="h-3.5 w-3.5" /> 预设库
            </Link>
            <Link
              href="/admin/model-library"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <Library className="h-3.5 w-3.5" /> 模型与 LoRA
            </Link>
            <Link
              href="/admin/assets"
              className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-white/10"
            >
              <FolderOpen className="h-3.5 w-3.5" /> 公共资产
            </Link>
            <Link
              href="/admin/girlfriends"
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-500"
            >
              伴侣管理 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px]">
        <ComfyConsole girlfriendId={girlfriendId || undefined} embedded />
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
