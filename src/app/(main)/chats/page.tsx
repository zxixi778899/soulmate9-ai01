'use client';

/**
 * Messages list — name + dynamic mood
 */

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, MessageCircle, Plus, Search, X } from 'lucide-react';
import { GameShell } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { deriveMood, loadChatCache } from '@/lib/chat-cache';
import { cn } from '@/lib/utils';

type Girlfriend = {
  id: string;
  name: string;
  avatar_url: string | null;
  personality: string | null;
};
type LastMessage = {
  girlfriend_id: string;
  content: string;
  created_at: string;
  role?: 'user' | 'assistant';
};
type IntimacyRow = { girlfriend_id: string; score: number; level: number };

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const ts = date.getTime();
  if (ts >= startOfToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (ts >= startOfYesterday) return '昨天';
  if (diff < 7 * 86400000) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [intimacyMap, setIntimacyMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [tick, setTick] = useState(0);

  // Subtle mood re-roll animation every 20s
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 20000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Promise.all([
      authedFetch('/api/girlfriends').then((r) => r.json()),
      authedFetch('/api/chat/last-messages').then((r) => r.json()),
      authedFetch('/api/intimacy').then((r) => r.json()).catch(() => ({ scores: [] })),
    ])
      .then(([gfData, msgData, intData]) => {
        setGirlfriends(gfData.girlfriends || []);
        const msgMap: Record<string, LastMessage> = {};
        (msgData.messages || []).forEach((m: LastMessage) => {
          msgMap[m.girlfriend_id] = m;
        });
        // Overlay last message from local chat cache if newer
        (gfData.girlfriends || []).forEach((g: Girlfriend) => {
          const cache = loadChatCache(g.id);
          const last = cache?.messages?.[cache.messages.length - 1];
          if (last) {
            const existing = msgMap[g.id];
            if (!existing || new Date(last.created_at) > new Date(existing.created_at)) {
              msgMap[g.id] = {
                girlfriend_id: g.id,
                content: last.content,
                created_at: last.created_at,
                role: last.role,
              };
            }
          }
        });
        setLastMessages(msgMap);

        const iMap: Record<string, number> = {};
        (intData.scores || []).forEach((s: IntimacyRow) => {
          iMap[s.girlfriend_id] = s.score;
        });
        setIntimacyMap(iMap);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const sorted = useMemo(() => {
    return [...girlfriends]
      .sort((a, b) => {
        const aMsg = lastMessages[a.id]?.created_at || '';
        const bMsg = lastMessages[b.id]?.created_at || '';
        return bMsg.localeCompare(aMsg);
      })
      .filter((gf) => !query || gf.name.toLowerCase().includes(query.toLowerCase()));
  }, [girlfriends, lastMessages, query]);

  return (
    <GameShell hex={false} className="min-h-[100dvh] flex flex-col">
      <PageHeader
        eyebrow="MESSAGES"
        title={t('messages.friends') || '密语列表'}
        subtitle={t('messages.yourConversations') || '对话记录会保留'}
        backHref="/"
        sticky={false}
        actions={
          <button
            type="button"
            onClick={() => router.push('/create')}
            className="glass-btn !h-11 !w-11 !rounded-full !p-0 flex items-center justify-center touch-manipulation"
            aria-label={t('home.create')}
          >
            <Plus className="h-5 w-5" />
          </button>
        }
      />

      <div className="px-3 sm:px-6 py-2.5 max-w-6xl mx-auto w-full">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ff6ba6]/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('common.search') || 'Search…'}
            className="glass-input w-full h-11 pl-10 pr-9 text-[16px] sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full glass flex items-center justify-center touch-manipulation"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-6xl mx-auto w-full px-2 sm:px-4 pb-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-7 w-7 animate-spin text-[#ff6ba6]" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="glass-strong rounded-3xl mx-2 p-10 flex flex-col items-center gap-4">
            <MessageCircle className="h-8 w-8 text-[#ff6ba6]" />
            <p className="text-sm text-white/50">还没有对话 · 去卡池或捏脸开始</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => router.push('/explore')} className="glass h-10 px-4 rounded-full text-sm">卡池</button>
              <button type="button" onClick={() => router.push('/create')} className="glass-btn !h-10 !px-4 text-sm">捏脸</button>
            </div>
          </div>
        ) : (
          <ul className="glass-strong rounded-2xl overflow-hidden divide-y divide-white/[0.05]">
            {sorted.map((gf) => {
              const lastMsg = lastMessages[gf.id];
              const score = intimacyMap[gf.id] || loadChatCache(gf.id)?.intimacy?.score || 0;
              // tick forces occasional mood label variety for empty chats
              const mood = deriveMood(
                lastMsg?.content || (tick % 2 === 0 ? gf.personality || '' : ''),
                score,
              );
              const preview = lastMsg?.content
                ? lastMsg.role === 'user'
                  ? `你: ${lastMsg.content}`
                  : lastMsg.content
                : '还没有消息 · 点进来聊聊';

              return (
                <li key={gf.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/chat/${gf.id}`)}
                    className="wa-row flex w-full items-center gap-3 px-3 sm:px-4 py-3.5 text-left active:bg-white/[0.06] touch-manipulation min-h-[72px]"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-14 w-14 ring-1 ring-[#ff2e88]/25">
                        {gf.avatar_url ? (
                          <AvatarImage src={gf.avatar_url} alt={gf.name} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-gradient-to-br from-[#ff2e88]/40 to-[#c026d3]/30 text-[#ff6ba6] font-bold">
                            {gf.name?.charAt(0) || '?'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <span className="absolute -bottom-0.5 -right-0.5 text-sm drop-shadow" title={mood.label}>
                        {mood.emoji}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-semibold text-white truncate">{gf.name}</span>
                        {lastMsg && (
                          <span className="text-[11px] tabular-nums text-white/35 shrink-0">
                            {formatRelative(lastMsg.created_at)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={cn('text-[11px] font-medium shrink-0', mood.tone)}>
                          {mood.emoji} {mood.label}
                        </span>
                        <span className="text-[12px] text-white/35 truncate">· {preview}</span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GameShell>
  );
}
