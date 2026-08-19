'use client';

import { useStudio } from '../StudioContext';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Shield, ShieldOff } from 'lucide-react';

export function Img2ImgInput() {
  const { state, dispatch } = useStudio();

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">图生图参数</h4>

      {/* Denoise slider */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-[10px] text-slate-500">变换强度</Label>
            <p className="text-[9px] text-slate-600">控制参控图的重绘幅度</p>
          </div>
          <span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
            {state.denoise.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0.1}
          max={0.95}
          step={0.01}
          value={state.denoise}
          onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { denoise: Number(e.target.value) } })}
          className="mt-1 w-full accent-violet-500"
        />
        <div className="flex justify-between text-[9px] text-slate-600">
          <span>微调</span>
          <span>中等</span>
          <span>大变</span>
        </div>
      </div>

      {/* Quick denoise presets */}
      <div className="flex gap-1">
        {[0.30, 0.44, 0.55, 0.70].map((v) => (
          <button
            key={v}
            onClick={() => dispatch({ type: 'SET_PARAMS', patch: { denoise: v } })}
            className={cn(
              'flex-1 rounded-md border px-1.5 py-1 text-[10px] font-medium transition',
              Math.abs(state.denoise - v) < 0.02
                ? 'border-violet-500/50 bg-violet-500/15 text-violet-300'
                : 'border-white/10 bg-white/[0.03] text-slate-500 hover:bg-white/[0.06]',
            )}
          >
            {v === 0.30 ? '微调' : v === 0.44 ? '换装' : v === 0.55 ? '标准' : '自由'}
          </button>
        ))}
      </div>

      {/* Identity consistency toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {state.identityConsistency ? (
            <Shield className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5 text-slate-600" />
          )}
          <div>
            <Label className="text-[10px] text-slate-400">身份一致性</Label>
            <p className="text-[9px] text-slate-600">IP-Adapter 锁脸，与参控图无关</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={state.identityConsistency}
          onClick={() => dispatch({ type: 'SET_IDENTITY_CONSISTENCY', value: !state.identityConsistency })}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition',
            state.identityConsistency
              ? 'border-emerald-500/50 bg-emerald-500/20'
              : 'border-white/10 bg-white/[0.06]',
          )}
        >
          <span
            className={cn(
              'pointer-events-none block h-3.5 w-3.5 rounded-full transition-transform',
              state.identityConsistency
                ? 'translate-x-[18px] bg-emerald-400'
                : 'translate-x-[3px] bg-slate-500',
            )}
          />
        </button>
      </div>
    </div>
  );
}
