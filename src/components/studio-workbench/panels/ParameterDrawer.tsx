'use client';

import { useStudio } from '../StudioContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ParameterDrawer() {
  const { state, dispatch } = useStudio();

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">高级参数</h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">Sampler</Label>
          <Select value={state.sampler} onValueChange={(v) => dispatch({ type: 'SET_PARAMS', patch: { sampler: v } })}>
            <SelectTrigger className="h-8 bg-[#0d0d15] border-white/10 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="euler">euler</SelectItem>
              <SelectItem value="euler_ancestral">euler_ancestral</SelectItem>
              <SelectItem value="dpmpp_2m">dpmpp_2m</SelectItem>
              <SelectItem value="dpmpp_2m_sde">dpmpp_2m_sde</SelectItem>
              <SelectItem value="uni_pc">uni_pc</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">Scheduler</Label>
          <Select value={state.scheduler} onValueChange={(v) => dispatch({ type: 'SET_PARAMS', patch: { scheduler: v } })}>
            <SelectTrigger className="h-8 bg-[#0d0d15] border-white/10 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="simple">simple</SelectItem>
              <SelectItem value="normal">normal</SelectItem>
              <SelectItem value="karras">karras</SelectItem>
              <SelectItem value="exponential">exponential</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">Steps</Label>
          <Input type="number" value={state.steps} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { steps: +e.target.value } })}
            className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">CFG</Label>
          <Input type="number" step={0.1} value={state.cfg} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { cfg: +e.target.value } })}
            className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] text-slate-500">Seed</Label>
          <Input type="number" value={state.seed} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { seed: +e.target.value } })}
            className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
        </div>
      </div>

      {(state.genMode === 'img2img') && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] text-slate-500">重绘强度 (Denoise)</Label>
            <span className="text-[10px] text-slate-500 font-mono">{state.denoise.toFixed(2)}</span>
          </div>
          <input
            type="range" min={0.1} max={0.95} step={0.02} value={state.denoise}
            onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { denoise: +e.target.value } })}
            className="w-full accent-violet-500"
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-[10px] text-slate-500">生成数量</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => dispatch({ type: 'SET_PARAMS', patch: { imageCount: n } })}
              className={`flex-1 rounded-md border py-1 text-xs font-medium transition ${
                state.imageCount === n
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
