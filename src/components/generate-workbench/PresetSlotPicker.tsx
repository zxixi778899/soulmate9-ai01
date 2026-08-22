'use client';

/**
 * PresetSlotPicker — full-screen modal listing the pose / outfit / scene
 * options for one console slot. All three categories share the same 2:3
 * portrait card layout. Locked presets stay visible (blur + lock) and trigger
 * the intimacy hint instead of selecting. Admins can create new preview cards
 * (upload image + bilingual label + prompt hint) and delete custom ones.
 */

import { useRef, useState } from 'react';
import { Loader2, Lock, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { isCustomPresetSlug, type OutfitOption, type SlotKind, type WorkbenchPreset } from './types';

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
  isAdmin?: boolean;
  onAdminCreate?: (
    category: SlotKind,
    input: { label_en: string; label_zh: string; prompt_hint: string; file: File | null },
  ) => Promise<void>;
  onAdminDelete?: (category: SlotKind, slug: string) => Promise<void>;
  onClose: () => void;
  isZh: boolean;
}) {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [labelEn, setLabelEn] = useState('');
  const [labelZh, setLabelZh] = useState('');
  const [promptHint, setPromptHint] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const submitCreate = async () => {
    if (!props.onAdminCreate || creating) return;
    if (!labelEn.trim() || !file) return;
    setCreating(true);
    try {
      await props.onAdminCreate(props.slot, {
        label_en: labelEn.trim(),
        label_zh: labelZh.trim(),
        prompt_hint: promptHint.trim(),
        file,
      });
      setFormOpen(false);
      setLabelEn('');
      setLabelZh('');
      setPromptHint('');
      setFile(null);
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    'w-full h-9 px-3 rounded-lg bg-[#1D1D1D] border border-white/[0.08] text-xs text-white placeholder-white/25 focus:border-[#FD5FC2]/50 outline-none';

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
          <div className="flex items-center gap-2">
            {props.isAdmin && props.onAdminCreate && !formOpen && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="h-8 px-3 rounded-full border border-[#FD5FC2]/50 text-[11px] font-semibold text-[#ffb3dc] hover:bg-[#FD5FC2]/10 inline-flex items-center gap-1.5 transition-all"
              >
                <Plus className="h-3.5 w-3.5" /> {t('generate.adminNew')}
              </button>
            )}
            <button
              type="button"
              onClick={props.onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[0.06]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-4">
          {/* Admin create form */}
          {props.isAdmin && formOpen && (
            <div className="mb-4 rounded-xl border border-[#FD5FC2]/30 bg-[#FD5FC2]/[0.05] p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                  placeholder="Label (EN) *"
                  className={inputClass}
                />
                <input
                  value={labelZh}
                  onChange={(e) => setLabelZh(e.target.value)}
                  placeholder="标签 (中文)"
                  className={inputClass}
                />
              </div>
              <input
                value={promptHint}
                onChange={(e) => setPromptHint(e.target.value)}
                placeholder={t('generate.promptHintPlaceholder')}
                className={inputClass}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 flex-1 rounded-lg border border-dashed border-white/20 text-[11px] text-white/60 hover:border-[#FD5FC2]/50 hover:text-white transition-all truncate px-3"
                >
                  {file ? file.name : t('generate.pickPreviewImage')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) setFile(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => void submitCreate()}
                  disabled={creating || !labelEn.trim() || !file}
                  className="h-9 px-4 rounded-lg text-[11px] font-bold text-white disabled:opacity-40 inline-flex items-center gap-1.5 transition-all"
                  style={{ background: 'linear-gradient(0deg, #FF1CAC, #FD5FC2 50%, #FF79D1)' }}
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {t('generate.adminCreate')}
                </button>
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="h-9 w-9 rounded-lg border border-white/10 flex items-center justify-center text-white/60 hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {props.slot === 'outfit' ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {props.outfits.map((outfit) => {
                const active = props.selectedOutfit?.id === outfit.id;
                const custom = isCustomPresetSlug(outfit.id);
                return (
                  <div key={outfit.id} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        props.onPickOutfit(active ? null : outfit);
                        props.onClose();
                      }}
                      className={cn(
                        'relative w-full aspect-[2/3] rounded-lg overflow-hidden border transition-all active:scale-95 text-left',
                        active
                          ? 'border-[#FD5FC2] ring-1 ring-[#FD5FC2]/60 shadow-[0_0_16px_rgba(253,95,194,0.35)]'
                          : 'border-white/10 hover:border-[#FD5FC2]/45',
                      )}
                      title={outfit.name}
                    >
                      {outfit.preview_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic preset thumbnail
                        <img src={outfit.preview_url} alt={outfit.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-[#2a0f22] to-[#12081a]">
                          <span className="text-2xl">{outfit.emoji || '👗'}</span>
                        </span>
                      )}
                      {outfit.tier === 'premium' && (
                        <span className="absolute top-1 left-1 text-[8px] uppercase tracking-wide px-1 rounded bg-black/50 text-amber-300">
                          VIP
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[10px] leading-tight text-white bg-gradient-to-t from-black/80 to-transparent truncate">
                        {outfit.name}
                      </span>
                    </button>
                    {props.isAdmin && custom && props.onAdminDelete && (
                      <button
                        type="button"
                        onClick={() => void props.onAdminDelete?.(props.slot, outfit.id)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-red-300"
                        aria-label={`Delete ${outfit.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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
                const custom = isCustomPresetSlug(preset.slug);
                return (
                  <div key={`${preset.category}-${preset.slug}`} className="relative">
                    <button
                      type="button"
                      onClick={() => pickPreset(preset)}
                      className={cn(
                        'relative w-full aspect-[2/3] rounded-lg overflow-hidden border transition-all active:scale-95 text-left',
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
                    {props.isAdmin && custom && props.onAdminDelete && !preset.locked && (
                      <button
                        type="button"
                        onClick={() => void props.onAdminDelete?.(props.slot, preset.slug)}
                        className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-red-300"
                        aria-label={`Delete ${label}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
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
