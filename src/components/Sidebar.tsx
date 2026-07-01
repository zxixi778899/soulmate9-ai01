'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { APP_NAME, INTIMACY_LEVELS } from '@/lib/constants';
import { authedFetch } from '@/lib/supabase';
import { Heart, MessageCircle, ShoppingBag, User, LogOut, Plus, Sparkles, LayoutGrid, Shield, CreditCard, Bell, Receipt } from 'lucide-react';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';

type Girlfriend = {
  id: string;
  name: string;
  avatar_url: string | null;
  personality: string | null;
};

type IntimacyScore = {
  girlfriend_id: string;
  score: number;
  level: number;
};

type LastMessage = {
  girlfriend_id: string;
  content: string;
  created_at: string;
};

export function Sidebar() {
  const { user, signOut } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const [girlfriends, setGirlfriends] = useState<Girlfriend[]>([]);
  const [intimacyScores, setIntimacyScores] = useState<Record<string, IntimacyScore>>({});
  const [lastMessages, setLastMessages] = useState<Record<string, LastMessage>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await authedFetch('/api/notifications');
      const data = await res.json();
      setUnreadNotifs(data.unreadCount || 0);
    } catch { /* silent */ }
  }, []);

  const loadGirlfriends = useCallback(async () => {
    try {
      const res = await authedFetch('/api/girlfriends');
      const data = await res.json();
      setGirlfriends(data.girlfriends || []);

      // Load intimacy scores
      if (data.girlfriends?.length) {
        const scoresRes = await authedFetch('/api/intimacy');
        const scoresData = await scoresRes.json();
        const scoresMap: Record<string, IntimacyScore> = {};
        (scoresData.scores || []).forEach((s: IntimacyScore) => {
          scoresMap[s.girlfriend_id] = s;
        });
        setIntimacyScores(scoresMap);

        // Load last messages
        const msgRes = await authedFetch('/api/chat/last-messages');
        const msgData = await msgRes.json();
        const msgMap: Record<string, LastMessage> = {};
        (msgData.messages || []).forEach((m: LastMessage) => {
          msgMap[m.girlfriend_id] = m;
        });
        setLastMessages(msgMap);

        // Check proactive messages
        await authedFetch('/api/proactive/check', { method: 'POST' });
      }
    } catch (err) {
      console.error('Failed to load girlfriends:', err);
    }
  }, []);

  useEffect(() => {
    loadGirlfriends();
    loadNotifications();
  }, [loadGirlfriends, loadNotifications]);

  const getIntimacyInfo = (score: number): typeof INTIMACY_LEVELS[number] => {
    let level: typeof INTIMACY_LEVELS[number] = INTIMACY_LEVELS[0];
    for (const l of INTIMACY_LEVELS) {
      if (score >= l.min_score) level = l;
    }
    return level;
  };

  const getInitials = (name: string) => name.charAt(0).toUpperCase();

  const isActive = (path: string) => pathname === path;

  const navItems = [
    { icon: LayoutGrid, labelKey: 'nav.gallery', path: '/gallery' },
    { icon: MessageCircle, labelKey: 'nav.messages', path: '/messages' },
    { icon: ShoppingBag, labelKey: 'nav.shop', path: '/shop' },
    { icon: User, labelKey: 'nav.profile', path: '/profile' },
  ];

  const bottomNavItems = [
    { icon: CreditCard, labelKey: 'nav.pricing', path: '/pricing' },
    { icon: Receipt, labelKey: 'nav.purchases', path: '/purchases' },
    { icon: Shield, labelKey: 'nav.admin', path: '/admin' },
  ];

  return (
    <>
      <aside className="hidden md:flex w-72 lg:w-80 flex-col border-r border-white/[0.08] bg-sidebar backdrop-blur-2xl">
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/[0.08] px-5">
          <div className="flex items-center gap-1">
            <Heart className="h-5 w-5 text-[#FF2D78]" fill="currentColor" />
            <span className="text-base font-semibold tracking-tight">{APP_NAME}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="relative h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/profile')}
            >
              <Bell className="h-4 w-4" />
              {unreadNotifs > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#FF2D78] text-[9px] font-bold text-white">
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Language Switcher */}
        <div className="border-t border-white/[0.08] py-2">
          <LanguageSwitcher variant="sidebar" />
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-1 border-b border-white/[0.08] px-3 py-2">
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'default' : 'ghost'}
              size="sm"
              className={`flex-1 gap-1.5 text-xs h-8 ${
                isActive(item.path) ? 'shadow-[0_0_12px_rgba(255,45,120,0.3)]' : 'text-muted-foreground'
              }`}
              onClick={() => router.push(item.path)}
            >
              <item.icon className="h-3.5 w-3.5" />
              {t(item.labelKey as TranslationKey)}
            </Button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="flex items-center justify-between px-5 py-3">
          <span className="text-xs font-medium text-[#FF6BA6] uppercase tracking-wider">
            Companions
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/create')}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 px-2 pb-4">
            {girlfriends.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                <Sparkles className="h-8 w-8 text-muted-foreground/50" />
                <div>
                  <p className="text-sm font-medium text-foreground/80">No companions yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your first AI companion
                  </p>
                </div>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => router.push('/create')}
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Companion
                </Button>
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
                    className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all duration-200 ${
                      isChatActive
                        ? 'bg-[#FF2D78]/15 text-foreground ring-1 ring-[#FF2D78]/30'
                        : 'hover:bg-white/[0.06] text-foreground/80'
                    }`}
                  >
                    <Avatar className="h-10 w-10 shrink-0 border border-white/[0.12]">
                      {gf.avatar_url ? (
                        <AvatarImage src={gf.avatar_url} alt={gf.name} />
                      ) : (
                        <AvatarFallback className="bg-[#FF2D78]/10 text-[#FF2D78] text-xs">
                          {getInitials(gf.name)}
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">{gf.name}</span>
                        {lastMsg && (
                          <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                            {formatTime(lastMsg.created_at)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {lastMsg?.content || 'Start a conversation...'}
                      </p>
                      {/* Intimacy bar */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <div className="flex-1 h-1 rounded-full bg-border/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(score, 100)}%`,
                              backgroundColor: levelInfo.color,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-medium shrink-0" style={{ color: levelInfo.color }}>
                          Lv.{intimacy?.level ?? 1}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Bottom Nav */}
        <div className="flex items-center gap-1 border-t border-white/[0.08] px-3 py-2">
          {bottomNavItems.map((item) => (
            <Button
              key={item.path}
              variant={isActive(item.path) ? 'default' : 'ghost'}
              size="sm"
              className={`flex-1 gap-1.5 text-xs h-8 ${
                isActive(item.path) ? 'shadow-[0_0_12px_rgba(255,45,120,0.3)]' : 'text-muted-foreground'
              }`}
              onClick={() => router.push(item.path)}
            >
              <item.icon className="h-3.5 w-3.5" />
              {t(item.labelKey as TranslationKey)}
            </Button>
          ))}
        </div>

        {/* User info */}
        <div className="border-t border-border/40 p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {user?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground">Free Plan</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/profile')}
            >
              <User className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / 86400000);

  if (days === 0) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}