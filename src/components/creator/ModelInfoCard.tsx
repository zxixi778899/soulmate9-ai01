'use client';

/**
 * ModelInfoCard - Display model/LORA information for generation
 * Shows selected model, LoRA stack, parameters, and routing reason
 */

import { cn } from '@/lib/utils';
// import type { TranslationKey } from '@/lib/i18n/context'; // Not used anymore
import { Sparkles, Info, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

export type ModelLoraInfo = {
  selected: Array<{ name: string; strength_model: number; strength_clip: number }>;
  configured: string[];
  missing: string[];
  inventorySource: string;
  triggerWords: string[];
};

export type ModelMeta = {
  category: string;
  renderStyle: string;
  nsfwLevel: number;
  modelFamily: string;
  checkpoint: string;
  steps: number;
  cfg: number;
  fluxGuidance: number;
  sampler: string;
  scheduler: string;
  width: number;
  height: number;
  presetId: string;
  reason: string;
};

interface ModelInfoCardProps {
  modelMeta?: ModelMeta | null;
  loraInfo?: ModelLoraInfo | null;
  error?: string | null;
  className?: string;
}

export function ModelInfoCard({ modelMeta, loraInfo, error, className }: ModelInfoCardProps) {

  if (error) {
    return (
      <div className={cn('rounded-xl border border-red-500/30 bg-red-500/5 p-4', className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-400 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-red-300">{'Model Loading Error'}</div>
            <div className="mt-1 text-xs text-red-400/70">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  if (!modelMeta) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-white/[0.02] p-4 text-center', className)}>
        <div className="text-xs text-white/30">{'Loading model info...'}</div>
      </div>
    );
  }

  // Model family badge color
  const familyBadgeClass = modelMeta.modelFamily === 'flux'
    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white'
    : modelMeta.modelFamily === 'pony'
      ? 'bg-gradient-to-r from-orange-500 to-pink-500 text-white'
      : 'bg-gradient-to-r from-yellow-500 to-amber-500 text-black';

  return (
    <div className={cn('space-y-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.02] p-4 shadow-lg', className)}>
      
      {/* Header: Model Family & Checkpoint */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white/90">
            <Sparkles className="h-4 w-4 text-[#FF2D78]" />
            {'Model Information'}
          </h3>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider', familyBadgeClass)}>
            {modelMeta.modelFamily}
          </span>
        </div>

        {/* Checkpoint name */}
        <div className="rounded-lg bg-white/[0.03] p-2.5">
          <div className="truncate text-xs font-medium text-white/80">{modelMeta.checkpoint}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-white/30">
            <span>{'Steps'}: {modelMeta.steps}</span>
            <span>•</span>
            <span>CFG: {modelMeta.fluxGuidance}</span>
            <span>•</span>
            <span>{'Resolution'}: {modelMeta.width}×{modelMeta.height}</span>
          </div>
        </div>
      </div>

      {/* LoRA Stack */}
      {loraInfo && loraInfo.selected.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white/80">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
            {'LoRA Stack'} ({loraInfo.selected.length})
          </div>
          
          <div className="space-y-1.5">
            {loraInfo.selected.map((lora, idx) => (
              <div
                key={`${lora.name}-${idx}`}
                className="relative overflow-hidden rounded-lg bg-white/[0.03] p-2"
              >
                {/* Progress bar background */}
                <div
                  className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6]"
                  style={{ width: `${lora.strength_model * 100}%` }}
                />
                
                <div className="relative flex items-center justify-between">
                  <div className="truncate text-xs font-medium text-white/85">
                    {lora.name}
                  </div>
                  <div className="text-right text-[10px] text-white/40">
                    <div>M: {lora.strength_model}</div>
                    <div>C: {lora.strength_clip}</div>
                  </div>
                </div>

                {/* Trigger words tooltip */}
                {loraInfo.triggerWords.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {loraInfo.triggerWords.slice(0, 3).map(word => (
                      <span
                        key={word}
                        className="rounded bg-[#FF2D78]/20 px-1.5 py-0.5 text-[9px] text-[#FF2D78]"
                      >
                        {word}
                      </span>
                    ))}
                    {loraInfo.triggerWords.length > 3 && (
                      <span className="text-[9px] text-white/30">+{loraInfo.triggerWords.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Missing LoRAs warning */}
          {loraInfo.missing.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-yellow-500/10 p-2">
              <XCircle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <div>
                <div className="text-xs font-semibold text-yellow-400">
                  {'Some LoRAs missing'}
                </div>
                <div className="mt-0.5 text-[10px] text-yellow-400/70">
                  {loraInfo.missing.slice(0, 3).join(', ')}
                  {loraInfo.missing.length > 3 && ` (+${loraInfo.missing.length - 3})`}
                </div>
              </div>
            </div>
          )}

          {/* Inventory source info */}
          <div className="mt-2 text-[10px] text-white/25">
            {'Inventory from'}: {loraInfo.inventorySource}
          </div>
        </div>
      )}

      {/* Parameters Grid */}
      <div className="grid grid-cols-3 gap-2 rounded-lg bg-white/[0.02] p-2.5">
        <div className="text-center">
          <div className="text-[10px] text-white/40">{'Sampler'}</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-white/80" title={modelMeta.sampler}>
            {modelMeta.sampler}
          </div>
        </div>
        <div className="text-center border-x border-white/10">
          <div className="text-[10px] text-white/40">{'Scheduler'}</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-white/80" title={modelMeta.scheduler}>
            {modelMeta.scheduler}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-white/40">{'Preset'}</div>
          <div className="mt-0.5 truncate text-xs font-semibold text-white/80" title={modelMeta.presetId}>
            {modelMeta.presetId.split('-').slice(0, 2).join('\n')}
          </div>
        </div>
      </div>

      {/* Route Reason (User Education) */}
      <div className="rounded-lg bg-blue-500/5 p-2.5">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
          <Info className="h-3 w-3" />
          {'Why this model'}
        </div>
        <p className="text-xs text-white/50 leading-relaxed">{modelMeta.reason}</p>
      </div>

    </div>
  );
}
