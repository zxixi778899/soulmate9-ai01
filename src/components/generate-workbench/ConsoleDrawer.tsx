'use client';

/**
 * ConsoleDrawer — the left-hand generation console (ourdream-style).
 *
 * Pure presentation: mode toggle, create/edit sub-mode, four preset slots,
 * custom prompt, quantity / settings popovers and the gradient Generate pill.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Coins, Film, Flame, Image as ImageIcon, Loader2, Lock,
  Minus, Plus, Settings2, Sparkles, User, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { GenJobProgress } from '@/components/common/GenJobProgress';
import { girlAvatarUrl, type Girl, type OutfitOption, type PersonalWork, type SlotKind, type WorkbenchMode, type WorkbenchPreset, type WorkbenchSubMode } from './types';
import { Badge } from '@/components/ui/badge';

const COUNT_OPTIONS = [1, 2, 4];
const UPSCALE_OPTIONS = [0, 2, 4];

/** Preset slot visibility is user-managed and persisted locally. */
const SLOT_STORAGE_KEY = 'generate-console-visible-slots';
const ALL_SLOTS: SlotKind[] = ['pose', 'outfit', 'scene'];

export interface ConsoleDrawerProps {
  mode: WorkbenchMode;
  onModeChange: (mode: WorkbenchMode) => void;
  /** Video is Premium/Unlimited only — locked tab guides to upgrade. */
  videoLocked: boolean;
  onVideoLocked: () => void;
  subMode: WorkbenchSubMode;
  onSubModeChange: (mode: WorkbenchSubMode) => void;
  girl: Girl | null;
  girls: Girl[];
  onSelectGirl: (id: string) => void;
  onClearGirl: () => void;
  selectedPose: WorkbenchPreset | null;
  selectedScene: WorkbenchPreset | null;
  selectedOutfit: OutfitOption | null;
  presetsLoading: boolean;
  lockedHint: boolean;
  onOpenSlot: (slot: SlotKind) => void;
  onClearPose: () => void;
  onClearScene: () => void;
  onClearOutfit: () => void;
  
  // ========== ControlNet Multi-Unit Status ==========
  poseControlNetActive?: boolean;
  outfitControlNetActive?: boolean;
  sceneControlNetActive?: boolean;
  identityControlNetActive?: boolean; // Auto-detected if IP-Adapter face available
  prompt: string;
  onPromptChange: (value: string) => void;
  count: number;
  onCountChange: (count: number) => void;
  faceFix: boolean;
  onFaceFixChange: (value: boolean) => void;
  upscale: number;
  onUpscaleChange: (value: number) => void;
  /** Quick tools under the prompt box (image mode only). */
  undressOn: boolean;
  onUndressToggle: () => void;
  hdOn: boolean;
  onHdToggle: () => void;
  identityOn: boolean;
  onIdentityChange: (value: boolean) => void;
  identityAvailable: boolean;
  baseImage: string | null;
  uploadingBase: boolean;
  onBaseUpload: (file: File) => void;
  onClearBase: () => void;
  credits: number | null;
  busy: boolean;
  proLocked: boolean;
  onGenerate: () => void;
  submitError: string | null;
  activeJobId: string | null;
  isZh: boolean;
  personalWorks: PersonalWork[];
  onPickWork: (url: string) => void;
  hasControlNetResources: boolean; // NEW: Flag for showing CN panel hint
  presetIdentityImage?: string | null; // Identity image from selected preset (IP-Adapter face)
}

