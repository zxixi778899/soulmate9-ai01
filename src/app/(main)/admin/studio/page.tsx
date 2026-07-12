'use client';

/**
 * 创作工作台入口：Comfy 生成 + 模型库 + 公共/女友资产
 */
import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Sparkles, Library, FolderOpen, Workflow, ImageIcon, Film, Mic2, ArrowRight, UserRound } from 'lucide-react';
import ComfyConsole from '../comfy/ComfyConsole';

const steps = [
  {
    n: '1',
    title: '选模型 / LoRA',
    desc: '在「模型与 LoRA」搜索 Civitai、入库、导出下载清单；盘上文件名要与清单一致。',
    href: '/admin/model-library',
    icon: Library,
  },
  {
    n: '2',
    title: '按女友或公共生成',
    desc: '带 girlfriendId 进入时，读取该卡特征一键填充提示词，结果进该女友独立资产；无 ID 则进公共资产。',
    href: '#workspace',
    icon: Sparkles,
  },
  {
    n: '3',
    title: '资产选用',
    desc: '公共资产库或回「女友与媒体」绑定肖像/头像。推荐/热门在女友卡内设置。',
    href: '/admin/assets',
    icon: FolderOpen,
  },
];

function StudioInner() {
  const sp = useSearchParams();
  const girlfriendId = (sp.get('girlfriendId') || sp.get('girlfriend_id') || '').trim();

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      <div className="border-b border-white/10 bg-gradient-to-r from-violet-950/80 to-slate-950 px-4 py-5 md:px-6">
        <div className="mx-auto max-w-[1400px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-300/80">创作中心</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">创作工作台</h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-400">
                合并原 Comfy 生成与模型能力：出图 / 视频 / 音频（引擎统一 RunPod）。
                {girlfriendId
                  ? ' 当前按女友创作：生成结果写入该女友文件夹，不进入公共库。'
                  : ' 未选择女友：生成结果进入公共资产库。'}
              </p>
              {girlfriendId ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-200">
                  <UserRound className="h-3.5 w-3.5" />
                  女友 ID：{girlfriendId}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/model-library"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
              >
                <Library className="h-3.5 w-3.5" /> 模型与 LoRA
              </Link>
              <Link
                href="/admin/assets"
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/10"
              >
                <FolderOpen className="h-3.5 w-3.5" /> 公共资产库
              </Link>
              <Link
                href="/admin/girlfriends"
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white hover:bg-violet-500"
              >
                女友与媒体 <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {steps.map((s) => (
              <Link
                key={s.n}
                href={s.href}
                className="rounded-xl border border-white/10 bg-white/5 p-3 transition hover:border-violet-400/40 hover:bg-violet-500/10"
              >
                <div className="flex items-center gap-2 text-xs text-violet-300">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-600/40 text-[10px] font-bold">
                    {s.n}
                  </span>
                  <s.icon className="h-3.5 w-3.5" />
                  {s.title}
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-slate-400">{s.desc}</p>
              </Link>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              <ImageIcon className="h-3 w-3" /> 图片 · 已开通
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              <Film className="h-3 w-3" /> 视频 · 工作流预留
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              <Mic2 className="h-3 w-3" /> 音频 · 工作流预留
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5">
              <Workflow className="h-3 w-3" /> 一次 1 个 LoRA · 提示词管内容
            </span>
          </div>
        </div>
      </div>

      <div id="workspace" className="border-t border-white/10">
        <ComfyConsole girlfriendId={girlfriendId || undefined} />
      </div>
    </div>
  );
}

export default function AdminStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-[#0b0b12] text-slate-400">
          加载创作台…
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}
