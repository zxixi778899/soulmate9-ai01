'use client';

import { useStudio } from '../StudioContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { CharacterAssetRole } from '@/lib/character-asset-production';
import type { StudioEnhancerKey, StudioModelOverride } from '../StudioWorkbench.types';

const MODEL_OPTIONS: Array<{ value: StudioModelOverride; label: string }> = [
  { value: 'auto', label: '自动（按题材路由）' },
  { value: 'flux', label: 'FLUX · 精品层' },
  { value: 'pony', label: 'SDXL · Pony 写实' },
  { value: 'illustrious', label: 'SDXL · Illustrious 2D' },
];

// 资产类型决定服务端提示词合约：album 等自由角色不锁取景，
// avatar-closeup 会被服务端固定为半身像构图。
const ASSET_ROLE_OPTIONS: Array<{ role: CharacterAssetRole; label: string; hint: string }> = [
  { role: 'album', label: '相册', hint: '自由生成，提示词不被锁死' },
  { role: 'character-art', label: '立绘', hint: '角色卡主视觉（需身份参考）' },
  { role: 'scene', label: '场景', hint: '新场景内容（需身份参考）' },
  { role: 'avatar-closeup', label: '半身头像', hint: '固定半身取景（IP-Adapter 锚点）' },
];

const ENHANCER_OPTIONS: Array<{ key: StudioEnhancerKey; label: string }> = [
  { key: 'controlnet', label: 'ControlNet' },
  { key: 'adetailer', label: 'ADetailer' },
  { key: 'upscale', label: '放大' },
];

function ToggleSwitch({ checked, disabled, onChange }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-4 w-7 shrink-0 rounded-full transition',
        checked ? 'bg-violet-500' : 'bg-white/10',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all',
          checked ? 'left-3.5' : 'left-0.5',
        )}
      />
    </button>
  );
}

export function ParameterDrawer() {
  const { state, dispatch, recommendedPreset, generationRoute } = useStudio();

  // 用户未手动改参时展示推荐预设值；改过之后展示并生效用户值
  const effSteps = state.paramsTouched ? state.steps : recommendedPreset.steps;
  const effCfg = state.paramsTouched ? state.cfg : recommendedPreset.cfg;

  const sdxlReady = state.volumeInfo?.sdxl_models_ready === true && Boolean(state.volumeInfo?.endpoint_id_sdxl);
  const enhancerReady = (key: StudioEnhancerKey): boolean =>
    state.enhancerStatuses.some((s) => s.id === key && s.enabled === true);

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">模型与增强</h3>

      {/* 模型选择 */}
      <div className="space-y-1">
        <Label className="text-[10px] text-slate-500">模型</Label>
        <Select value={state.modelOverride} onValueChange={(v) => dispatch({ type: 'SET_MODEL_OVERRIDE', value: v as StudioModelOverride })}>
          <SelectTrigger className="h-8 bg-[#0d0d15] border-white/10 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[9px] text-slate-600">
          当前路由：{generationRoute.modelFamily.toUpperCase()}
          {state.modelOverride !== 'auto' && !sdxlReady && state.modelOverride !== 'flux' && (
            <span className="text-amber-400">（SDXL 矩阵未就绪，运行时回退 FLUX）</span>
          )}
        </p>
      </div>

      {/* 资产类型 */}
      <div className="space-y-1">
        <Label className="text-[10px] text-slate-500">资产类型</Label>
        <div className="flex flex-wrap gap-1">
          {ASSET_ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.role}
              onClick={() => dispatch({ type: 'SET_ASSET_ROLE', role: opt.role })}
              title={opt.hint}
              className={cn(
                'rounded-md border px-2 py-1 text-[10px] font-medium transition',
                state.assetRole === opt.role
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {state.assetRole === 'avatar-closeup' && (
          <p className="text-[9px] text-amber-400/80">半身头像会锁定取景与构图，自由创作请用「相册」</p>
        )}
      </div>

      {/* IP-Adapter 开关 */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-[10px] text-slate-500">IP-Adapter 身份一致性</Label>
          <p className="text-[9px] text-slate-600">用唯一头像作参考图控制人物一致</p>
        </div>
        <ToggleSwitch checked={state.ipAdapter} onChange={(v) => dispatch({ type: 'SET_IPADAPTER', value: v })} />
      </div>

      {/* 增强器开关 */}
      <div className="space-y-1.5">
        <Label className="text-[10px] text-slate-500">图像增强</Label>
        <div className="grid grid-cols-3 gap-1.5">
          {ENHANCER_OPTIONS.map((opt) => {
            const ready = enhancerReady(opt.key);
            const checked = state.enhancers[opt.key] && ready;
            return (
              <div
                key={opt.key}
                className={cn(
                  'flex items-center justify-between rounded-md border px-2 py-1.5',
                  checked ? 'border-violet-500/40 bg-violet-500/10' : 'border-white/10 bg-white/[0.02]',
                )}
              >
                <div className="min-w-0">
                  <p className={cn('text-[10px] font-medium', checked ? 'text-violet-200' : 'text-slate-400')}>{opt.label}</p>
                  {!ready && <p className="text-[8px] text-slate-600">未安装</p>}
                </div>
                <ToggleSwitch
                  checked={checked}
                  disabled={!ready}
                  onChange={(v) => dispatch({ type: 'SET_ENHANCER', key: opt.key, value: v })}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* 生成数量 */}
      <div className="space-y-1">
        <Label className="text-[10px] text-slate-500">生成数量</Label>
        <div className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <button
              key={n}
              onClick={() => dispatch({ type: 'SET_PARAMS', patch: { imageCount: n } })}
              className={cn(
                'flex-1 rounded-md border py-1 text-xs font-medium transition',
                state.imageCount === n
                  ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                  : 'border-white/10 text-slate-400 hover:bg-white/5',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* 高级采样参数（简易模式下隐藏；未手动修改时跟随推荐预设） */}
      {state.advancedMode && (
        <div className="space-y-3 border-t border-white/5 pt-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            高级参数{!state.paramsTouched && <span className="ml-1 normal-case text-slate-600">（跟随推荐预设）</span>}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">Sampler</Label>
              <Select value={state.paramsTouched ? state.sampler : recommendedPreset.sampler} onValueChange={(v) => dispatch({ type: 'SET_PARAMS', patch: { sampler: v } })}>
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
              <Select value={state.paramsTouched ? state.scheduler : recommendedPreset.scheduler} onValueChange={(v) => dispatch({ type: 'SET_PARAMS', patch: { scheduler: v } })}>
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
              <Input type="number" value={effSteps} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { steps: +e.target.value } })}
                className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">CFG</Label>
              <Input type="number" step={0.1} value={effCfg} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { cfg: +e.target.value } })}
                className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-slate-500">Seed</Label>
              <Input type="number" value={state.seed} onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { seed: +e.target.value } })}
                className="h-8 bg-[#0d0d15] border-white/10 text-xs" />
            </div>
          </div>
          {state.genMode === 'img2img' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] text-slate-500">重绘强度 (Denoise)</Label>
                <span className="font-mono text-[10px] text-slate-500">{state.denoise.toFixed(2)}</span>
              </div>
              <input
                type="range" min={0.1} max={0.95} step={0.02} value={state.denoise}
                onChange={(e) => dispatch({ type: 'SET_PARAMS', patch: { denoise: +e.target.value } })}
                className="w-full accent-violet-500"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