export function ConsoleDrawer(props: ConsoleDrawerProps) {
  const { t } = useTranslation();
  const [girlPickerOpen, setGirlPickerOpen] = useState(false);
  const [countOpen, setCountOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const baseInputRef = useRef<HTMLInputElement | null>(null);

  // ========== IP-Adapter Auto Detection ==========
  // Detect if preset has identity image (IP-Adapter face reference)
  const hasPresetIdentity = Boolean(
    props.presetIdentityImage ||
    props.selectedPose?.ip_adapter_face ||
    props.selectedOutfit?.preview_url && props.identityOn
  );

  // Preset slots can be added / removed; the layout survives reloads.
  const [visibleSlots, setVisibleSlots] = useState<SlotKind[]>(ALL_SLOTS);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SLOT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((s): s is SlotKind => ALL_SLOTS.includes(s as SlotKind));
          if (valid.length > 0) setVisibleSlots(valid);
        }
      }
    } catch {
      // Private mode / corrupt entry — keep the default layout.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(visibleSlots));
    } catch {
      // Storage full / private mode — visibility stays in-memory only.
    }
  }, [visibleSlots]);

  const hiddenSlots = ALL_SLOTS.filter((s) => !visibleSlots.includes(s));

  const slotLabel = 'text-[10px] uppercase tracking-[0.14em] text-white/40';
  const pillBase =
    'flex-1 h-9 inline-flex items-center justify-center gap-1.5 rounded-full text-xs font-semibold transition-all';

  /** Render config per preset slot — drives the dynamic add/remove grid. */
  const slotDefs: Record<SlotKind, {
    label: string;
    selectedLabel: string | null;
    previewUrl: string | null;
    loading: boolean;
    onClick: () => void;
    onClear?: () => void;
    controlnetActive?: boolean;
    controlnetType?: 'openpose' | 'canny' | 'depth' | 'segment';
  }> = {
    pose: {
      label: t('generate.slotPose'),
      selectedLabel: props.selectedPose ? (props.isZh ? props.selectedPose.label_zh || props.selectedPose.label_en : props.selectedPose.label_en) : null,
      previewUrl: props.selectedPose?.preview_url || null,
      loading: props.presetsLoading,
      onClick: () => props.onOpenSlot('pose'),
      onClear: props.selectedPose ? props.onClearPose : undefined,
      controlnetActive: props.poseControlNetActive ?? Boolean(props.selectedPose?.openpose_json || props.selectedPose?.body_depth_url),
      controlnetType: props.selectedPose?.openpose_json ? 'openpose' : props.selectedPose?.body_depth_url ? 'depth' : undefined,
    },
    outfit: {
      label: t('generate.slotOutfit'),
      selectedLabel: props.selectedOutfit ? `${props.selectedOutfit.emoji || ''} ${props.selectedOutfit.name}` : null,
      previewUrl: null,
      loading: false,
      onClick: () => props.onOpenSlot('outfit'),
      onClear: props.selectedOutfit ? props.onClearOutfit : undefined,
      controlnetActive: props.outfitControlNetActive ?? Boolean(props.selectedOutfit?.canny_edge_url || props.selectedOutfit?.person_mask_url),
      controlnetType: props.selectedOutfit?.canny_edge_url ? 'canny' : props.selectedOutfit?.person_mask_url ? 'segment' : undefined,
    },
    scene: {
      label: t('generate.slotScene'),
      selectedLabel: props.selectedScene ? (props.isZh ? props.selectedScene.label_zh || props.selectedScene.label_en : props.selectedScene.label_en) : null,
      previewUrl: props.selectedScene?.preview_url || null,
      loading: props.presetsLoading,
      onClick: () => props.onOpenSlot('scene'),
      onClear: props.selectedScene ? props.onClearScene : undefined,
      controlnetActive: props.sceneControlNetActive ?? Boolean(props.selectedScene?.body_depth_url || props.selectedScene?.canny_edge_url || props.selectedScene?.bg_mask_url),
      controlnetType: props.selectedScene?.body_depth_url ? 'depth' : props.selectedScene?.canny_edge_url || props.selectedScene?.bg_mask_url ? 'canny' : undefined,
    },
  };

  return (
    <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-[#121212] shadow-[0_16px_48px_rgba(0,0,0,0.5)] overflow-hidden">
      {/* Header: title + credits */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-white">
          {t('generate.title')}
        </h2>
        {props.credits !== null && (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 h-6 text-[11px] text-amber-300">
            <Coins className="h-3 w-3" /> {props.credits}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 space-y-4">
        {/* ── Mode toggle: Image / Video (video locked for Pro and below) ── */}
        <div className="flex rounded-full border border-white/10 bg-[#0D0D0D] p-1">
          {(['image', 'video'] as const).map((m) => {
            const locked = m === 'video' && props.videoLocked;
            return (
            <button
              key={m}
              type="button"
              onClick={() => (locked ? props.onVideoLocked() : props.onModeChange(m))}
              title={locked ? t('generate.videoPremiumOnly') : undefined}
              className={cn(
                pillBase,
                props.mode === m
                  ? 'bg-white text-black shadow'
                  : 'text-[#AAAAAA] hover:text-white',
                locked && 'opacity-80',
              )}
            >
              {m === 'image' ? <ImageIcon className="h-3.5 w-3.5" /> : locked ? <Lock className="h-3.5 w-3.5" /> : <Film className="h-3.5 w-3.5" />}
              {m === 'image' ? t('generate.imageMode') : t('generate.videoMode')}
              {locked && (
                <span className="rounded bg-[#FD5FC2]/20 px-1 py-px text-[9px] font-semibold uppercase tracking-wider text-[#FD5FC2]">
                  Premium
                </span>
              )}
            </button>
            );
          })}
        </div>

        {/* ── Sub-mode: Create / Edit (image only) ── */}
        {props.mode === 'image' && (
          <div className="flex gap-2">
            {(['create', 'edit'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => props.onSubModeChange(s)}
                className={cn(
                  'flex-1 h-8 rounded-lg border text-[11px] font-medium transition-all',
                  props.subMode === s
                    ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/15 text-white'
                    : 'border-white/10 text-white/45 hover:text-white',
                )}
              >
                {s === 'create' ? t('generate.createMode') : t('generate.editMode')}
              </button>
            ))}
          </div>
        )}

        {/* ── Edit base image ── */}
        {(props.mode === 'video' || (props.mode === 'image' && props.subMode === 'edit')) && (
          <div>
            <div className={cn(slotLabel, 'mb-2')}>
              {props.mode === 'video' ? t('generate.baseImage') : t('generate.editBase')}
            </div>
            {props.baseImage ? (
              <div className="relative rounded-xl overflow-hidden border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element -- dynamic upload/result URL */}
                <img src={props.baseImage} alt="Base" className="h-28 w-full object-cover" />
                <button
                  type="button"
                  onClick={props.onClearBase}
                  className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-red-300"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => baseInputRef.current?.click()}
                disabled={props.uploadingBase}
                className="flex h-16 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 text-xs text-white/50 hover:border-[#FD5FC2]/50 hover:text-white transition-all"
              >
                {props.uploadingBase ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {t('generate.pickBaseImage')}
              </button>
            )}
            <input
              ref={baseInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) props.onBaseUpload(file);
                e.target.value = '';
              }}
            />
          </div>
        )}

        {/* ── Preset slots ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className={slotLabel}>{t('generate.presets')}</div>
            {props.lockedHint && (
              <span className="inline-flex items-center gap-1 text-[10px] text-[#ffb3cd]">
                <Lock className="h-3 w-3" /> {t('chat.presetLocked')}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {/* Character slot — companion picker (optional: empty = brand-new character) */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setGirlPickerOpen((v) => !v)}
                className={cn(
                  'relative w-full aspect-[2/3] rounded-xl overflow-hidden border text-left transition-all',
                  props.girl ? 'border-[#FD5FC2]/50' : 'border-dashed border-white/20 hover:border-[#FD5FC2]/50',
                )}
              >
                {props.girl && girlAvatarUrl(props.girl) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- dynamic companion portrait
                  <img src={girlAvatarUrl(props.girl) || ''} alt={props.girl.name} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/[0.04]">
                    <User className="h-6 w-6 text-white/30" />
                  </span>
                )}
                <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-semibold text-white bg-gradient-to-t from-black/80 to-transparent truncate">
                  {props.girl ? props.girl.name : t('generate.slotCharacter')}
                </span>
                <span className="absolute top-1 left-1 rounded bg-white/15 px-1 py-px text-[8px] uppercase tracking-wide text-white/70">
                  {t('generate.optional')}
                </span>
              </button>
              {props.girl && (
                <button
                  type="button"
                  onClick={props.onClearGirl}
                  className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-red-300"
                  aria-label={`Clear ${t('generate.slotCharacter')}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {girlPickerOpen && (
                <>
                  <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setGirlPickerOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/10 bg-[#1D1D1D] p-1 shadow-xl">
                    {props.girls.length === 0 && (
                      <p className="px-2 py-3 text-[11px] text-white/40">{t('generate.noCompanions')}</p>
                    )}
                    {props.girls.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          props.onSelectGirl(g.id);
                          setGirlPickerOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors',
                          props.girl?.id === g.id ? 'bg-[#FD5FC2]/15' : 'hover:bg-white/[0.06]',
                        )}
                      >
                        <span className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-white/[0.06]">
                          {girlAvatarUrl(g) ? (
                            // eslint-disable-next-line @next/next/no-img-element -- dynamic companion avatar
                            <img src={girlAvatarUrl(g) || ''} alt={g.name} className="h-full w-full object-cover" />
                          ) : null}
                        </span>
                        <span className="truncate text-xs text-white/85">{g.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Dynamic preset slots — user can add / remove (persisted locally) */}
            {visibleSlots.map((kind) => {
              const def = slotDefs[kind];
              return (
                <SlotCard
                  key={kind}
                  label={def.label}
                  selectedLabel={def.selectedLabel}
                  previewUrl={def.previewUrl}
                  loading={def.loading}
                  onClick={def.onClick}
                  onClear={def.onClear}
                  controlnetActive={def.controlnetActive}
                  controlnetType={def.controlnetType}
                  onRemove={() => setVisibleSlots((prev) => prev.filter((s) => s !== kind))}
                />
              );
            })}

            {/* Add-slot tile — restores a hidden preset slot */}
            {hiddenSlots.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAddMenuOpen((v) => !v)}
                  className="flex w-full aspect-[2/3] items-center justify-center rounded-xl border border-dashed border-white/15 text-white/35 hover:border-[#FD5FC2]/50 hover:text-white transition-all"
                >
                  <span className="flex flex-col items-center gap-1">
                    <Plus className="h-4 w-4" />
                    <span className="text-[9px] uppercase tracking-wide">{t('generate.addSlot')}</span>
                  </span>
                </button>
                {addMenuOpen && (
                  <>
                    <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setAddMenuOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-white/10 bg-[#1D1D1D] p-1 shadow-xl">
                      {hiddenSlots.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          onClick={() => {
                            setVisibleSlots((prev) => [...prev, kind]);
                            setAddMenuOpen(false);
                          }}
                          className="flex w-full items-center rounded-lg px-2 py-1.5 text-left text-xs text-white/85 hover:bg-white/[0.06] transition-colors"
                        >
                          {slotDefs[kind].label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Custom prompt ── */}
        <div>
          <div className="mb-2 flex items-center gap-1.5">
            <span className={slotLabel}>{t('generate.customPrompt')}</span>
            <span className="rounded bg-white/10 px-1.5 py-px text-[8px] uppercase tracking-wider text-white/60">
              {t('generate.advanced')}
            </span>
          </div>
          <textarea
            value={props.prompt}
            onChange={(e) => props.onPromptChange(e.target.value)}
            placeholder={t('generate.promptPlaceholder')}
            className="w-full h-24 p-3 rounded-xl bg-[#1D1D1D] border border-white/[0.08] text-sm text-white placeholder-white/25 focus:border-[#FD5FC2]/50 outline-none resize-none"
          />
          {/* Quick tools — preset-slot style cards (image mode only) */}
          {props.mode === 'image' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <ToolCard
                active={props.undressOn}
                icon={<Flame className="h-4 w-4" />}
                title={t('generate.toolUndress')}
                desc={t('generate.toolUndressDesc')}
                onClick={props.onUndressToggle}
              />
              <ToolCard
                active={props.hdOn}
                icon={<Sparkles className="h-4 w-4" />}
                title={t('generate.toolHd')}
                desc={t('generate.toolHdDesc')}
                onClick={props.onHdToggle}
              />
            </div>
          )}
        </div>

        {props.submitError && <p className="text-xs text-red-300">{props.submitError}</p>}
        {props.busy && props.activeJobId && <GenJobProgress jobId={props.activeJobId} compact />}

        {/* ── Personal works library (all companions) ── */}
        {props.personalWorks.length > 0 && (
          <div>
            <div className={cn(slotLabel, 'mb-2')}>{t('generate.personalLibrary')}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {props.personalWorks.map((work) => (
                <button
                  key={`${work.jobId}-${work.url}`}
                  type="button"
                  onClick={() => props.onPickWork(work.url)}
                  className="relative aspect-[2/3] rounded-lg overflow-hidden border border-white/10 hover:border-[#FD5FC2]/60 transition-all"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- dynamic work thumbnail */}
                  <img src={work.url} alt="Work" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom bar: quantity / settings / generate ── */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2">
          {/* Quantity */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setCountOpen((v) => !v);
                setSettingsOpen(false);
              }}
              disabled={props.mode === 'video'}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#1D1D1D] text-sm font-bold text-white hover:border-white/25 transition-all disabled:opacity-40"
              title={t('generate.quantity')}
            >
              {props.mode === 'video' ? '1' : props.count}
            </button>
            {countOpen && props.mode === 'image' && (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setCountOpen(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-2 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#1D1D1D] shadow-xl">
                  {COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        props.onCountChange(n);
                        setCountOpen(false);
                      }}
                      className={cn(
                        'h-9 w-11 text-sm font-semibold transition-colors',
                        props.count === n ? 'bg-white text-black' : 'text-white/70 hover:bg-white/[0.08]',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((v) => !v);
                setCountOpen(false);
              }}
              disabled={props.mode === 'video'}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#1D1D1D] text-white/70 hover:border-white/25 hover:text-white transition-all disabled:opacity-40"
              title={t('generate.settings')}
            >
              <Settings2 className="h-4.5 w-4.5" />
            </button>
            {settingsOpen && props.mode === 'image' && (
              <>
                <button type="button" aria-hidden className="fixed inset-0 z-10 cursor-default" onClick={() => setSettingsOpen(false)} />
                <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-xl border border-white/10 bg-[#1D1D1D] p-3 shadow-xl space-y-3">
                  <label className="flex items-center justify-between text-xs text-white/70 cursor-pointer">
                    <span>{t('generate.faceFix')}</span>
                    <input
                      type="checkbox"
                      checked={props.faceFix}
                      onChange={(e) => props.onFaceFixChange(e.target.checked)}
                      className="accent-[#FD5FC2]"
                    />
                  </label>
                  <div className="flex items-center justify-between text-xs text-white/70">
                    <span>{t('generate.upscale')}</span>
                    <div className="flex gap-1">
                      {UPSCALE_OPTIONS.map((factor) => (
                        <button
                          key={factor}
                          type="button"
                          onClick={() => props.onUpscaleChange(factor)}
                          className={cn(
                            'h-6 px-2 rounded-md border text-[10px] transition-all',
                            props.upscale === factor
                              ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/15 text-white'
                              : 'border-white/10 text-white/50 hover:text-white',
                          )}
                        >
                          {factor === 0 ? t('generate.off') : `${factor}x`}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center justify-between text-xs text-white/70 cursor-pointer">
                    <span>{t('generate.identityLock')}</span>
                    <input
                      type="checkbox"
                      checked={props.identityOn && props.identityAvailable}
                      disabled={!props.identityAvailable}
                      onChange={(e) => props.onIdentityChange(e.target.checked)}
                      className="accent-[#FD5FC2]"
                    />
                  </label>
                </div>
              </>
            )}
          </div>

          {/* Generate pill */}
          <button
            type="button"
            onClick={props.onGenerate}
            disabled={props.busy}
            className="flex-1 h-11 rounded-full font-bold tracking-wide text-sm text-white inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-all active:scale-[0.98]"
            style={{
              background: 'linear-gradient(0deg, #FF1CAC, #FD5FC2 50%, #FF79D1)',
              boxShadow: '0 0 24px rgba(253,95,194,0.35)',
            }}
          >
            {props.busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('generate.generating')}
              </>
            ) : (
              <>
                {props.proLocked ? <Lock className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {t('generate.generate')}
                {props.mode === 'image' && props.count > 1 ? ` ×${props.count}` : ''}
                {props.proLocked ? (
                  <span className="rounded bg-black/25 px-1.5 py-px text-[9px] uppercase tracking-wider">Pro</span>
                ) : null}
              </>
            )}
          </button>
        </div>
        {!props.girl && (
          <p className="mt-2 text-center text-[10px] text-white/35">
            {t('generate.newCharacterHint')}
          </p>
        )}
        {props.proLocked && (
          <p className="mt-2 text-center text-[10px] text-[#ffb3cd]">
            <Lock className="inline h-3 w-3" /> {t('generate.proOnly')}
          </p>
        )}
      </div>
    </div>
  );
}

/** Quick-tool tile styled like the preset slot cards above it. */
function ToolCard(props: {
  active: boolean;
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-pressed={props.active}
      className={cn(
        'relative w-full rounded-xl overflow-hidden border text-left transition-all active:scale-[0.98]',
        props.active
          ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/[0.10] shadow-[0_0_18px_rgba(253,95,194,0.22)]'
          : 'border-dashed border-white/20 bg-white/[0.03] hover:border-[#FD5FC2]/50',
      )}
    >
      <div className="flex items-start gap-2 p-2.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            props.active ? 'bg-[#FD5FC2]/25 text-[#ff9ade]' : 'bg-white/[0.06] text-white/40',
          )}
        >
          {props.icon}
        </span>
        <span className="min-w-0">
          <span className={cn('block text-[11px] font-semibold leading-tight', props.active ? 'text-white' : 'text-white/70')}>
            {props.title}
          </span>
          <span className="mt-0.5 block text-[9px] leading-snug text-white/35">{props.desc}</span>
        </span>
      </div>
      {props.active && (
        <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#FD5FC2] shadow-[0_0_8px_rgba(253,95,194,0.9)]" />
      )}
    </button>
  );
}

/** Single preset slot card with thumbnail, label, optional clear button. */
function SlotCard(props: {
  label: string;
  selectedLabel: string | null;
  previewUrl: string | null;
  loading: boolean;
  onClick: () => void;
  onClear?: () => void;
  /** Hides this slot from the console (user-managed layout). */
  onRemove?: () => void;
  /** ControlNet multi-unit status (NEW) */
  controlnetActive?: boolean;
  /** ControlNet type indicator (NEW) */
  controlnetType?: 'openpose' | 'canny' | 'depth' | 'segment';
}) {
  const { t } = useTranslation();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={props.onClick}
        className={cn(
          'relative w-full aspect-[2/3] rounded-xl overflow-hidden border text-left transition-all',
          props.selectedLabel
            ? props.controlnetActive
              ? 'border-[#FD5FC2]/60 bg-[#FD5FC2]/10 shadow-[0_0_18px_rgba(253,95,194,0.15)]'
              : 'border-[#FD5FC2]/50'
            : 'border-dashed border-white/20 hover:border-[#FD5FC2]/50',
        )}
      >
        {props.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic preset thumbnail
          <img src={props.previewUrl} alt={props.label} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-white/[0.04]">
            {props.loading ? <Loader2 className="h-4 w-4 animate-spin text-white/30" /> : <Sparkles className="h-4 w-4 text-white/25" />}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] font-semibold text-white bg-gradient-to-t from-black/80 to-transparent truncate">
          {props.selectedLabel || props.label}
        </span>
        {!props.selectedLabel && !props.loading && (
          <span className="absolute top-1 left-1 rounded bg-white/15 px-1 py-px text-[8px] uppercase tracking-wide text-white/70">
            {props.label}
          </span>
        )}
        {/* ControlNet status badge (NEW) */}
        {props.selectedLabel && props.controlnetActive && props.controlnetType && (
          <Badge
            variant="outline"
            className={cn(
              'absolute top-1 right-1 rounded text-[9px] font-bold uppercase tracking-wider border-0',
              props.controlnetType === 'openpose' && 'bg-[#FD5FC2]/20 text-[#FF9ADE]',
              props.controlnetType === 'canny' && 'bg-[#8b5cf6]/20 text-[#A78BFA]',
              props.controlnetType === 'depth' && 'bg-[#06b6d4]/20 text-[#67E8F9]',
              props.controlnetType === 'segment' && 'bg-[#f59e0b]/20 text-[#FCD34D]',
            )}
          >
            {props.controlnetType === 'openpose' && t('workbench.openPoseEnabled')}
            {props.controlnetType === 'canny' && t('workbench.tryOnEnabled')}
            {props.controlnetType === 'depth' && t('workbench.depthEnabled')}
            {props.controlnetType === 'segment' && t('workbench.tryOnEnabled')}
          </Badge>
        )}
      </button>
      {props.onClear && (
        <button
          type="button"
          onClick={props.onClear}
          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center text-white/70 hover:text-red-300"
          aria-label={`Clear ${props.label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {props.onRemove && (
        <button
          type="button"
          onClick={props.onRemove}
          className="absolute bottom-1.5 right-1.5 h-5 w-5 rounded-full bg-black/60 flex items-center justify-center text-white/60 hover:text-red-300"
          aria-label={`Remove ${props.label}`}
          title={t('generate.removeSlot')}
        >
          <Minus className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
