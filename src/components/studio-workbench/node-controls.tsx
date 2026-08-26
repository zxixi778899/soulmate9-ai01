'use client';

import { useStudio } from './StudioContext';
import { cn } from '@/lib/utils';
import type { StudioEnhancerKey } from './StudioWorkbench.types';
import { Sliders, Image as ImageIcon, ScanSearch, ZoomIn } from 'lucide-react';

// ─── Node control interfaces ──────────────────────────────────────────────────

export type { StudioEnhancerKey };

export interface NodeControlPanelProps {
  enhancerKey: 'controlnet' | 'adetailer' | 'upscale';
  title: string;
  icon: React.ReactNode;
}

// ─── ControlNet Panel ────────────────────────────────────────────────────────

export function ControlNetPanel() {
  const { state, dispatch } = useStudio();
  
  return (
    <details className="rounded-xl border border-violet-500/20 bg-white/[0.03] p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
        <div className="flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>ControlNet</span>
        </div>
        {state.enhancers.controlnet && <Sliders className="h-3 w-3" />}
      </summary>
      
      <div className="mt-3 space-y-3">
        {/* Type selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">ControlNet 类型</label>
          <div className="grid grid-cols-2 gap-1.5">
            {['openpose', 'depth', 'canny', 'normal'].map((type) => (
              <button
                key={type}
                onClick={() => dispatch({ type: 'SET_CONTROLNET_TYPE', value: type as 'openpose' | 'depth' | 'canny' | 'normal' })}
                className={cn(
                  'rounded-md border px-2 py-1.5 text-[10px] font-medium transition',
                  state.controlnetType === type
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
                )}
              >
                {type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Preprocessor */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">预处理器</label>
          <select
            value={state.controlnetPreprocessor || 'none'}
            onChange={(e) => dispatch({ type: 'SET_CONTROLNET_PREPROCESSOR', value: e.target.value })}
            className="h-7 w-full rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[10px] text-white focus:border-violet-500/50 focus:outline-none"
          >
            <option value="none">None</option>
            <option value="oneformer"></option>
            <option value="mlsdash"></option>
            <option value="dw_openpose_full"></option>
            <option value="depth_zoehf"></option>
            <option value="canny_low_threshold"></option>
            <option value="lineart_realistic"></option>
            <option value="softedge_anime"></option>
          </select>
        </div>

        {/* Strength slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-slate-500">Strength</label>
            <span className="font-mono text-[10px] text-violet-400">{state.controlnetStrength?.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={2}
            step={0.05}
            value={state.controlnetStrength ?? 0.8}
            onChange={(e) => dispatch({ type: 'SET_CONTROLNET_STRENGTH', value: +e.target.value })}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Guidance */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-slate-500">Guidance</label>
            <span className="font-mono text-[10px] text-violet-400">{state.controlnetGuidance}</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={state.controlnetGuidance}
            onChange={(e) => dispatch({ type: 'SET_CONTROLNET_GUIDANCE', value: +e.target.value })}
            className="w-full accent-violet-500"
          />
        </div>
      </div>
    </details>
  );
}

// ─── ADetailer Panel ──────────────────────────────────────────────────────────

export function ADetailerPanel() {
  const { state, dispatch } = useStudio();

  return (
    <details className="rounded-xl border border-violet-500/20 bg-white/[0.03] p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
        <div className="flex items-center gap-1.5">
          <ScanSearch className="h-3.5 w-3.5" />
          <span>ADetailer</span>
        </div>
        {state.enhancers.adetailer && <Sliders className="h-3 w-3" />}
      </summary>
      
      <div className="mt-3 space-y-3">
        {/* AD Model selection */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">Face Model</label>
          <select
            value={state.adetailerModel || 'nothing_v2'}
            onChange={(e) => dispatch({ type: 'SET_ADETAILER_MODEL', value: e.target.value })}
            className="h-7 w-full rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[10px] text-white focus:border-violet-500/50 focus:outline-none"
          >
            <option value="nothing_v2">Nothing V2</option>
            <option value="face_yolov8m_v2"></option>
            <option value="face_yolov8s_v2"></option>
            <option value="hands_yolov8m_v2"></option>
            <option value="hand_yolov8n"></option>
            <option value="whole_yolov8n"></option>
          </select>
        </div>

        {/* Confidence threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-slate-500">Confidence</label>
            <span className="font-mono text-[10px] text-violet-400">{state.adetailerConfidence}</span>
          </div>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={state.adetailerConfidence ?? 0.6}
            onChange={(e) => dispatch({ type: 'SET_ADETAILER_CONFIDENCE', value: +e.target.value })}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Denoise strength */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-slate-500">Denoise</label>
            <span className="font-mono text-[10px] text-violet-400">{state.adetailerDenoise?.toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.02}
            value={state.adetailerDenoise ?? 0.45}
            onChange={(e) => dispatch({ type: 'SET_ADETAILER_DENOISE', value: +e.target.value })}
            className="w-full accent-violet-500"
          />
        </div>

        {/* Face options */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">Detection Area</label>
          <div className="flex flex-wrap gap-1">
            {['face', 'head', 'nose_only'].map((area) => (
              <button
                key={area}
                onClick={() => dispatch({ type: 'SET_ADETAILER_AREA', value: area as 'face' | 'head' | 'nose_only' })}
                className={cn(
                  'rounded-md border px-2 py-1 text-[9px] font-medium transition',
                  state.adetailerArea === area
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
                )}
              >
                {area}
              </button>
            ))}
          </div>
        </div>
      </div>
    </details>
  );
}

// ─── Upscaler Panel ──────────────────────────────────────────────────────────

export function UpscalerPanel() {
  const { state, dispatch } = useStudio();

  return (
    <details className="rounded-xl border border-violet-500/20 bg-white/[0.03] p-3">
      <summary className="flex cursor-pointer items-center justify-between gap-2 text-[10px] font-semibold uppercase tracking-wider text-violet-400">
        <div className="flex items-center gap-1.5">
          <ZoomIn className="h-3.5 w-3.5" />
          <span>放大</span>
        </div>
        {state.enhancers.upscale && <Sliders className="h-3 w-3" />}
      </summary>
      
      <div className="mt-3 space-y-3">
        {/* Upscaler model */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">Upscaler Model</label>
          <select
            value={state.upscaleModel || '4x_UltraSharp'}
            onChange={(e) => dispatch({ type: 'SET_UPSCALER_MODEL', value: e.target.value })}
            className="h-7 w-full rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[10px] text-white focus:border-violet-500/50 focus:outline-none"
          >
            <option value="4x_UltraSharp">4x UltraSharp</option>
            <option value="4x_NetMRF_Comfortable_cat_dog"></option>
            <option value="50000_bpsd_vectorized"></option>
            <option value="RealESRGAN_epxsR2AnSRv2_X_4.pth"></option>
            <option value="RealESRGAN_x4plus.pth"></option>
            <option value="BSRGAN_x4.pth"></option>
            <option value="ESRGAN_4x"></option>
          </select>
        </div>

        {/* Scale factor */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">Scale Factor</label>
          <div className="flex flex-wrap gap-1.5">
            {[2, 3, 4].map((factor) => (
              <button
                key={factor}
                onClick={() => dispatch({ type: 'SET_UPSCALE_FACTOR', value: factor as 2 | 3 | 4 })}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-[10px] font-medium transition',
                  state.upscaleFactor === factor
                    ? 'border-violet-500/50 bg-violet-500/15 text-violet-200'
                    : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-white',
                )}
              >
                ×{factor}
              </button>
            ))}
          </div>
        </div>

        {/* Tile size */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-medium text-slate-500">Tile Size (max)</label>
          <select
            value={state.tileSize ?? 512}
            onChange={(e) => dispatch({ type: 'SET_TILE_SIZE', value: parseInt(e.target.value) })}
            className="h-7 w-full rounded-md border border-white/10 bg-[#0d0d15] px-2 text-[10px] text-white focus:border-violet-500/50 focus:outline-none"
          >
            <option value={256}>256</option>
            <option value={512}>512</option>
            <option value={768}>768</option>
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
          </select>
        </div>

        {/* Denoise for img2img upscale */}
        {state.genMode === 'img2img' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-medium text-slate-500">Denoise</label>
              <span className="font-mono text-[10px] text-violet-400">{state.upscaleDenoise?.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={state.upscaleDenoise ?? 0.3}
              onChange={(e) => dispatch({ type: 'SET_UPSCALE_DENOISE', value: +e.target.value })}
              className="w-full accent-violet-500"
            />
          </div>
        )}
      </div>
    </details>
  );
}

// ─── Node Control Container ──────────────────────────────────────────────────

export function NodeControls({ activeTab, setActiveTab }: { 
  activeTab: StudioEnhancerKey; 
  setActiveTab: (tab: StudioEnhancerKey) => void 
}) {
  const { state, dispatch } = useStudio();
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          图像增强
        </label>
        <p className="text-[9px] text-slate-600">点击左侧按钮查看详情与参数</p>
      </div>
      
      {/* Quick toggle buttons */}
      <div className="flex gap-1">
        {[{
          key: 'controlnet' as const, 
          label: 'ControlNet', 
          icon: <ImageIcon className="h-3 w-3" />
        }, {
          key: 'adetailer' as const, 
          label: 'ADetailer', 
          icon: <ScanSearch className="h-3 w-3" />
        }, {
          key: 'upscale' as const, 
          label: '放大', 
          icon: <ZoomIn className="h-3 w-3" />
        }].map((tabItem) => {
          const ready = state.enhancerStatuses.some(s => s.id === tabItem.key && s.enabled === true);
          const checked = state.enhancers[tabItem.key] && ready;
          return (
            <button
              key={tabItem.key}
              onClick={() => dispatch({ type: 'SET_ENHANCER', key: tabItem.key, value: !checked })}
              disabled={!ready}
              className={cn(
                'relative h-4 w-7 shrink-0 rounded-full transition',
                checked ? 'bg-violet-500' : 'bg-white/10',
                (!ready || !checked) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
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
        })}
      </div>

      {/* Detailed controls */}
      <div className="min-h-[200px]">
        {activeTab === 'controlnet' && <ControlNetPanel />}
        {activeTab === 'adetailer' && <ADetailerPanel />}
        {activeTab === 'upscale' && <UpscalerPanel />}
      </div>
    </div>
  );
}
