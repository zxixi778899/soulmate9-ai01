'use client';

import { useStudio } from '../StudioContext';
import { cn } from '@/lib/utils';

const ASPECT_RATIOS: Array<{ label: string; width: number; height: number; icon: string }> = [
  { label: '3:4', width: 832, height: 1216, icon: '▯' },
  { label: '9:16', width: 768, height: 1344, icon: '▯' },
  { label: '2:3', width: 832, height: 1216, icon: '▯' },
  { label: '1:1', width: 1024, height: 1024, icon: '□' },
  { label: '4:3', width: 1216, height: 832, icon: '▭' },
  { label: '16:9', width: 1344, height: 768, icon: '▭' },
];

export function AspectRatioBar() {
  const { state, dispatch } = useStudio();

  const isActive = (ar: typeof ASPECT_RATIOS[number]) =>
    state.width === ar.width && state.height === ar.height;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
      <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        画面比例
      </label>
      <div className="flex flex-wrap gap-1.5">
        {ASPECT_RATIOS.map((ar) => (
          <button
            key={ar.label}
            onClick={() => dispatch({ type: 'SET_PARAMS', patch: { width: ar.width, height: ar.height } })}
            className={cn(
              'flex flex-col items-center rounded-lg border px-3 py-1.5 text-xs transition',
              isActive(ar)
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
            )}
          >
            <span className="text-base leading-none">{ar.icon}</span>
            <span className="mt-0.5 font-medium">{ar.label}</span>
            <span className="text-[9px] text-slate-500">{ar.width}×{ar.height}</span>
          </button>
        ))}
      </div>
      {state.advancedMode && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            value={state.width}
            onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { width: +e.target.value } })}
            className="w-20 rounded-md border border-white/10 bg-[#0d0d15] px-2 py-1 text-xs text-white"
          />
          <span className="text-slate-600">×</span>
          <input
            type="number"
            value={state.height}
            onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { height: +e.target.value } })}
            className="w-20 rounded-md border border-white/10 bg-[#0d0d15] px-2 py-1 text-xs text-white"
          />
        </div>
      )}
    </div>
  );
}
