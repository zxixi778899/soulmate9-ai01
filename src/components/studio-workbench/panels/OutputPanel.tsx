'use client';

import { useStudio } from '../StudioContext';
import { OutputGrid } from '../output/OutputGrid';
import { GenerationTrace } from '../output/GenerationTrace';
import { Loader2 } from 'lucide-react';

export function OutputPanel() {
  const { state } = useStudio();

  return (
    <div className="flex flex-col gap-3">
      {/* Generation in progress */}
      {state.generating && (
        <div className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <div>
            <p className="text-sm font-medium text-white">
              {state.generationStage === 'queued' ? 'GPU 排队中' : state.generationStage === 'finalizing' ? '保存资产中' : '提交生成任务'}
            </p>
            <p className="text-[11px] text-slate-400">
              {state.genMode === 'img2video' ? '视频生成通常需要 30-90 秒' : '图像生成通常需要 10-30 秒'}
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {state.lastResult.length > 0 && (
        <>
          <OutputGrid />
          <GenerationTrace />
        </>
      )}

      {/* Empty state */}
      {!state.generating && state.lastResult.length === 0 && (
        <div className="flex h-[400px] flex-col items-center justify-center rounded-xl border border-white/5 bg-white/[0.02]">
          <div className="rounded-full bg-white/5 p-6">
            <svg className="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-slate-500">生成结果将在这里显示</p>
          <p className="mt-1 text-[11px] text-slate-600">填写提示词后点击生成按钮</p>
        </div>
      )}
    </div>
  );
}
