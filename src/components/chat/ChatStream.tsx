'use client';

import { memo } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { formatBubbleTime } from '@/lib/chat-utils';
import {
  Loader2, Heart, Check, CheckCheck, Sparkles, Shirt, ChevronUp,
} from 'lucide-react';
import type { ChatGirlfriend, StreamRow } from './types';

function safeInitial(name?: string | null) {
  const n = (name || '?').trim();
  return n.charAt(0).toUpperCase() || '?';
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
}) {
  const {
    scrollRef, onScroll, girlfriend, rows, isTyping,
    hasMore, loadingMore, onLoadHistory, levelColor, onOpenImage, bottomRef,
  } = props;

  const portrait =
    girlfriend?.portrait_url || girlfriend?.image_url || girlfriend?.avatar_url || null;
  const displayName = girlfriend?.name?.trim() || 'Companion';

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-6 pt-2 pb-2"
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
              Load earlier
            </button>
          </div>
        )}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#FF2D78]/25 to-[#C026D3]/15 ring-1 ring-[#FF2D78]/25 flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-[#FF6BA6]" />
            </div>
            <p className="font-display text-base text-white">Say hi to {displayName}</p>
            <p className="text-xs text-white/40 mt-1.5 max-w-xs">
              Send your first message and start building your story together.
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
            const isSending = msg.status === 'sending';
            const isFailed = msg.status === 'failed';
            const body = typeof msg.content === 'string' ? msg.content : msg.content != null ? String(msg.content) : '';

            return (
              <div
                key={row.key}
                className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''} ${merged ? 'mt-0.5' : 'mt-2.5'}`}
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
                    {msg.media_url && (
                      <button
                        type="button"
                        onClick={() => onOpenImage(msg.media_url!)}
                        className="block mt-2 rounded-xl overflow-hidden border border-white/10 max-w-full active:scale-[0.98] transition-transform"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.media_url}
                          alt=""
                          className="w-full h-auto max-h-[280px] object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      </button>
                    )}
                  </div>

                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-white/35 font-mono tabular-nums">
                      {msg.created_at ? formatBubbleTime(msg.created_at) : ''}
                    </span>
                    {isUser && msg.status === 'sending' && (
                      <Loader2 className="h-3 w-3 animate-spin text-white/40" />
                    )}
                    {isUser && msg.status === 'sent' && <Check className="h-3 w-3 text-white/35" />}
                    {isUser && msg.status === 'read' && <CheckCheck className="h-3 w-3 text-[#FF6BA6]" />}
                    {isUser && msg.status === 'failed' && (
                      <span className="text-[10px] text-red-400 font-medium">Failed</span>
                    )}
                    {msg.is_proactive && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Sparkles className="h-2.5 w-2.5" />
                        proactive
                      </span>
                    )}
                    {isOutfit && (
                      <span className="text-[10px] text-[#FF6BA6]/70 flex items-center gap-0.5">
                        <Shirt className="h-2.5 w-2.5" />
                        outfit
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex gap-2 items-end mt-2.5">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8 ring-1 ring-white/10">
                  {girlfriend?.avatar_url ? (
                    <AvatarImage src={girlfriend.avatar_url} alt={displayName} className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                      {safeInitial(displayName)}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              <div className="px-3.5 py-2.5 glass rounded-2xl rounded-tl-md">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </span>
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
