'use client';

import { useStudio } from '../StudioContext';
import { Badge } from '@/components/ui/badge';

export function GenerationTrace() {
  const { state } = useStudio();
  const trace = state.lastGenerationTrace;

  if (!trace) return null;

  return (
    <details className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
      <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300">
        生成链路信息
      </summary>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {trace.model && (
          <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/30 text-[10px] px-1.5 py-0">
            {String(trace.model)}
          </Badge>
        )}
        {trace.modelFamily && (
          <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[10px] px-1.5 py-0">
            {String(trace.modelFamily)}
          </Badge>
        )}
        {trace.checkpoint && (
          <span className="text-[10px] font-mono text-slate-500">{String(trace.checkpoint)}</span>
        )}
        {trace.steps && (
          <span className="text-[10px] font-mono text-slate-500">{String(trace.steps)}步</span>
        )}
        {trace.cfg && (
          <span className="text-[10px] font-mono text-slate-500">CFG {String(trace.cfg)}</span>
        )}
        {trace.sampler && (
          <span className="text-[10px] font-mono text-slate-500">{String(trace.sampler)}</span>
        )}
        {trace.endpoint && (
          <span className="text-[10px] font-mono text-slate-600">{String(trace.endpoint)}</span>
        )}
        {Array.isArray(trace.loras) && trace.loras.length > 0 && (
          <Badge variant="outline" className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-[10px] px-1.5 py-0">
            LoRA ×{trace.loras.length}
          </Badge>
        )}
      </div>
      {trace.prompt && (
        <p className="mt-1.5 max-h-16 overflow-y-auto font-mono text-[10px] text-slate-600 line-clamp-3">
          {String(trace.prompt)}
        </p>
      )}
    </details>
  );
}
