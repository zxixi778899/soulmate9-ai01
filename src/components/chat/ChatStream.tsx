'use client';

import { motion } from 'motion/react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ChatMarkdown } from '@/components/chat/ChatMarkdown';
import { formatBubbleTime } from '@/lib/chat-utils';
import {
  Loader2, Heart, Check, CheckCheck, Sparkles, Shirt, ChevronUp,
} from 'lucide-react';
import type { ChatGirlfriend, StreamRow } from './types';

export function ChatStream(props: {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  girlfriend: ChatGirlfriend;
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
    girlfriend.portrait_url || girlfriend.image_url || girlfriend.avatar_url || null;

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="relative flex-1 overflow-y-auto px-3 sm:px-6 pt-3 pb-2"
    >
      {/* Girlfriend portrait stage — always visible behind bubbles */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {portrait ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={portrait}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-top opacity-[0.22] scale-110 blur-[1px]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#08040e]/70 via-[#08040e]/85 to-[#08040e]" />
            <div
              className="absolute left-1/2 top-[20%] -translate-x-1/2 w-[70%] max-w-md aspect-[3/4] rounded-[2rem] overflow-hidden opacity-40"
              style={{ boxShadow: `0 0 80px ${levelColor}44` }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portrait} alt="" className="h-full w-full object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#08040e] via-transparent to-transparent" />
            </div>
          </>
        ) : (
          <div
            className="absolute left-1/2 top-[28%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[640px] opacity-[0.08]"
            style={{
              background: `radial-gradient(ellipse at 50% 40%, ${levelColor} 0%, transparent 60%)`,
              filter: 'blur(48px)',
            }}
          />
        )}
      </div>

      <div className="relative max-w-3xl mx-auto">
        {hasMore && rows.length > 0 && (
          <div className="flex justify-center py-1">
            <button
              onClick={onLoadHistory}
              disabled={loadingMore}
              className="inline-flex items-center gap-1.5 text-[11px] text-[#8B8BA3] hover:text-[#F0F0F5] h-7 px-3 rounded-full bg-white/[0.04] backdrop-blur-md border border-white/[0.06] active:scale-95 transition-all"
            >
              {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronUp className="h-3 w-3" />}
              Load earlier messages
            </button>
          </div>
        )}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#FF2D78]/20 to-[#C026D3]/10 ring-1 ring-[#FF2D78]/20 flex items-center justify-center mb-4">
              <Heart className="h-6 w-6 text-[#FF6BA6]" />
            </div>
            <p className="font-display text-base text-[#F0F0F5]">Say hi to {girlfriend.name}</p>
            <p className="text-xs text-[#8B8BA3] mt-1.5 max-w-xs">
              Send your first message and start building your story together.
            </p>
          </div>
        )}

        <div className="flex flex-col">
          {rows.map((row) => {
            if (row.type === 'date') {
              return (
                <div key={row.key} className="flex justify-center my-3">
                  <span className="text-[10px] font-medium tracking-wider uppercase text-[#8B8BA3] bg-white/[0.04] backdrop-blur-md px-2.5 py-0.5 rounded-full border border-white/[0.04]">
                    {row.label}
                  </span>
                </div>
              );
            }
            const { msg, showAvatar, merged } = row;
            const isUser = msg.role === 'user';
            const isAssistant = !isUser;
            const isOutfit = msg.id.startsWith('outfit-');
            const isSending = msg.status === 'sending';
            const isFailed = msg.status === 'failed';

            return (
              <motion.div
                key={row.key}
                initial={{ opacity: 0, y: 8, x: isUser ? 12 : -12 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''} ${merged ? 'mt-0.5' : 'mt-3'}`}
              >
                {isAssistant && (
                  <div className="w-8 shrink-0">
                    {showAvatar ? (
                      <Avatar className="h-8 w-8 ring-1 ring-white/[0.05]">
                        {girlfriend.avatar_url ? (
                          <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                            {girlfriend.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                    ) : null}
                  </div>
                )}

                <div className={`max-w-[78%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`relative px-3.5 py-2 text-[14px] leading-relaxed shadow-sm break-words ${
                      isUser
                        ? `bg-gradient-to-br from-[#FF2D78] to-[#C026D3] text-white rounded-2xl ${merged ? 'rounded-tr-2xl' : 'rounded-tr-md'} shadow-[0_4px_14px_rgba(255,45,120,0.25)] ${isSending ? 'opacity-70' : ''} ${isFailed ? 'from-[#7a1a35] to-[#5c1827]' : ''}`
                        : msg.is_proactive
                          ? `bg-white/[0.06] backdrop-blur-md border border-white/[0.08] border-l-2 border-l-[#FF2D78] text-[#F0F0F5] rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                          : isOutfit
                            ? `bg-[#FF2D78]/8 backdrop-blur-md border border-[#FF2D78]/15 text-[#F0F0F5] italic rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                            : `bg-white/[0.06] backdrop-blur-md border border-white/[0.08] text-[#F0F0F5] rounded-2xl ${merged ? 'rounded-tl-2xl' : 'rounded-tl-md'}`
                    }`}
                  >
                    {msg.content && isUser && (
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                    )}
                    {msg.content && !isUser && <ChatMarkdown content={msg.content} />}
                    {!msg.content && isAssistant && (
                      <span className="inline-flex gap-1 py-0.5">
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </span>
                    )}
                    {msg.media_url && (
                      <button
                        onClick={() => onOpenImage(msg.media_url!)}
                        className="block mt-2 rounded-xl overflow-hidden border border-white/[0.08] max-w-full active:scale-[0.98] transition-transform"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={msg.media_url}
                          alt="Image"
                          className="w-full h-auto max-h-[280px] object-cover"
                          loading="lazy"
                        />
                      </button>
                    )}
                  </div>

                  <div className={`flex items-center gap-1.5 mt-0.5 px-1 ${isUser ? 'flex-row-reverse' : ''}`}>
                    <span className="text-[10px] text-[#8B8BA3] font-mono tabular-nums">
                      {formatBubbleTime(msg.created_at)}
                    </span>
                    {isUser && msg.status === 'sending' && (
                      <Loader2 className="h-3 w-3 animate-spin text-[#8B8BA3]" />
                    )}
                    {isUser && msg.status === 'sent' && <Check className="h-3 w-3 text-[#8B8BA3]" />}
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
                        new outfit
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {isTyping && (
            <div className="flex gap-2 items-end mt-3">
              <div className="w-8 shrink-0">
                <Avatar className="h-8 w-8 ring-1 ring-white/[0.05]">
                  {girlfriend.avatar_url ? (
                    <AvatarImage src={girlfriend.avatar_url} alt={girlfriend.name} className="object-cover" />
                  ) : (
                    <AvatarFallback className="bg-[#FF2D78]/15 text-[#FF6BA6] text-[10px]">
                      {girlfriend.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              </div>
              <div className="px-3.5 py-2.5 bg-white/[0.06] backdrop-blur-md border border-white/[0.08] rounded-2xl rounded-tl-md">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                  <span className="w-1.5 h-1.5 bg-[#FF6BA6] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
