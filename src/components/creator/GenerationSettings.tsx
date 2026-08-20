'use client';

/**
 * GenerationSettings - Advanced parameter controls for image generation
 * Allows users to customize steps, CFG, sampler, seed, aspect ratio, etc.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { Settings, Sliders, X, Minimize2 } from 'lucide-react';

type AspectRatio = '1:1' | '2:3' | '3:2' | '9:16' | '16:9' | 'custom';

// interface GenerationSettingsProps {
//   steps?: number;
//   cfg?: number;
//   fluxGuidance?: number;
//   width?: number;
//   height?: number;
//   sampler?: string;
//   scheduler?: string;
//   onSettingsChange?: (settings: GenerationSettings) => void;
//   className?: string;
// }

export interface GenerationSettings {
  steps: number;
  cfg: number;
  fluxGuidance: number;
  width: number;
  height: number;
  aspectRatio: AspectRatio;
  sampler: string;
  scheduler: string;
  seed?: number | null; // Optional custom seed
  turboMode: boolean;   // Fast preview mode (low steps, low CFG)
  randomSeed: boolean;  // Whether to use random seed each generation
}

const DEFAULT_SETTINGS: GenerationSettings = {
  steps: 28,
  cfg: 1,
  fluxGuidance: 3.5,
  width: 1024,
  height: 1536,
  aspectRatio: '2:3',
  sampler: 'euler',
  scheduler: 'simple',
  seed: null,
  turboMode: false,
  randomSeed: true,
};

const ASPECT_RATIOS: Array<{ label: string; ratio: AspectRatio; width: number; height: number }> = [
  { label: '1:1', ratio: '1:1', width: 1024, height: 1024 },
  { label: '2:3', ratio: '2:3', width: 1024, height: 1536 },
  { label: '3:2', ratio: '3:2', width: 1536, height: 1024 },
  { label: '9:16', ratio: '9:16', width: 832, height: 1216 },
  { label: '16:9', ratio: '16:9', width: 1216, height: 832 },
];

interface GenerationSettingsProps extends GenerationSettings {
  onSettingsChange?: (settings: GenerationSettings) => void;
  className?: string;
}

interface GenerationSettingsPropsWithOpen extends GenerationSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GenerationSettings({ 
  steps, 
  cfg, 
  fluxGuidance,
  width, 
  height, 
  aspectRatio,
  sampler, 
  scheduler, 
  seed,
  turboMode,
  randomSeed,
  onSettingsChange,
  isOpen,
  onClose,
  className,
}: GenerationSettingsPropsWithOpen) {
  const { t } = useTranslation();
  const [localSettings, setLocalSettings] = useState<GenerationSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (isOpen) {
      setLocalSettings(prev => ({
        ...prev,
        ...(steps !== undefined && { steps }),
        ...(cfg !== undefined && { cfg }),
        ...(fluxGuidance !== undefined && { fluxGuidance }),
        ...(width !== undefined && { width }),
        ...(height !== undefined && { height }),
        ...(sampler !== undefined && { sampler }),
        ...(scheduler !== undefined && { scheduler }),
      }));
    }
  }, [isOpen, steps, cfg, fluxGuidance, width, height, sampler, scheduler]);

  const updateSetting = <K extends keyof GenerationSettings>(key: K, value: GenerationSettings[K]) => {
    const updated = { ...localSettings, [key]: value };
    setLocalSettings(updated);
    onSettingsChange?.(updated);
  };

  const handleAspectRatioChange = (ratio: AspectRatio) => {
    const found = ASPECT_RATIOS.find(r => r.ratio === ratio);
    if (found) {
      updateSetting('aspectRatio', ratio);
      updateSetting('width', found.width);
      updateSetting('height', found.height);
    }
  };

  const applyPreset = (preset: 'fast' | 'balanced' | 'quality' | 'ultra') => {
    const presets = {
      fast: { steps: 8, cfg: 1, fluxGuidance: 2.5, turboMode: true },
      balanced: { steps: 24, cfg: 1, fluxGuidance: 3.5, turboMode: false },
      quality: { steps: 30, cfg: 1, fluxGuidance: 4.0, turboMode: false },
      ultra: { steps: 40, cfg: 1, fluxGuidance: 4.5, turboMode: false },
    };
    const presetVals = presets[preset];
    Object.entries(presetVals).forEach(([key, val]) => {
      if (key in localSettings) {
        updateSetting(key as keyof GenerationSettings, val);
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className={cn('fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm', className)} onClick={onClose}>
      {/* Settings Panel */}
      <div
        className="flex h-full max-h-[100dvh] w-full max-w-md flex-col overflow-y-auto bg-[#0a0612] border-l border-white/10"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-[#FF2D78]" />
            <h2 className="text-base font-bold text-white/90">{'Generation Settings'}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded hover:bg-white/[0.04] p-1 transition-colors"
          >
            <X className="h-4 w-4 text-white/50" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          
          {/* Quality Presets */}
          <div className="mb-5">
            <div className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-white/70">
              <Sliders className="h-3.5 w-3.5" />
              {'Quality Presets'}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: 'fast', label: 'Fast', desc: '8 steps' },
                { id: 'balanced', label: 'Balanced', desc: '24 steps' },
                { id: 'quality', label: 'Quality', desc: '30 steps' },
                { id: 'ultra', label: 'Ultra', desc: '40 steps' },
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPreset(p.id as any)}
                  className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-left hover:border-[#FF2D78]/40"
                >
                  <div className="text-xs font-semibold text-white/80">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-white/35">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Steps */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              {'Steps'} {localSettings.turboMode && `(turbo)`}
            </label>
            <input
              type="range"
              min="8"
              max="64"
              step="2"
              value={localSettings.steps}
              onChange={e => updateSetting('steps', Number(e.target.value))}
              disabled={localSettings.turboMode}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#FF2D78]"
            />
            <div className="mt-1.5 flex items-center justify-between text-xs text-white/40">
              <span>{localSettings.steps}</span>
              <span className={cn(localSettings.turboMode ? 'text-[#FF2D78]' : '')}>{localSettings.turboMode ? '(turbo locked)' : ''}</span>
            </div>
          </div>

          {/* CFG Guidance */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              {'CFG Guidance'}
            </label>
            <input
              type="range"
              min="1"
              max="10"
              step="0.1"
              value={localSettings.cfg}
              onChange={e => updateSetting('cfg', Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#FF2D78]"
            />
            <div className="mt-1.5 text-xs text-white/40">{localSettings.cfg}</div>
          </div>

          {/* FLUX Guidance */}
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-medium text-white/60">
              FLUX Guidance
            </label>
            <input
              type="range"
              min="2"
              max="5"
              step="0.1"
              value={localSettings.fluxGuidance}
              onChange={e => updateSetting('fluxGuidance', Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-purple-500"
            />
            <div className="mt-1.5 text-xs text-white/40">{localSettings.fluxGuidance}</div>
          </div>

          {/* Aspect Ratio */}
          <div className="mb-5">
            <div className="mb-2 text-xs font-medium text-white/60">{'Aspect Ratio'}</div>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map(ar => (
                <button
                  key={ar.ratio}
                  type="button"
                  onClick={() => handleAspectRatioChange(ar.ratio)}
                  className={cn(
                    'rounded-lg border px-2 py-2 text-center text-xs transition-all',
                    localSettings.aspectRatio === ar.ratio
                      ? 'border-[#FF2D78] bg-[#FF2D78]/15 text-white'
                      : 'border-white/10 bg-white/[0.03] text-white/50 hover:border-white/25'
                  )}
                >
                  <div className="font-semibold">{ar.label}</div>
                  <div className="mt-0.5 text-[10px] text-white/35">{ar.width}×{ar.height}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Seed Control */}
          <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-medium text-white/60">Seed</div>
              <label className="flex items-center gap-2 text-[10px] text-white/40">
                <input
                  type="checkbox"
                  checked={localSettings.randomSeed}
                  onChange={e => updateSetting('randomSeed', e.target.checked)}
                  className="h-3.5 w-3.5 accent-[#FF2D78]"
                />
                Random
              </label>
            </div>
            
            {!localSettings.randomSeed && (
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Optional"
                  value={localSettings.seed || ''}
                  onChange={e => updateSetting('seed', e.target.value ? Number(e.target.value) : null)}
                  className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs outline-none focus:border-[#FF2D78]/50"
                />
                <button
                  type="button"
                  onClick={() => updateSetting('seed', Math.floor(Math.random() * 999999999))}
                  className="rounded-lg bg-white/[0.04] px-3 text-xs text-white/50 hover:bg-white/[0.08]"
                >
                  Randomize
                </button>
              </div>
            )}
          </div>

          {/* Sampler & Scheduler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">{'Sampler'}</label>
              <select
                value={localSettings.sampler}
                onChange={e => updateSetting('sampler', e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 outline-none"
              >
                <option value="euler">Euler</option>
                <option value="euler_ancestral">Euler A</option>
                <option value="heun">Heun</option>
                <option value="dpmpp_2m">DPM++ 2M</option>
                <option value="dpmpp_2m_sde">DPM++ 2M SDE</option>
                <option value="dpmpp_sde">DPM++ SDE</option>
                <option value="ddim">DDIM</option>
                <option value="lcm">LCM</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/60">{'Scheduler'}</label>
              <select
                value={localSettings.scheduler}
                onChange={e => updateSetting('scheduler', e.target.value)}
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 text-xs text-white/70 outline-none"
              >
                <option value="simple">Simple</option>
                <option value="karras">Karras</option>
                <option value="exponential">Exponential</option>
                <option value="sgm_uniform">SGM Uniform</option>
              </select>
            </div>
          </div>

        </div>

        {/* Footer: Reset Button */}
        <div className="border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => setLocalSettings(DEFAULT_SETTINGS)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2.5 text-xs font-medium text-white/50 hover:bg-white/[0.06]"
          >
            Reset to Defaults
          </button>
        </div>

      </div>
    </div>
  );
}
