'use client';

import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Image as ImageIcon, Brain, Home, Camera, Volume2, ArrowLeft } from 'lucide-react';
import type { ChatGirlfriend, IntimacyData } from './types';
import { getIntimacyProgress } from '@/lib/constants';
import type { INTIMACY_LEVELS } from '@/lib/constants';
import { traitLabelFor } from '@/lib/girlfriend-traits';
import { useTranslation } from '@/lib/i18n/context';

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
  onAlbum: () => void;
  onOpenProfile?: () => void;
  voiceReply?: boolean;
  onVoiceReplyChange?: (v: boolean) => void;
}) {
  const { t, locale } = useTranslation();
  const { girlfriend, levelInfo, intimacy, isTyping, onBack, onSelfie, isGenerating, onMemories, onAlbum, onOpenProfile, voiceReply, onVoiceReplyChange } = props;
  const name = girlfriend?.name?.trim() || 'Companion';
  const color = levelInfo?.color || '#ff2e88';
  const score = Math.round(intimacy?.score ?? 0);
  const progress = getIntimacyProgress(score);
  const level = progress.level;
  const title = locale === 'zh' ? progress.info.title_zh : progress.info.title;

  return (
    <header
      className="sticky top-0 z-30 shrink-0 border-b border-transparent bg-[#08040e]/55 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-2">
        <button
          type="button"
          onClick={onBack}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white transition-all active:scale-95 touch-manipulation"
          aria-label={t('general.back')}
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div
          className="relative shrink-0 cursor-pointer"
          onClick={onOpenProfile}
          role={onOpenProfile ? 'button' : undefined}
          aria-label={onOpenProfile ? 'Profile' : undefined}
        >
          <Avatar className="relative h-10 w-10 ring-2 ring-white/10">
            {girlfriend?.avatar_url ? (
              <AvatarImage src={girlfriend.avatar_url} alt={name} />
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
              <span className="text-[#FF6BA6] font-medium">{t('chat.thinking')}</span>
            ) : (
              <span className="text-white/45">
                {girlfriend?.occupation
                  ? `${girlfriend.occupation} · `
                  : ''}
                {title} · <span className="font-mono tabular-nums">{score}pts</span>
                {typeof girlfriend?.base_desire === 'number' ? (
                  <span className="text-white/35">
                    {' '}
                    · {traitLabelFor('desire', girlfriend.base_desire, locale === 'zh')}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        {/* 竞品同款渐变环语音按钮：开启 = 绿渐变环 + 内圈暗底 */}
        <button
          type="button"
          onClick={() => onVoiceReplyChange?.(!voiceReply)}
          className={`h-11 w-11 shrink-0 rounded-full p-[1.5px] transition-all active:scale-95 touch-manipulation ${
            voiceReply
              ? 'bg-gradient-to-br from-[#5BF8D3] to-[#18FF8C] shadow-[0_0_16px_rgba(24,255,140,0.35)]'
              : 'bg-white/10 hover:bg-white/20'
          }`}
          aria-label="语音回复"
          title={voiceReply ? '语音回复已开启' : '开启语音回复'}
        >
          <span
            className={`h-full w-full rounded-full flex items-center justify-center backdrop-blur ${
              voiceReply ? 'bg-[#08140e]/90 text-[#5BF8D3]' : 'bg-[#08040e]/60 text-[#ffb3cd]'
            }`}
          >
            <Volume2 className="h-5 w-5" />
          </span>
        </button>
        <button
          type="button"
          onClick={onSelfie}
          disabled={isGenerating}
          className="inline-flex items-center justify-center gap-1 h-11 w-11 sm:w-auto sm:px-3.5 rounded-full text-xs font-medium text-white glass active:scale-95 disabled:opacity-50 transition-all touch-manipulation"
          aria-label={t('chat.selfie')}
        >
          <ImageIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{t('chat.selfie')}</span>
        </button>
        <button
          type="button"
          onClick={onAlbum}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95 transition-all touch-manipulation"
          aria-label={t('chats.album')}
        >
          <Camera className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onMemories}
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95 transition-all touch-manipulation"
          aria-label={t('chat.memory')}
        >
          <Brain className="h-5 w-5" />
        </button>
        <Link
          href="/"
          className="glass h-11 w-11 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white touch-manipulation active:scale-95"
          aria-label={t('home.title')}
        >
          <Home className="h-4 w-4" />
        </Link>
      </div>
      {!isTyping && (
        <div className="px-3 sm:px-4 pb-2">
          <div className="mb-1 flex items-center justify-between gap-3 text-[10px] text-[#ff6ba6]/90">
            <span className="truncate">
              {progress.isMax
                ? t('chatApp.maxIntimacy')
                : t('chatApp.intimacyHint', { remaining: String(progress.remaining), title: (locale === 'zh' ? progress.next?.title_zh : progress.next?.title) || '' })}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{score}/{progress.next?.min_score ?? 1500}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-[#ff2e88] to-[#f97316] transition-[width] duration-500" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}
