'use client';

import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Image as ImageIcon, Brain, ChevronDown, Home } from 'lucide-react';
import type { ChatGirlfriend, IntimacyData } from './types';
import type { INTIMACY_LEVELS } from '@/lib/constants';

type LevelInfo = (typeof INTIMACY_LEVELS)[number];

export function ChatAppBar(props: {
  girlfriend: ChatGirlfriend;
  levelInfo: LevelInfo;
  intimacy: IntimacyData;
  isTyping: boolean;
  onBack: () => void;
  onSelfie: () => void;
  isGenerating: boolean;
  onMemories: () => void;
}) {
  const { girlfriend, levelInfo, intimacy, isTyping, onBack, onSelfie, isGenerating, onMemories } = props;
  return (
    <header
      className="sticky top-0 z-30 border-b border-[#ff2e88]/15 bg-[#08040e]/88 backdrop-blur-2xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2 sm:py-2.5">
        <button
          onClick={onBack}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white transition-all active:scale-95 touch-manipulation"
          aria-label="Back"
        >
          <ChevronDown className="h-5 w-5 rotate-90" />
        </button>
        <div className="relative shrink-0">
          <div
            className="absolute inset-0 rounded-full blur-md opacity-60"
            style={{ background: levelInfo.color }}
          />
          <Avatar className="relative h-10 w-10 ring-2 ring-white/[0.1]">
            {girlfriend.avatar_url ? (
              <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
            ) : (
              <AvatarFallback
                className="text-white font-semibold text-sm"
                style={{ background: `linear-gradient(135deg, ${levelInfo.color}, #A855F7)` }}
              >
                {girlfriend.name.charAt(0)}
              </AvatarFallback>
            )}
          </Avatar>
          <span
            className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-[#050509] transition-all ${
              isTyping
                ? 'bg-[#FF6BA6] animate-pulse shadow-[0_0_8px_rgba(255,107,166,0.8)]'
                : 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-white truncate">{girlfriend.name}</h2>
            <span
              className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 backdrop-blur-xl"
              style={{
                background: `${levelInfo.color}22`,
                color: levelInfo.color,
                border: `1px solid ${levelInfo.color}40`,
              }}
            >
              Lv.{intimacy.level}
            </span>
          </div>
          <div className="text-[11px] mt-0.5 truncate">
            {isTyping ? (
              <span className="text-[#FF6BA6] font-medium animate-pulse">typing</span>
            ) : (
              <span className="text-white/50">
                {levelInfo.title} ·{' '}
                <span className="font-mono tabular-nums">{Math.round(intimacy.score)}pts</span>
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onSelfie}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-1 h-11 w-11 sm:w-auto sm:px-3.5 rounded-full text-xs font-medium text-white glass active:scale-95 disabled:opacity-50 transition-all touch-manipulation"
          aria-label="Selfie"
        >
          <ImageIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Selfie</span>
        </button>
        <button
          onClick={onMemories}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95 transition-all touch-manipulation"
          aria-label="memories"
        >
          <Brain className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white touch-manipulation active:scale-95"
          aria-label="Home"
          title="Home"
        >
          <Home className="h-4 w-4" />
        </Link>
      </div>
    </header>
  );
}
