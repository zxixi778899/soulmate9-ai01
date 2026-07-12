'use client';

/**
 * 创作工作台入口：Comfy 生成 + 模型库 + 公共资产
 * 旧 /admin/comfy 重定向到此，并提供清晰工作流分区
 */
import Link from 'next/link';
import { Sparkles, Library, FolderOpen, Workflow, ImageIcon, Film, Mic2, ArrowRight } from 'lucide-react';
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
    title: '按女友生成',
    desc: '下方工作台出图（后续接视频/音频）。生成结果进入公共资产，可再绑定到女友卡。',
    href: '#workspace',
    icon: Sparkles,
  },
  {
    n: '3',
    title: '资产选用',
    desc: '公共资产库保留全部生成图，可删除/上传，并选用为站内女友头像或肖像。',
    href: '/admin/assets',
    icon: FolderOpen,
  },
];

export default function AdminStudioPage() {
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
                站内女友资料绑定请去「女友与媒体」，本页只负责生产资产。
              </p>
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
                绑定到女友 <ArrowRight className="h-3.5 w-3.5" />
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
        <ComfyConsole />
      </div>
    </div>
  );
}
