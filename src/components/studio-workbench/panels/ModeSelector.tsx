'use client';

import { cn } from '@/lib/utils';
import { useStudio } from '../StudioContext';
import { FileImage, ImagePlay, Video, Settings2, type LucideIcon } from 'lucide-react';
import type { CreativeGenerationMode } from '@/lib/creative-generation-presets';

const MODES: Array<{ id: CreativeGenerationMode; label: string; icon: LucideIcon; hint: string }> = [
  { id: 'txt2img', label: '文生图', icon: FileImage, hint: '从描述生成图像' },
  { id: 'img2img', label: '图生图', icon: ImagePlay, hint: '基于参考图变换' },
  { id: 'img2video', label: '图生视频', icon: Video, hint: 'Wan 2.2 动画' },
];

export function ModeSelector() {
  const { state, dispatch } = useStudio();

  return (
    <div className="flex items-center gap-2">
      {/* Mode tabs */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
        {MODES.map((mode) => {
          const active = state.genMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => dispatch({ type: 'SET_MODE', genMode: mode.id })}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition',
                active
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )}
            >
              <mode.icon className="h-3.5 w-3.5" />
              {mode.label}
            </button>
          );
        })}
      </div>

      {/* Simple / Advanced toggle */}
      <button
        onClick={() => dispatch({ type: 'SET_ADVANCED', value: !state.advancedMode })}
        className={cn(
          'flex items-center gap-1 rounded-md border px-2 py-1.5 text-[10px] font-medium transition',
          state.advancedMode
            ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
            : 'border-white/10 bg-white/[0.03] text-slate-500 hover:text-slate-300',
        )}
      >
        <Settings2 className="h-3 w-3" />
        {state.advancedMode ? '高级' : '简易'}
      </button>
    </div>
  );
}
