'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { APP_NAME, INTIMACY_LEVELS } from '@/lib/constants';
import { authedFetch } from '@/lib/supabase';
import { Heart, MessageCircle, ShoppingBag, User, LogOut, Sparkles, LayoutGrid, CreditCard, Bell, Trophy, ImageIcon } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/context';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

type Girlfriend = { id: string; name: string; avatar_url: string | null; personality: string | null };
type IntimacyScore = { girlfriend_id: string; score: number; level: number };
type LastMessage = { girlfriend_id: string; content: string; created_at: string };

export function Sidebar() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [intimacyScores, setIntimacyScores] = useState<Record<string, IntimacyScore>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  useEffect(() => {
    authedFetch('/api/notifications')
      .then((r) => r.json())
      .then((d) => setUnreadNotifs(d.unreadCount || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/girlfriends');
        const data = await res.json();
        setGirlfriends(data.girlfriends || []);
        if (data.girlfriends?.length) {
          const [scoresRes, msgRes] = await Promise.all([
            authedFetch('/api/intimacy'),
            authedFetch('/api/chat/last-messages'),
          ]);
          const scoresData = await scoresRes.json();
          const scoresMap: Record<string, IntimacyScore> = {};
          (scoresData.scores || []).forEach((s: IntimacyScore) => {
            scoresMap[s.girlfriend_id] = s;
          });
          setIntimacyScores(scoresMap);

          const msgData = await msgRes.json();
          const msgMap: Record<string, LastMessage> = {};
          (msgData.messages || []).forEach((m: LastMessage) => {
            msgMap[m.girlfriend_id] = m;
          });
          setLastMessages(msgMap);
        }
      } catch (err) {
        logger.error('Failed to load sidebar data', { data: err });
      }
    })();
  }, [pathname]);

  const getIntimacyInfo = (score: number) => {
    const levels = INTIMACY_LEVELS as readonly { level: number; min_score: number; title: string; color: string }[];
    let level = levels[0];
    for (const l of levels) if (score >= l.min_score) level = l;
    return level;
  };
  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  const navItems: { icon: typeof LayoutGrid; label: string; path: string }[] = [
    { icon: LayoutGrid, label: 'Explore', path: '/explore' },
    { icon: Sparkles,   label: 'Summon',  path: '/summon' },
    { icon: ImageIcon,  label: 'Studio',  path: '/studio' },
    { icon: Trophy,     label: 'Quest',   path: '/quest' },
    { icon: User,       label: 'Profile', path: '/profile' },
  ];
  const bottomItems = [
    { icon: MessageCircle, label: 'Chats',    path: '/chats' },
    { icon: ShoppingBag,   label: 'Shop',     path: '/shop' },
    { icon: CreditCard,   label: 'Pricing',  path: '/pricing' },
  ];

  return (
    <aside
      className="relative hidden md:flex w-72 lg:w-80 flex-col border-r border-white/[0.06] bg-[#0B0B0B] backdrop-blur-3xl"
    >
      {/* Logo + actions */}
      <div className="relative flex h-16 items-center justify-between border-b border-white/[0.06] px-5">
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}
          >
            <Heart className="h-4 w-4 text-white" fill="currentColor" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">
            SoulMate
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => router.push('/profile')}
            className="relative h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-all"
            aria-label="notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadNotifs > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78] to-[#A855F7] text-[9px] font-bold text-white shadow-[0_0_8px_rgba(255,45,120,0.5)]">
                {unreadNotifs > 9 ? '9+' : unreadNotifs}
              </span>
            )}
          </button>
          <button
            onClick={signOut}
            className="h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-all"
            aria-label="sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-white/[0.06] py-2 px-3">
        <LanguageSwitcher variant="sidebar" />
      </div>

      {/* Top nav */}
      <div className="flex items-center gap-1 border-b border-white/[0.06] p-2">
        {navItems.map((item) => {
          const active = pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                'relative flex-1 gap-1 text-xs h-8 rounded-full flex items-center justify-center transition-all',
                active
                  ? 'bg-gradient-to-r from-[#D05BF8]/20 to-[#FF18A0]/20 text-white border border-[#FF18A0]/30 shadow-[0_0_12px_rgba(255,24,160,0.25)]'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent',
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Companions list */}
      <div className="flex items-center justify-between px-5 py-3">
        <span className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">
          Companions
        </span>
        <button
          onClick={() => router.push('/create')}
          className="h-7 w-7 rounded-full border border-white/10 bg-white/[0.06] flex items-center justify-center text-white/70 hover:text-white hover:bg-gradient-to-br hover:from-[#FF2D78]/30 hover:to-[#A855F7]/30 transition-all"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 px-3 pb-4">
          {girlfriends.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-[#FF2D78]/20 to-[#A855F7]/20 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-white/60" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/80">还没有伴侣</p>
                <p className="text-xs text-white/40 mt-1">创建你的第一个 AI 女友</p>
              </div>
              <button
                onClick={() => router.push('/create')}
                className="mt-2 h-9 px-4 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#A855F7] text-xs font-medium text-white shadow-[0_4px_16px_rgba(255,45,120,0.3)] hover:scale-105 transition-all"
              >
                <Plus className="h-3.5 w-3.5 inline mr-1" />
                立即创建
              </button>
            </div>
          ) : (
            girlfriends.map((gf) => {
              const intimacy = intimacyScores[gf.id];
              const score = intimacy?.score ?? 0;
              const levelInfo = getIntimacyInfo(score);
              const lastMsg = lastMessages[gf.id];
              const isChatActive = pathname === `/chat/${gf.id}`;

              return (
                <button
                  key={gf.id}
                  onClick={() => router.push(`/chat/${gf.id}`)}
                  className={cn(
                    'group relative w-full flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all',
                    isChatActive
                      ? 'bg-gradient-to-r from-[#FF2D78]/15 to-[#A855F7]/15 border border-[#FF2D78]/30 shadow-[0_4px_16px_rgba(255,45,120,0.15)]'
                      : 'hover:bg-white/[0.04] border border-transparent hover:border-white/[0.06]',
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF2D78]/30 to-[#A855F7]/30 blur opacity-50" />
                    <Avatar className="relative h-10 w-10 border border-white/[0.12]">
                      {gf.avatar_url ? (
                        <AvatarImage src={gf.avatar_url} alt={gf.name} />
                      ) : (
                        <AvatarFallback className="bg-gradient-to-br from-[#FF2D78] to-[#A855F7] text-white text-xs font-bold">
                          {getInitials(gf.name)}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-[#050509]"
                      style={{ backgroundColor: levelInfo.color }}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-white truncate">
                        {gf.name}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] text-white/40 shrink-0">
                          {new Date(lastMsg.created_at).toLocaleTimeString('zh-CN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </div>
                    {lastMsg && (
                      <p className="text-xs text-white/50 truncate mt-0.5">{lastMsg.content}</p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Bottom nav */}
      <div className="flex items-center gap-1 border-t border-white/[0.06] p-2">
        {bottomItems.map((item) => {
          const active = pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              className={cn(
                'flex-1 h-9 rounded-xl flex items-center justify-center transition-all',
                active
                  ? 'bg-gradient-to-r from-[#FF2D78]/20 to-[#A855F7]/20 border border-[#FF2D78]/30'
                  : 'text-white/50 hover:text-white hover:bg-white/[0.06] border border-transparent',
              )}
            >
              <item.icon className="h-4 w-4" />
            </button>
          );
        })}
      </div>

      {/* User card */}
      <div className="flex items-center gap-3 border-t border-white/[0.06] p-3">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#FF2D78] to-[#A855F7] opacity-60 blur" />
          <Avatar className="relative h-9 w-9 border border-white/[0.12]">
            <AvatarFallback className="bg-gradient-to-br from-[#FF2D78] to-[#A855F7] text-white text-xs font-bold">
              {user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate">{user?.email}</p>
          <p className="text-[10px] text-white/40">Free Plan</p>
        </div>
      </div>
    </aside>
  );
}