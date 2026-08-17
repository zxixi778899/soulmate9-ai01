'use client';

import { useEffect, useState } from 'react';
import { useStudio } from '../StudioContext';
import { OutputGrid } from '../output/OutputGrid';
import { GenerationTrace } from '../output/GenerationTrace';
import { Loader2 } from 'lucide-react';

// Stage-based progress simulation
const STAGE_PROGRESS: Record<string, number> = {
  submitting: 8,
  queued: 25,
  finalizing: 90,
};

const STAGE_LABELS: Record<string, string> = {
  submitting: '提交生成任务…',
  queued: 'GPU 渲染中…',
  finalizing: '保存资产中…',
};

export function OutputPanel() {
  const { state } = useStudio();
  const [elapsed, setElapsed] = useState(0);
  const [progress, setProgress] = useState(0);

  // Elapsed timer
  useEffect(() => {
    if (!state.generating) {
      setElapsed(0);
      setProgress(0);
      return;
    }
    setElapsed(0);
    setProgress(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state.generating]);

  // Progress bar: ramp up based on stage + time
  useEffect(() => {
    if (!state.generating) return;
    const stageBase = STAGE_PROGRESS[state.generationStage] ?? 5;
    // Gradually approach stage target (never reach 100 until done)
    const interval = setInterval(() => {
      setProgress((prev) => {
        const target = Math.min(stageBase + elapsed * 1.2, 95);
        if (prev >= target) return prev;
        return prev + (target - prev) * 0.15 + 0.3;
      });
    }, 200);
    return () => clearInterval(interval);
  }, [state.generating, state.generationStage, elapsed]);

  // Complete to 100% when results arrive
  useEffect(() => {
    if (!state.generating && state.lastResult.length > 0) {
      setProgress(100);
    }
  }, [state.generating, state.lastResult]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="flex flex-col gap-3">
      {/* Generation progress bar */}
      {state.generating && (
        <div className="space-y-2 rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
              <span className="text-sm font-medium text-white">
                {STAGE_LABELS[state.generationStage] || '准备中…'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>{Math.round(progress)}%</span>
              <span>{formatTime(elapsed)}</span>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-300 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500">
            {state.genMode === 'img2video' ? '视频生成通常需要 30-90 秒' : '图像生成通常需要 10-30 秒'}
          </p>
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
