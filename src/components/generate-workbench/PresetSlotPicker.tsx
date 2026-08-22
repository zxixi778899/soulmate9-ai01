'use client';

/**
 * PresetSlotPicker — full-screen modal listing the pose / outfit / scene
 * options for one console slot. Locked presets stay visible (blur + lock)
 * and trigger the intimacy hint instead of selecting.
 */

import { Lock, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { OutfitOption, SlotKind, WorkbenchPreset } from './types';

export function PresetSlotPicker(props: {
  slot: SlotKind;
  posePresets: WorkbenchPreset[];
  scenePresets: WorkbenchPreset[];
  outfits: OutfitOption[];
  selectedPose: WorkbenchPreset | null;
  selectedScene: WorkbenchPreset | null;
  selectedOutfit: OutfitOption | null;
  onPickPose: (preset: WorkbenchPreset | null) => void;
  onPickScene: (preset: WorkbenchPreset | null) => void;
  onPickOutfit: (outfit: OutfitOption | null) => void;
  onLocked: () => void;
  onClose: () => void;
  isZh: boolean;
}) {
  const { t } = useTranslation();

  const title =
    props.slot === 'pose'
      ? t('generate.slotPose')
      : props.slot === 'outfit'
        ? t('generate.slotOutfit')
        : t('generate.slotScene');

  const presets: WorkbenchPreset[] =
    props.slot === 'pose' ? props.posePresets : props.slot === 'scene' ? props.scenePresets : [];

  const isPresetSelected = (preset: WorkbenchPreset): boolean => {
    if (props.slot === 'pose') return props.selectedPose?.slug === preset.slug;
    if (props.slot === 'scene') return props.selectedScene?.slug === preset.slug;
    return false;
  };

  const pickPreset = (preset: WorkbenchPreset) => {
    if (preset.locked) {
      props.onLocked();
      return;
    }
    const deselect = isPresetSelected(preset);
    if (props.slot === 'pose') props.onPickPose(deselect ? null : preset);
    else if (props.slot === 'scene') props.onPickScene(deselect ? null : preset);
    props.onClose();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-hidden
        onClick={props.onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div className="relative w-full sm:max-w-2xl max-h-[80vh] overflow-hidden rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#121212] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">{title}</h3>
          <button
            type="button"
            onClick={props.onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {props.slot === 'outfit' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {props.outfits.map((outfit) => {
                const active = props.selectedOutfit?.id === outfit.id;
                return (
                  <button
                    key={outfit.id}
                    type="button"
                    onClick={() => {
                      props.onPickOutfit(active ? null : outfit);
                      props.onClose();
                    }}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-all',
                      active
                        ? 'border-[#FD5FC2] bg-[#FD5FC2]/10'
                        : 'border-white/10 bg-white/[0.03] hover:border-[#FD5FC2]/40',
                    )}
                  >
                    <span className="text-xl">{outfit.emoji || '👗'}</span>
                    <span className="mt-1 block text-xs font-semibold text-white truncate">{outfit.name}</span>
                    <span className="block text-[10px] text-white/40 capitalize">
                      {outfit.category}
                      {outfit.tier === 'premium' ? ' · VIP' : ''}
                    </span>
                  </button>
                );
              })}
              {props.outfits.length === 0 && (
                <p className="col-span-full py-10 text-center text-xs text-white/35">{t('generate.noPresets')}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {presets.map((preset) => {
                const active = isPresetSelected(preset);
                const label = props.isZh ? preset.label_zh || preset.label_en : preset.label_en || preset.label_zh;
                return (
                  <button
                    key={`${preset.category}-${preset.slug}`}
                    type="button"
                    onClick={() => pickPreset(preset)}
                    className={cn(
                      'relative aspect-[172/214] rounded-lg overflow-hidden border transition-all active:scale-95 text-left',
                      active
                        ? 'border-[#FD5FC2] ring-1 ring-[#FD5FC2]/60 shadow-[0_0_16px_rgba(253,95,194,0.35)]'
                        : 'border-white/10 hover:border-[#FD5FC2]/45',
                    )}
                    title={label}
                  >
                    {preset.preview_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- dynamic preset thumbnail
                      <img
                        src={preset.preview_url}
                        alt={label}
                        loading="lazy"
                        className={cn(
                          'absolute inset-0 h-full w-full object-cover',
                          preset.locked && 'blur-md scale-110 opacity-70',
                        )}
                      />
                    ) : (
                      <span className={cn('absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a0f22] to-[#12081a]', preset.locked && 'blur-[2px] opacity-80')}>
                        <Sparkles className="h-5 w-5 text-[#FD5FC2]/50" />
                      </span>
                    )}
                    {preset.locked && (
                      <span className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center">
                        <Lock className="h-3 w-3 text-[#ffb3cd]" />
                      </span>
                    )}
                    {preset.tier === 'premium' && !preset.locked && (
                      <span className="absolute top-1 left-1 text-[8px] uppercase tracking-wide px-1 rounded bg-black/50 text-amber-300">
                        VIP
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] leading-tight text-white bg-gradient-to-t from-black/80 to-transparent truncate">
                      {label}
                    </span>
                  </button>
                );
              })}
              {presets.length === 0 && (
                <p className="col-span-full py-10 text-center text-xs text-white/35">{t('generate.noPresets')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
