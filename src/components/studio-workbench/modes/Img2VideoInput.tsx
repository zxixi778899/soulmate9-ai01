'use client';

import { useStudio } from '../StudioContext';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Film, Gauge } from 'lucide-react';

const DURATION_PRESETS = [
  { seconds: 5, label: '5秒', hint: '快速' },
  { seconds: 10, label: '10秒', hint: '标准' },
];

const FPS_PRESETS = [
  { fps: 12, label: '12fps', hint: '经济' },
  { fps: 16, label: '16fps', hint: '标准' },
  { fps: 24, label: '24fps', hint: '流畅' },
];

export function Img2VideoInput() {
  const { state, dispatch } = useStudio();

  // Duration stored in steps field as proxy (video doesn't use steps)
  const duration = state.steps === 10 ? 10 : 5;
  const fps = state.cfg === 12 ? 12 : state.cfg === 24 ? 24 : 16;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        <Film className="h-3 w-3" /> 视频参数
      </h4>

      {/* Duration */}
      <div>
        <Label className="text-[10px] text-slate-500">时长</Label>
        <div className="mt-1 flex gap-1.5">
          {DURATION_PRESETS.map((d) => (
            <button
              key={d.seconds}
              onClick={() => dispatch({ type: 'SET_PARAMS', patch: { steps: d.seconds } })}
              className={cn(
                'flex-1 rounded-lg border px-2 py-2 text-center transition',
                duration === d.seconds
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06]',
              )}
            >
              <span className="block text-sm font-bold">{d.label}</span>
              <span className="text-[9px] text-slate-600">{d.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* FPS */}
      <div>
        <div className="flex items-center gap-1">
          <Gauge className="h-3 w-3 text-slate-600" />
          <Label className="text-[10px] text-slate-500">帧率</Label>
        </div>
        <div className="mt-1 flex gap-1.5">
          {FPS_PRESETS.map((f) => (
            <button
              key={f.fps}
              onClick={() => dispatch({ type: 'SET_PARAMS', patch: { cfg: f.fps } })}
              className={cn(
                'flex-1 rounded-lg border px-2 py-1.5 text-center transition',
                fps === f.fps
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06]',
              )}
            >
              <span className="block text-xs font-medium">{f.label}</span>
              <span className="text-[9px] text-slate-600">{f.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Info note */}
      <div className="rounded-lg border border-cyan-500/10 bg-cyan-500/[0.04] px-3 py-2">
        <p className="text-[10px] text-cyan-300/70">
          Wan 2.2 引擎 · 约 {duration === 10 ? '3-5' : '1-2'} 分钟出片
        </p>
      </div>
    </div>
  );
}
