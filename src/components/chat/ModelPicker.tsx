'use client';

import { useEffect, useRef, useState } from 'react';
import { Brain, Check, Coins, Crown, Flame, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import type { ChatModelOption } from '@/lib/chat-models';

/**
 * In-chat model picker.
 * `selectedId === null` means auto routing (free, subscription-covered);
 * every explicit model charges its `credit_cost` per message.
 */
export function ModelPicker(props: {
  models: ChatModelOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { models, selectedId, onSelect } = props;
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  if (!models.length) return null;

  const selected = models.find((m) => m.id === selectedId) || null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'inline-flex items-center gap-1 h-7 px-2.5 rounded-full border text-[11px] font-medium transition-all active:scale-95',
          selected
            ? 'border-[#ffd700]/40 bg-gradient-to-r from-[#ffd700]/15 to-[#ff2e88]/15 text-[#ffe08a]'
            : 'border-white/10 bg-white/[0.04] text-white/45 hover:text-white/80',
        )}
        aria-expanded={open}
        title={selected ? selected.description : t('chat.modelAutoHint')}
      >
        <Brain className="h-3 w-3" />
        {selected ? selected.label : t('chat.modelAuto')}
        {selected && selected.credit_cost > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[10px] text-[#ffd700]/80">
            <Coins className="h-2.5 w-2.5" />
            {selected.credit_cost}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-9 left-0 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-[#0E0E1A]/95 backdrop-blur-2xl shadow-2xl p-2 space-y-1">
          <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wider text-[#8B8BA3]">
            {t('chat.modelPickerTitle')}
          </p>

          {/* Auto option — free smart routing */}
          <button
            type="button"
            onClick={() => { onSelect(null); setOpen(false); }}
            className={cn(
              'w-full text-left rounded-xl px-2.5 py-2 transition-colors',
              !selected ? 'bg-gradient-to-r from-[#FF2D78]/15 to-[#C026D3]/15 border border-[#FF2D78]/30' : 'hover:bg-white/[0.06] border border-transparent',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                <Brain className="h-3.5 w-3.5 text-[#ff6ba6]" />
                {t('chat.modelAuto')}
                {!selected && <Check className="h-3 w-3 text-[#ff6ba6]" />}
              </span>
              <span className="text-[10px] font-medium text-emerald-300">{t('chat.modelFree')}</span>
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-[#8B8BA3]">{t('chat.modelAutoHint')}</p>
          </button>

          {models.map((m) => {
            const active = m.id === selectedId;
            return (
              <button
                key={m.id}
                type="button"
                disabled={!m.available}
                onClick={() => { if (m.available) { onSelect(m.id); setOpen(false); } }}
                className={cn(
                  'w-full text-left rounded-xl px-2.5 py-2 transition-colors disabled:cursor-not-allowed',
                  active
                    ? 'bg-gradient-to-r from-[#FF2D78]/15 to-[#C026D3]/15 border border-[#FF2D78]/30'
                    : 'hover:bg-white/[0.06] border border-transparent',
                  !m.available && 'opacity-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-white flex items-center gap-1.5">
                    {m.nsfw ? (
                      <Flame className="h-3.5 w-3.5 text-rose-400" />
                    ) : (
                      <Brain className="h-3.5 w-3.5 text-[#ff6ba6]" />
                    )}
                    {m.label}
                    {active && <Check className="h-3 w-3 text-[#ff6ba6]" />}
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-2">
                    {!m.available && m.lock_reason === 'tier' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#ffd700]">
                        <Crown className="h-2.5 w-2.5" />
                        {t('chat.modelLockedTier')}
                      </span>
                    )}
                    {!m.available && m.lock_reason === 'nsfw' && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#8B8BA3]">
                        <Lock className="h-2.5 w-2.5" />
                        {t('chat.modelLockedNsfw')}
                      </span>
                    )}
                    <span className={cn(
                      'inline-flex items-center gap-0.5 text-[10px] font-medium',
                      m.credit_cost > 0 ? 'text-[#ffd700]' : 'text-emerald-300',
                    )}>
                      {m.credit_cost > 0 ? (
                        <>
                          <Coins className="h-2.5 w-2.5" />
                          {t('chat.modelPerMessage', { n: m.credit_cost })}
                        </>
                      ) : (
                        t('chat.modelFree')
                      )}
                    </span>
                  </span>
                </div>
                {m.description && (
                  <p className="mt-0.5 text-[10px] leading-snug text-[#8B8BA3]">{m.description}</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
