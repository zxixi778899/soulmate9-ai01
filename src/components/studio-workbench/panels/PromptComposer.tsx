'use client';

import { useStudio } from '../StudioContext';
import { Wand2, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { PromptPresets } from './PromptPresets';
import { useState, useMemo } from 'react';

const NSFW_LABELS: Record<number, string> = { 1: 'SFW', 2: 'LV1 暗示', 3: 'LV2 暧昧', 4: 'LV3 性感', 5: 'LV4+ 大胆' };

export function PromptComposer() {
  const { state, dispatch, optimizePrompt, resolvedPrompt } = useStudio();
  const [expandedPresets, setExpandedPresets] = useState(true);

  // Reusable preset section (avoid recreating on every render)
  const presetSection = useMemo(() => (
    <PromptPresets />
  ), []);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      {/* Prompt presets - collapsible */}
      <details open={expandedPresets} onToggle={() => setExpandedPresets(!expandedPresets)}>
        <summary className="flex cursor-pointer items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          <div className="flex items-center gap-1.5">
            <Bookmark className="h-3 w-3 text-violet-400" />
            <span>提示词预设</span>
          </div>
          {expandedPresets ? <ChevronUp className="h-3.5 w-3.5 text-slate-600" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-600" />}
        </summary>
        <div className="mt-2">{presetSection}</div>
      </details>

      {/* Prompt textarea */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            提示词
          </label>
          <button
            onClick={() => void optimizePrompt()}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-violet-400 transition hover:bg-violet-500/10 hover:text-violet-300"
          >
            <Wand2 className="h-3 w-3" /> AI 优化
          </button>
        </div>
        <textarea
          value={state.prompt}
          onChange={(e) => dispatch({ type: 'SET_PROMPT', text: e.target.value })}
          placeholder="描述你想要的画面…例：bright studio portrait, soft lighting, elegant pose"
          className="mt-1 h-28 w-full resize-y rounded-lg border border-white/10 bg-[#0d0d15] px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
        />
      </div>

      {/* Negative prompt (shown in advanced mode or if has content) */}
      {(state.advancedMode || state.negative) && (
        <div>
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            反向提示词
          </label>
          <input
            value={state.negative}
            onChange={(e) => dispatch({ type: 'SET_NEGATIVE', text: e.target.value })}
            placeholder="bad anatomy, deformed, blurry, low quality…"
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#0d0d15] px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
      )}

      {/* NSFW intensity slider */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            NSFW 等级
          </label>
          <span className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-medium',
            state.nsfwIntensity >= 4 ? 'bg-red-500/15 text-red-300' :
            state.nsfwIntensity >= 2 ? 'bg-orange-500/15 text-orange-300' :
            'bg-slate-700/50 text-slate-400',
          )}>
            {NSFW_LABELS[state.nsfwIntensity]}
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={state.nsfwIntensity}
          onChange={(e) => dispatch({ type: 'SET_NSFW', intensity: Number(e.target.value) as NsfwIntensity })}
          className="mt-1 w-full accent-violet-500"
        />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>
        </div>
      </div>

      {/* Resolved prompt preview */}
      {state.prompt && resolvedPrompt !== state.prompt && (
        <details className="group">
          <summary className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300">
            查看完整编译后提示词 ({resolvedPrompt.length} chars)
          </summary>
          <p className="mt-1 max-h-20 overflow-y-auto rounded-md bg-[#0d0d15] p-2 font-mono text-[10px] text-slate-500">
            {resolvedPrompt}
          </p>
        </details>
      )}
    </div>
  );
}
