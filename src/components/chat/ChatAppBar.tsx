'use client';

import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Image as ImageIcon, Brain, ChevronDown, Home } from 'lucide-react';
import type { ChatGirlfriend, IntimacyData } from './types';
import { HEAT_UNLOCK_HINTS } from '@/lib/constants';
import type { INTIMACY_LEVELS } from '@/lib/constants';
import { traitLabelFor } from '@/lib/girlfriend-traits';

type LevelInfo = (typeof INTIMACY_LEVELS)[number];

function safeInitial(name?: string | null) {
  const n = (name || '?').trim();
  return n.charAt(0).toUpperCase() || '?';
}

export function ChatAppBar(props: {
  girlfriend: ChatGirlfriend | null;
  levelInfo?: LevelInfo | null;
  intimacy?: IntimacyData | null;
  isTyping: boolean;
  onBack: () => void;
  onSelfie: () => void;
  isGenerating: boolean;
  onMemories: () => void;
}) {
  const { girlfriend, levelInfo, intimacy, isTyping, onBack, onSelfie, isGenerating, onMemories } = props;
  const name = girlfriend?.name?.trim() || 'Companion';
  const color = levelInfo?.color || '#ff2e88';
  const title = levelInfo?.title || 'Chat';
  const level = intimacy?.level ?? 1;
  const score = Math.round(intimacy?.score ?? 0);

  return (
    <header
      className="sticky top-0 z-30 shrink-0 border-b border-[#ff2e88]/12 bg-[#08040e]/92 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white transition-all active:scale-95 touch-manipulation"
          aria-label="Back"
        >
          <ChevronDown className="h-5 w-5 rotate-90" />
        </button>
        <div className="relative shrink-0">
          <Avatar className="relative h-10 w-10 ring-2 ring-white/10">
            {girlfriend?.avatar_url ? (
              <AvatarImage src={girlfriend.avatar_url} alt={name} className="object-cover" />
            ) : (
              <AvatarFallback
                className="text-white font-semibold text-sm"
                style={{ background: `linear-gradient(135deg, ${color}, #A855F7)` }}
              >
                {safeInitial(name)}
              </AvatarFallback>
            )}
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-[#08040e] ${
              isTyping ? 'bg-[#FF6BA6] animate-pulse' : 'bg-emerald-400'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-white truncate">{name}</h2>
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0"
              style={{
                background: `${color}22`,
                color,
                border: `1px solid ${color}40`,
              }}
            >
              Lv.{level}
            </span>
            {girlfriend?.age ? (
              <span className="text-[9px] text-white/40 shrink-0">{girlfriend.age}</span>
            ) : null}
          </div>
          <div className="text-[11px] mt-0.5 truncate">
            {isTyping ? (
              <span className="text-[#FF6BA6] font-medium">typing…</span>
            ) : (
              <span className="text-white/45">
                {girlfriend?.occupation
                  ? `${girlfriend.occupation} · `
                  : ''}
                {title} · <span className="font-mono tabular-nums">{score}pts</span>
                {typeof girlfriend?.base_desire === 'number' ? (
                  <span className="text-white/35">
                    {' '}
                    · {traitLabelFor('desire', girlfriend.base_desire, false)}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSelfie}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-1 h-11 w-11 sm:w-auto sm:px-3.5 rounded-full text-xs font-medium text-white glass active:scale-95 disabled:opacity-50 transition-all touch-manipulation"
          aria-label="Selfie"
        >
          <ImageIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Selfie</span>
        </button>
        <button
          type="button"
          onClick={onMemories}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95 transition-all touch-manipulation"
          aria-label="Memories"
        >
          <Brain className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white touch-manipulation active:scale-95"
          aria-label="Home"
        >
          <Home className="h-4 w-4" />
        </Link>
      </div>
      {!isTyping && (
        <div className="px-3 sm:px-4 pb-2 text-[10px] text-[#ff6ba6]/90 truncate">
          {HEAT_UNLOCK_HINTS.find((h) => h.level === level)?.hint || 'Build heat together'}
        </div>
      )}
    </header>
  );
}
