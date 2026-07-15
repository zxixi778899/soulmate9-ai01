'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  Send,
  Mic,
  Sparkles,
  ImagePlus,
  Square,
  X,
  Gift,
  Shirt,
  Brain,
  Camera,
} from 'lucide-react';
import { CHAT_ENVS, CHAT_MOODS, CHAT_POSES } from './types';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { ChatGift } from '@/lib/gifts/catalog';

export type PendingMedia = {
  kind: 'image' | 'audio';
  url: string;
  file?: File;
  previewUrl?: string;
};

type OutfitLite = {
  id: string;
  name: string;
  emoji: string;
  category?: string;
  tier?: string;
};

export function ChatInputBar(props: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  placeholder?: string;
  showPresets: boolean;
  togglePresets: () => void;
  selectedMood: string | null;
  setSelectedMood: (v: string | null) => void;
  selectedPose: string | null;
  setSelectedPose: (v: string | null) => void;
  selectedEnvironment: string | null;
  setSelectedEnvironment: (v: string | null) => void;
  pendingMedia?: PendingMedia | null;
  onPickImage?: (file: File) => void;
  onClearMedia?: () => void;
  onToggleVoice?: () => void;
  isRecording?: boolean;
  voiceSeconds?: number;
  smartSuggestions?: string[];
  onSmartSuggestion?: (text: string) => void;
  smartSuggestionsLoading?: boolean;
  /** Live gifts strip */
  gifts?: ChatGift[];
  onSendGift?: (gift: ChatGift) => void;
  /** Wardrobe outfits */
  outfits?: OutfitLite[];
  selectedOutfit?: string | null;
  onEquipOutfit?: (id: string) => void;
  onSelfie?: () => void;
  isGenerating?: boolean;
  onMemories?: () => void;
}) {
  const {
    input,
    setInput,
    onSend,
    onKeyDown,
    isSending,
    placeholder,
    showPresets,
    togglePresets,
    selectedMood,
    setSelectedMood,
    selectedPose,
    setSelectedPose,
    selectedEnvironment,
    setSelectedEnvironment,
    pendingMedia,
    onPickImage,
    onClearMedia,
    onToggleVoice,
    isRecording,
    voiceSeconds = 0,
    smartSuggestions = [],
    onSmartSuggestion,
    smartSuggestionsLoading = false,
    gifts = [],
    onSendGift,
    outfits = [],
    selectedOutfit,
    onEquipOutfit,
    onSelfie,
    isGenerating,
    onMemories,
  } = props;

  const { t } = useTranslation();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hasText = input.trim().length > 0;
  const hasMedia = Boolean(pendingMedia?.url);
  const canSend = (hasText || hasMedia) && !isSending;
  const [phIdx, setPhIdx] = useState(0);
  /** gift | outfit | null — Douyin live-style bottom sheet */
  const [tray, setTray] = useState<'gift' | 'outfit' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [barH, setBarH] = useState(120);

  useEffect(() => {
    setMounted(true);
  }, []);

  const placeholderPool = useMemo(
    () => [
      t('chat.ph1'),
      t('chat.ph2'),
      t('chat.ph3'),
      t('chat.ph4'),
      t('chat.ph5'),
      t('chat.ph6'),
      t('chat.ph7'),
      t('chat.ph8'),
    ],
    [t],
  );

  useEffect(() => {
    if (hasText) return;
    const timer = setInterval(() => setPhIdx((i) => (i + 1) % placeholderPool.length), 3500);
    return () => clearInterval(timer);
  }, [hasText, placeholderPool.length]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [input]);

  const livePlaceholder = placeholder || placeholderPool[phIdx % placeholderPool.length];
  const showSmart =
    !hasText && !hasMedia && (smartSuggestions.length > 0 || smartSuggestionsLoading);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setBarH(el.getBoundingClientRect().height || 120);
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [tray, showPresets, showSmart, pendingMedia, isRecording]);

  const toggleTray = (key: 'gift' | 'outfit') => {
    setTray((cur) => (cur === key ? null : key));
  };

  const closeTray = () => setTray(null);

  const livePanel =
    mounted && tray && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
            {/* semi-transparent dim (Douyin live room) */}
            <button
              type="button"
              aria-label="Close"
              className="absolute inset-0 border-0 bg-black/45 backdrop-blur-[3px] cursor-default"
              onClick={closeTray}
            />
            {/* sheet sits above the input bar */}
            <div
              className="absolute inset-x-0 flex justify-center px-0 sm:px-2 pointer-events-none"
              style={{ bottom: Math.max(barH - 2, 72) }}
            >
              <div
                className={cn(
                  'pointer-events-auto w-full max-w-3xl',
                  'rounded-t-3xl border border-white/15 border-b-0',
                  'shadow-[0_-16px_48px_rgba(0,0,0,0.55)]',
                  'animate-in slide-in-from-bottom-6 fade-in duration-200',
                )}
                style={{
                  maxHeight: 'min(55vh, 440px)',
                  background:
                    tray === 'gift'
                      ? 'linear-gradient(180deg, rgba(48,10,28,0.82) 0%, rgba(14,6,18,0.88) 100%)'
                      : 'linear-gradient(180deg, rgba(36,12,44,0.82) 0%, rgba(14,6,18,0.88) 100%)',
                  backdropFilter: 'blur(22px) saturate(140%)',
                  WebkitBackdropFilter: 'blur(22px) saturate(140%)',
                }}
              >
                <div className="px-3 pt-2.5 pb-2 border-b border-white/10">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/30" />
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {tray === 'gift' ? (
                        <Gift className="h-4 w-4 shrink-0 text-[#ff6ba6]" />
                      ) : (
                        <Shirt className="h-4 w-4 shrink-0 text-[#e9b3ff]" />
                      )}
                      <span className="text-sm font-semibold text-white/95 truncate">
                        {tray === 'gift'
                          ? t('chat.gifts') || 'Live Gifts'
                          : t('chat.wardrobe') || 'Wardrobe'}
                      </span>
                      <span className="hidden sm:inline text-[10px] text-white/40 shrink-0">
                        {tray === 'gift' ? 'Scroll · tap to send' : 'Scroll · tap to equip'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10"
                      onClick={closeTray}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div
                  className="overflow-y-auto overscroll-contain px-2.5 py-2.5"
                  style={{
                    maxHeight: 'min(46vh, 360px)',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {tray === 'gift' && (
                    <>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {(gifts.length ? gifts : []).map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => onSendGift?.(g)}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-2xl p-2.5',
                              'border border-white/10 bg-white/[0.07]',
                              'hover:border-[#ff2e88]/55 hover:bg-[#ff2e88]/15',
                              'active:scale-95 transition-all touch-manipulation',
                            )}
                          >
                            <span className="h-12 w-12 rounded-full overflow-hidden flex items-center justify-center bg-black/30 text-3xl ring-1 ring-white/10">
                              {g.icon_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={g.icon_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                g.emoji
                              )}
                            </span>
                            <span className="text-[11px] text-white/90 truncate w-full text-center font-medium leading-tight">
                              {g.name}
                            </span>
                            <span className="text-[10px] text-[#FF6BA6] tabular-nums">
                              +{g.intimacy_boost}
                            </span>
                          </button>
                        ))}
                      </div>
                      {!gifts.length && (
                        <p className="text-xs text-white/40 text-center py-8">No gifts loaded</p>
                      )}
                    </>
                  )}

                  {tray === 'outfit' && (
                    <>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                        {outfits.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => {
                              onEquipOutfit?.(o.id);
                              closeTray();
                            }}
                            className={cn(
                              'flex flex-col items-center gap-1 rounded-2xl p-2.5',
                              'border active:scale-95 transition-all touch-manipulation',
                              selectedOutfit === o.id
                                ? 'border-[#c026d3]/70 bg-[#c026d3]/20 shadow-[0_0_16px_rgba(192,38,211,0.35)]'
                                : 'border-white/10 bg-white/[0.07] hover:border-[#c026d3]/45 hover:bg-[#c026d3]/12',
                            )}
                          >
                            <span className="text-3xl leading-none">{o.emoji}</span>
                            <span className="text-[11px] text-white/90 truncate w-full text-center leading-tight">
                              {o.name}
                            </span>
                            {o.tier && (
                              <span className="text-[9px] uppercase text-white/35">{o.tier}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      {!outfits.length && (
                        <p className="text-xs text-white/40 text-center py-8">No outfits</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      className="sticky bottom-0 z-30 border-t border-[#ff2e88]/20 bg-[#0a0610]/94 backdrop-blur-2xl"
    >
      {livePanel}

      {/* ── Action bar: Gift / Outfit / Selfie / Photo / Voice / Mood / Memory ── */}
      <div className="max-w-3xl mx-auto px-2 sm:px-3 pt-2">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-1">
          <ActionChip
            active={tray === 'gift'}
            onClick={() => toggleTray('gift')}
            icon={<Gift className="h-4 w-4" />}
            label={t('chat.gifts') || 'Gifts'}
            accent="#FF2D78"
          />
          <ActionChip
            active={tray === 'outfit'}
            onClick={() => toggleTray('outfit')}
            icon={<Shirt className="h-4 w-4" />}
            label={t('chat.wardrobe') || 'Outfit'}
            accent="#C026D3"
          />
          <ActionChip
            onClick={() => {
              closeTray();
              onSelfie?.();
            }}
            disabled={isGenerating}
            icon={
              isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Camera className="h-4 w-4" />
              )
            }
            label={t('chat.selfie')}
            accent="#FF6BA6"
          />
          <ActionChip
            onClick={() => {
              closeTray();
              imageInputRef.current?.click();
            }}
            icon={<ImagePlus className="h-4 w-4" />}
            label={t('chat.photo')}
            accent="#38bdf8"
          />
          <ActionChip
            onClick={() => {
              closeTray();
              onToggleVoice?.();
            }}
            active={isRecording}
            icon={<Mic className="h-4 w-4" />}
            label={t('chat.voice')}
            accent="#a78bfa"
          />
          <ActionChip
            active={showPresets}
            onClick={() => {
              closeTray();
              togglePresets();
            }}
            icon={<Sparkles className="h-4 w-4" />}
            label={t('chat.mood')}
            accent="#fbbf24"
          />
          <ActionChip
            onClick={() => {
              closeTray();
              onMemories?.();
            }}
            icon={<Brain className="h-4 w-4" />}
            label={t('chat.memory')}
            accent="#fb7185"
          />
        </div>
      </div>

      {/* AI quick replies */}
      {showSmart && (
        <div className="max-w-3xl mx-auto px-2 sm:px-3 pt-1 pb-1">
          <div className="flex items-center gap-1.5 mb-1 px-0.5">
            <Sparkles className="h-3 w-3 text-[#ff6ba6]" />
            <span className="text-[10px] uppercase tracking-wider text-[#ff6ba6]/80 font-semibold">
              {t('chat.quickReplies') || 'Quick replies'}
            </span>
            {smartSuggestionsLoading && (
              <Loader2 className="h-3 w-3 animate-spin text-white/40" />
            )}
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {(smartSuggestions.length ? smartSuggestions : ['…', '…', '…']).slice(0, 3).map(
              (line, i) => (
                <button
                  key={`${i}-${line.slice(0, 12)}`}
                  type="button"
                  disabled={smartSuggestionsLoading || line === '…' || isSending}
                  onClick={() => {
                    if (onSmartSuggestion) onSmartSuggestion(line);
                    else setInput(line);
                  }}
                  className={cn(
                    'shrink-0 max-w-[85%] sm:max-w-[240px] text-left text-[12px] leading-snug px-3 py-2 rounded-2xl border transition-all',
                    'bg-gradient-to-r from-[#ff2e88]/14 to-[#c026d3]/12 border-[#ff2e88]/30 text-white/90',
                    'hover:border-[#ff2e88]/55 disabled:opacity-40',
                  )}
                >
                  {line}
                </button>
              ),
            )}
          </div>
        </div>
      )}

      {showPresets && (
        <div className="max-w-3xl mx-auto px-3 pt-1 pb-1.5 space-y-1.5">
          {[
            { label: 'MOOD', items: CHAT_MOODS, selected: selectedMood, set: setSelectedMood },
            { label: 'POSE', items: CHAT_POSES, selected: selectedPose, set: setSelectedPose },
            {
              label: 'ENV',
              items: CHAT_ENVS,
              selected: selectedEnvironment,
              set: setSelectedEnvironment,
            },
          ].map(({ label, items, selected, set }) => (
            <div key={label} className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold text-[#ff6ba6]/70 uppercase tracking-wider w-9 shrink-0">
                {label}
              </span>
              {items.map((it) => (
                <button
                  key={it}
                  type="button"
                  onClick={() => set(selected === it ? null : it)}
                  className={cn(
                    'text-[11px] px-2.5 py-0.5 rounded-full border transition-all active:scale-95',
                    selected === it
                      ? 'glass-btn !rounded-full !h-auto !px-2.5 !py-0.5 text-white'
                      : 'glass text-[#8B8BA3] hover:text-white',
                  )}
                >
                  {it.replace('_', ' ')}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {pendingMedia && (
        <div className="max-w-3xl mx-auto px-3 pt-1">
          <div className="relative inline-flex items-center gap-2 glass rounded-2xl p-2 pr-8 max-w-full">
            {pendingMedia.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={pendingMedia.previewUrl || pendingMedia.url}
                alt=""
                className="h-14 w-14 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div className="flex items-center gap-2 px-2 py-1 text-xs text-[#ffb3cd]">
                <Mic className="h-4 w-4" />
                Voice{voiceSeconds > 0 ? ` · ${voiceSeconds}s` : ''}
              </div>
            )}
            <button
              type="button"
              onClick={onClearMedia}
              className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/50 flex items-center justify-center text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {isRecording && (
        <div className="max-w-3xl mx-auto px-3 pt-1 flex items-center gap-2 text-xs text-[#ff6ba6]">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          Recording… {voiceSeconds}s
        </div>
      )}

      {/* Input row */}
      <div
        className="max-w-3xl mx-auto px-2 sm:px-3 pt-1.5"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-end gap-1.5">
          <input
            ref={imageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f && onPickImage) onPickImage(f);
            }}
          />

          <div className="flex-1 min-w-0">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={livePlaceholder}
              rows={1}
              enterKeyHint="send"
              className="glass-input w-full resize-none px-3.5 sm:px-4 py-2.5 text-[16px] sm:text-sm leading-snug min-h-[44px] max-h-[120px]"
            />
          </div>

          {canSend ? (
            <button
              type="button"
              onClick={onSend}
              disabled={isSending}
              className="glass-btn h-11 w-11 shrink-0 !rounded-full flex items-center justify-center disabled:opacity-60"
              aria-label={t('chat.send')}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onToggleVoice}
              className={cn(
                'h-11 w-11 shrink-0 rounded-full flex items-center justify-center active:scale-95',
                isRecording ? 'bg-red-500/90 text-white' : 'glass text-[#ff6ba6]',
              )}
              aria-label={isRecording ? 'Stop' : 'Voice'}
            >
              {isRecording ? (
                <Square className="h-4 w-4 fill-current" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActionChip(props: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
}) {
  const { label, icon, onClick, active, disabled, accent = '#ff6ba6' } = props;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-medium border transition-all active:scale-95 touch-manipulation disabled:opacity-40',
        active
          ? 'text-white border-transparent shadow-[0_0_16px_rgba(255,45,120,0.35)]'
          : 'text-white/75 border-white/10 bg-white/[0.04] hover:text-white hover:border-white/20',
      )}
      style={
        active
          ? {
              background: `linear-gradient(135deg, ${accent}cc, ${accent}88)`,
              borderColor: `${accent}66`,
            }
          : undefined
      }
    >
      <span style={{ color: active ? '#fff' : accent }}>{icon}</span>
      {label}
    </button>
  );
}
