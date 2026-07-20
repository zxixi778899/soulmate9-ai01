'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { formatBubbleTime } from '@/lib/chat-utils';
import {
  Loader2, Heart, Check, CheckCheck, Sparkles, Shirt, ChevronUp, RefreshCw, Camera, Video, X,
} from 'lucide-react';
import type { ChatGirlfriend, ChatMessage, StreamRow } from './types';
import { useTranslation } from '@/lib/i18n/context';

function safeInitial(name?: string | null) {
  const n = (name || '?').trim();
  return n.charAt(0).toUpperCase() || '?';
}

/* ------------------------------------------------------------------ */
/* Generating card — rich "developing photo" placeholder (Candy-style) */
/* ------------------------------------------------------------------ */

function GeneratingCard({
  msg,
  onCancel,
}: {
  msg: ChatMessage;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const isVideo = msg.id.startsWith('video-wait-');

  // Start timestamp is embedded in the message id: selfie-wait-172123… / video-wait-…
  const startTs = useMemo(() => {
    const m = /(?:selfie|video)-wait-(\d+)/.exec(msg.id);
    return m ? Number(m[1]) : Date.now();
  }, [msg.id]);

  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startTs) / 1000)),
  );
  useEffect(() => {
    const iv = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - startTs) / 1000))),
      1000,
    );
    return () => clearInterval(iv);
  }, [startTs]);

  const mm = Math.floor(elapsed / 60);
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="w-[240px] sm:w-[260px] mt-2 rounded-2xl overflow-hidden border border-white/[0.10] bg-white/[0.04] shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
      {/* Developing area — shimmer sweep + pulsing icon */}
      <div className="relative aspect-[3/4] bg-gradient-to-br from-[#1a1025] via-[#150c1e] to-[#0e0816] overflow-hidden">
        {/* soft color blobs for depth */}
        <div className="absolute -top-8 -left-8 h-32 w-32 rounded-full bg-[#FF2D78]/[0.13] blur-2xl animate-pulse" />
        <div className="absolute -bottom-10 -right-6 h-36 w-36 rounded-full bg-[#C026D3]/[0.13] blur-2xl animate-pulse [animation-delay:700ms]" />
        {/* shimmer sweep */}
        <div className="absolute inset-0 game-shimmer" />
        {/* center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-[#FF2D78]/25 game-pulse-ring" />
            <div className="relative h-14 w-14 rounded-full bg-gradient-to-br from-[#FF2D78]/30 to-[#C026D3]/25 ring-1 ring-[#FF2D78]/40 flex items-center justify-center">
              {isVideo ? (
                <Video className="h-6 w-6 text-[#FF6BA6] animate-pulse" />
              ) : (
                <Camera className="h-6 w-6 text-[#FF6BA6] animate-pulse" />
              )}
            </div>
          </div>
        </div>
        {/* elapsed chip */}
        <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-sm px-2 py-0.5">
          <Loader2 className="h-3 w-3 animate-spin text-[#FF6BA6]" />
          <span className="text-[10px] font-mono tabular-nums text-white/80">
            {mm > 0 ? `${mm}:${ss}` : `${ss}s`}
          </span>
        </div>
      </div>
      {/* Status + cancel */}
      <div className="px-3 py-2.5 flex items-start gap-2">
        <p className="flex-1 text-[12px] leading-snug text-white/75">{msg.content}</p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.10] active:scale-90 transition-all"
            title={t('chat.genCancel')}
            aria-label={t('chat.genCancel')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------- */
/* Chat image — skeleton shimmer until loaded, fade-in  */
/* ---------------------------------------------------- */

function ChatImage({ url, onOpen }: { url: string; onOpen: (url: string) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[12px] text-white/40">
        <Camera className="h-4 w-4 shrink-0" />
        Image unavailable
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="block mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full active:scale-[0.98] transition-transform"
    >
      <div className="relative">
        {!loaded && (
          <div className="absolute inset-0 min-h-[160px] w-full bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-white/[0.06]">
            <div className="absolute inset-0 game-shimmer" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className={`w-full h-auto max-h-[280px] object-cover transition-opacity duration-500 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </div>
    </button>
  );
}

function ChatStreamInner(props: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  girlfriend: ChatGirlfriend | null;
  rows: ReadonlyArray<StreamRow>;
  isTyping: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadHistory: () => void;
  levelColor: string;
  onOpenImage: (url: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onCancelGeneration?: () => void;
  onRetrySelfie?: () => void;
  onRetryMessage?: (msg: ChatMessage) => void;
}) {
  const { t } = useTranslation();
  const {
    scrollRef, onScroll, girlfriend, rows, isTyping,
    hasMore, loadingMore, onLoadHistory, levelColor, onOpenImage, bottomRef,
    onCancelGeneration, onRetrySelfie, onRetryMessage,
  } = props;

  const portrait =
    girlfriend?.portrait_url || girlfriend?.image_url || girlfriend?.avatar_url || null;
  const displayName = girlfriend?.name?.trim() || 'Companion';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 pt-2 pb-2 bg-transparent"
    >
      {/* Soft stage — no heavy blur/scale (was GPU-heavy & layout-janky) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {portrait ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top opacity-[0.14]"
              loading="lazy"
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#08040e]/75 via-[#08040e]/88 to-[#08040e]" />
          </>
        ) : (
          <div
            className="absolute left-1/2 top-[30%] -translate-x-1/2 w-[70%] max-w-sm aspect-square rounded-full opacity-20"
            style={{
              background: `radial-gradient(circle, ${levelColor || '#ff2e88'} 0%, transparent 70%)`,
            }}
          />
        )}
      </div>

      <div className="relative max-w-3xl mx-auto">
        {hasMore && rows.length > 0 && (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={onLoadHistory}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/80 h-8 px-3 rounded-full glass active:scale-95 transition-all"
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              {t('chat.loadEarlier')}
            </button>
          </div>
        )}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#FF2D78]/25 to-[#C026D3]/15 ring-1 ring-[#FF2D78]/25 flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-[#FF6BA6]" />
            </div>
            <p className="font-display text-base text-white">{t('chat.sayHi', { name: displayName })}</p>
            <p className="text-xs text-white/40 mt-1.5 max-w-xs">
              {t('chat.startStory')}
            </p>
          </div>
        )}

        <div className="flex flex-col">
          {rows.map((row) => {
            if (row.type === 'date') {
              return (
                <div key={row.key} className="flex justify-center my-2.5">
                  <span className="text-[10px] font-medium tracking-wider uppercase text-white/40 bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                    {row.label}
                  </span>
                </div>
              );
            }
            const { msg, showAvatar, merged } = row;
            const isUser = msg.role === 'user';
            const isAssistant = !isUser;
            const isOutfit = String(msg.id || '').startsWith('outfit-');
            const isGenWait =
              String(msg.id || '').startsWith('selfie-wait-') ||
              String(msg.id || '').startsWith('video-wait-');
            const isSelfieErr = String(msg.id || '').startsWith('selfie-err-');
            const isSending = msg.status === 'sending';
            const isFailed = msg.status === 'failed';
            const body = typeof msg.content === 'string' ? msg.content : msg.content != null ? String(msg.content) : '';

            /* --- Generating card row (replaces plain wait bubble) --- */
            if (isGenWait) {
              return (
                <div
                  key={row.key}
                  className="group flex gap-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-300 mt-2.5"
                >
                  <div className="w-8 shrink-0">
                    {showAvatar ? (
                      <Avatar className="h-8 w-8 ring-1 ring-white/10">
                        {girlfriend?.avatar_url ? (
                          <AvatarImage src={girlfriend.avatar_url} alt={displayName} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                            {safeInitial(displayName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ) : null}
                  </div>
                  <GeneratingCard msg={msg} onCancel={onCancelGeneration} />
                </div>
              );
            }

            return (
              <div
                key={row.key}
                className={`group flex gap-2 items-end animate-in fade-in slide-in-from-bottom-2 duration-300 ${isUser ? 'flex-row-reverse' : ''} ${merged ? 'mt-0.5' : 'mt-2.5'}`}
              >
                {isAssistant && (
                  <div className="w-8 shrink-0">
                    {showAvatar ? (
                      <Avatar className="h-8 w-8 ring-1 ring-white/10">
                        {girlfriend?.avatar_url ? (
                          <AvatarImage src={girlfriend.avatar_url} alt={displayName} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                            {safeInitial(displayName)}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ) : null}
                  </div>
                )}

                <div className={`max-w-[82%] sm:max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`relative px-3.5 py-2 text-[14px] leading-relaxed shadow-sm break-words ${
                      isUser
                        ? `bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white rounded-2xl ${merged ? 'rounded-tr-2xl' : 'rounded-tr-md'} shadow-[0_4px_14px_rgba(255,45,120,0.22)] ${isSending ? 'opacity-70' : ''} ${isFailed ? 'from-[#7a1a35] to-[#5c1827]' : ''}`
                        : msg.is_proactive
                          ? `glass text-white/95 rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'} border-l-2 border-l-[#FF2D78]`
                          : isOutfit
                            ? `bg-[#FF2D78]/10 border border-[#FF2D78]/20 text-white/90 italic rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                            : `glass text-white/95 rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                    }`}
                  >
                    {body && isUser && (
                      <span className="whitespace-pre-wrap">{body}</span>
                    )}
                    {body && !isUser && <ChatMarkdown content={body} />}
                    {!body && isAssistant && (
                      <span className="inline-flex gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </span>
                    )}
                    {msg.media_url &&
                      (msg.media_type === 'audio' ||
                      /\.(mp3|wav|m4a|ogg|webm)(\?|$)/i.test(msg.media_url) ||
                      msg.media_url.startsWith('data:audio') ? (
                        <audio
                          controls
                          src={msg.media_url}
                          className="mt-2 w-full max-w-[260px] h-10 rounded-lg"
                          preload="metadata"
                        />
                      ) : msg.media_type === 'video' ||
                        /\.(mp4|webm|mov)(\?|$)/i.test(msg.media_url) ||
                        msg.media_url.startsWith('data:video') ? (
                        <video
                          controls
                          src={msg.media_url}
                          className="mt-2 w-full max-h-[280px] rounded-xl border border-white/10"
                          preload="metadata"
                        />
                      ) : (
                        <ChatImage url={msg.media_url} onOpen={onOpenImage} />
                      ))}
                    {/* Actionable retry chip on selfie failure bubbles */}
                    {isSelfieErr && onRetrySelfie && (
                      <button
                        type="button"
                        onClick={onRetrySelfie}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#FF2D78]/20 to-[#C026D3]/20 ring-1 ring-[#FF2D78]/35 px-3 py-1.5 text-[12px] font-medium text-[#FF9EC4] hover:from-[#FF2D78]/30 hover:to-[#C026D3]/30 active:scale-95 transition-all"
                      >
                        <RefreshCw className="h-3 w-3" />
                        {t('chat.genRetry')}
                      </button>
                    )}
                  </div>

                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-white/35 font-mono tabular-nums opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {msg.created_at ? formatBubbleTime(msg.created_at) : ''}
                    </span>
                    {isUser && msg.status === 'sending' && (
                      <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                    )}
                    {isUser && msg.status === 'sent' && <Check className="h-3 w-3 text-white/35" />}
                    {isUser && msg.status === 'read' && <CheckCheck className="h-3 w-3 text-[#FF6BA6]" />}
                    {isUser && msg.status === 'failed' && (
                      <span className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                        {t('chat.failed')}
                        <button
                          type="button"
                          className="text-[#ff6ba6] hover:text-[#ffb3cd] active:scale-95 transition-all flex items-center gap-0.5"
                          title={t('chat.genRetry')}
                          onClick={() => onRetryMessage?.(msg)}
                        >
                          <RefreshCw className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    {msg.is_proactive && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        {t('chat.proactive')}
                      </span>
                    )}
                    {isOutfit && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Shirt className="h-2.5 w-2.5" />
                        {t('chat.outfit')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-2 px-4 py-2 max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
              {girlfriend?.avatar_url && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={girlfriend.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
              )}
              <div className="flex gap-1 rounded-2xl bg-white/[0.06] backdrop-blur-sm px-4 py-3 border border-white/[0.08]">
                <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-white/40 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          <div ref={bottomRef} className="h-1" />
        </div>
      </div>
    </div>
  );
}

export const ChatStream = memo(ChatStreamInner);
