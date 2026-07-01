'use client';
import { useTranslation } from '@/lib/i18n/context';

import { authedFetch } from '@/lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, MessageCircle, Plus, Search, X } from 'lucide-react';

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

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const ts = date.getTime();
  if (ts >= startOfToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  if (ts >= startOfYesterday) return 'Yesterday';
  if (diff < 7 * 86400000) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
}

export default function MessagesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    Promise.all([
      authedFetch('/api/girlfriends').then(r => r.json()),
      authedFetch('/api/chat/last-messages').then(r => r.json()),
    ])
      .then(([gfData, msgData]) => {
        setGirlfriends(gfData.girlfriends || []);
        const msgMap: Record<string, LastMessage> = {};
        (msgData.messages || []).forEach((m: LastMessage) => {
          msgMap[m.girlfriend_id] = m;
        });
        setLastMessages(msgMap);
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
      .filter(gf => !query || gf.name.toLowerCase().includes(query.toLowerCase()));
  }, [girlfriends, lastMessages, query]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gradient-to-b from-transparent via-transparent to-[#FF2D78]/[0.02]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 backdrop-blur-2xl bg-[#07070F]/80 border-b border-white/[0.06]">
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <h1 className="font-display text-2xl font-bold tracking-tight gradient-text">
            {t('messages.friends') || 'Messages'}
          </h1>
          <Button
            size="icon"
            className="h-9 w-9 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#C026D3] shadow-[0_0_20px_rgba(255,45,120,0.35)] hover:shadow-[0_0_28px_rgba(255,45,120,0.55)] active:scale-95"
            onClick={() => router.push('/create')}
            title={t('messages.create') || 'Create'}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B8BA3]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full h-10 rounded-full bg-white/[0.05] backdrop-blur-xl border border-white/[0.08] pl-10 pr-9 text-sm text-[#F0F0F5] placeholder:text-[#8B8BA3]/70 focus:border-[#FF2D78]/40 focus:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-[#FF2D78]/20 transition-all"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-white/[0.10] hover:bg-white/[0.15] flex items-center justify-center transition-colors"
                aria-label="Clear"
              >
                <X className="h-3 w-3 text-[#8B8BA3]" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78]/20 to-[#C026D3]/10 ring-1 ring-[#FF2D78]/20">
              <MessageCircle className="h-7 w-7 text-[#FF6BA6]" />
            </div>
            <div className="text-center max-w-xs">
              <h2 className="font-display text-xl font-semibold text-[#F0F0F5]">
                {query ? 'No matches' : (t('messages.empty') || 'No conversations yet')}
              </h2>
              <p className="text-xs text-[#8B8BA3] mt-1.5">
                {query
                  ? `No one matches "${query}"`
                  : t('messages.emptyDesc') || 'Add a companion from Explore or create your own.'}
              </p>
            </div>
            {!query && (
              <div className="flex gap-3 mt-2">
                <Button size="sm" variant="outline" onClick={() => router.push('/')}>
                  {t('messages.explore') || 'Explore'}
                </Button>
                <Button
                  size="sm"
                  className="bg-gradient-to-br from-[#FF2D78] to-[#C026D3]"
                  onClick={() => router.push('/create')}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {t('messages.create') || 'Create'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {sorted.map((gf, idx) => {
              const lastMsg = lastMessages[gf.id];
              const preview = lastMsg?.content
                ? lastMsg.role === 'user'
                  ? `You: ${lastMsg.content}`
                  : lastMsg.content
                : 'Tap to start a conversation…';
              return (
                <li
                  key={gf.id}
                  className="h5-reveal"
                  style={{ transitionDelay: `${Math.min(idx * 35, 320)}ms` }}
                >
                  <button
                    onClick={() => router.push(`/chat/${gf.id}`)}
                    className="group flex w-full items-center gap-3 px-4 py-3 text-left active:bg-white/[0.05] hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-14 w-14 ring-1 ring-white/[0.08]">
                        {gf.avatar_url ? (
                          <AvatarImage src={gf.avatar_url} alt={gf.name} className="object-cover" />
                        ) : (
                          <AvatarFallback className="bg-gradient-to-br from-[#FF2D78]/30 to-[#C026D3]/20 text-[#FF6BA6] text-base font-semibold">
                            {gf.name?.charAt(0).toUpperCase() || '?'}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      {/* online dot */}
                      <span
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-400 ring-2 ring-[#07070F]"
                        aria-hidden
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-[15px] font-semibold text-[#F0F0F5] truncate group-active:text-[#FF6BA6]">
                          {gf.name}
                        </span>
                        {lastMsg && (
                          <span className="text-[11px] font-mono tabular-nums text-[#8B8BA3] shrink-0">
                            {formatRelative(lastMsg.created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-[13px] text-[#8B8BA3] truncate mt-0.5">{preview}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
