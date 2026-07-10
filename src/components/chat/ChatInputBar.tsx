'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Send, Mic, Sparkles, Plus } from 'lucide-react';
import { CHAT_ENVS, CHAT_MOODS, CHAT_POSES } from './types';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';

export function ChatInputBar(props: {
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isSending: boolean;
  placeholder?: string;
  onOpenAttachments: () => void;
  showPresets: boolean;
  togglePresets: () => void;
  selectedMood: string | null;
  setSelectedMood: (v: string | null) => void;
  selectedPose: string | null;
  setSelectedPose: (v: string | null) => void;
  selectedEnvironment: string | null;
  setSelectedEnvironment: (v: string | null) => void;
}) {
  const {
    input, setInput, onSend, onKeyDown, isSending, placeholder,
    onOpenAttachments, showPresets, togglePresets,
    selectedMood, setSelectedMood,
    selectedPose, setSelectedPose,
    selectedEnvironment, setSelectedEnvironment,
  } = props;
  const { t } = useTranslation();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const hasText = input.trim().length > 0;
  const [phIdx, setPhIdx] = useState(0);

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

  const quickPresets = useMemo(
    () => [
      { emoji: '🔥', label: t('chat.presetMiss'), fill: "I can't stop thinking about you right now…" },
      { emoji: '😈', label: t('chat.presetBad'), fill: 'Be a little bad for me tonight…' },
      { emoji: '💋', label: t('chat.presetKiss'), fill: '*pulls you closer* Kiss me.' },
      { emoji: '🛏️', label: t('chat.presetCloser'), fill: 'Come here. Closer.' },
      { emoji: '📸', label: t('chat.presetShow'), fill: 'Show me how you look right now…' },
      { emoji: '🌙', label: t('chat.presetNight'), fill: 'Goodnight baby… dream of me.' },
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

  return (
    <div className="sticky bottom-0 z-20 border-t border-[#ff2e88]/15 bg-[#0a0610]/70 backdrop-blur-2xl">
      {!hasText && (
        <div className="max-w-3xl mx-auto px-2 sm:px-4 pt-2 flex gap-1.5 overflow-x-auto scrollbar-hide">
          {quickPresets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                setInput(p.fill);
                requestAnimationFrame(() => taRef.current?.focus());
              }}
              className="glass shrink-0 flex items-center gap-1 px-2.5 h-8 rounded-full text-[11px] text-[#ffb3cd] hover:border-[#ff2e88]/50 active:scale-95 transition-all"
            >
              <span>{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>
      )}

      {showPresets && (
        <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-2 pb-1.5 space-y-1.5">
          {[
            { label: 'MOOD', items: CHAT_MOODS, selected: selectedMood, set: setSelectedMood },
            { label: 'POSE', items: CHAT_POSES, selected: selectedPose, set: setSelectedPose },
            { label: 'ENV', items: CHAT_ENVS, selected: selectedEnvironment, set: setSelectedEnvironment },
          ].map(({ label, items, selected, set }) => (
            <div key={label} className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-bold text-[#ff6ba6]/70 uppercase tracking-wider w-9 shrink-0">
                {label}
              </span>
              {items.map((it) => (
                <button
                  key={it}
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

      <div className="max-w-3xl mx-auto px-2 sm:px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <div className="flex items-end gap-1.5">
          <button
            onClick={onOpenAttachments}
            className="h-11 w-11 shrink-0 rounded-full glass flex items-center justify-center text-[#ff6ba6] hover:text-white active:scale-95 transition-all"
            aria-label="More"
          >
            <Plus className="h-5 w-5" />
          </button>

          <button
            onClick={togglePresets}
            className={cn(
              'h-11 w-11 shrink-0 rounded-full flex items-center justify-center active:scale-95 transition-all',
              showPresets ? 'glass-btn !rounded-full text-white' : 'glass text-[#ff6ba6]',
            )}
            aria-label="Presets"
            title="Mood / Pose / Env"
          >
            <Sparkles className="h-[18px] w-[18px]" />
          </button>

          <div className="flex-1 min-w-0">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={livePlaceholder}
              rows={1}
              className="glass-input w-full resize-none px-4 py-2.5 text-base md:text-sm leading-snug min-h-[44px] max-h-[120px]"
            />
          </div>

          {hasText ? (
            <button
              onClick={onSend}
              disabled={isSending}
              className="glass-btn h-11 w-11 shrink-0 !rounded-full flex items-center justify-center disabled:opacity-60"
              aria-label={t('chat.send')}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          ) : (
            <button
              className="h-11 w-11 shrink-0 rounded-full glass text-[#ff6ba6]/50 flex items-center justify-center"
              aria-label="Voice"
              title="Voice"
            >
              <Mic className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
