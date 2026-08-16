'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState, useEffect } from 'react';
import {
  Menu, X, User, LogOut, Crown, Flame, ArrowLeft,
  Heart, Wand2, Compass, Users, Coins, CalendarCheck,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { authedFetch } from '@/lib/supabase';

/**
 * Site-wide top navigation — always available (except admin / chat room).
 */
export default function GlobalTopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();

  const [balance, setBalance] = useState<number | null>(null);
  const loadBalance = useCallback((): void => {
    if (!user) {
      setBalance(null);
      return;
    }
    void authedFetch('/api/shop/credits')
      .then((r) => r.json())
      .then((d) => setBalance(Number((d as { credits_remaining?: number }).credits_remaining) || 0))
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    loadBalance();
    window.addEventListener('soulmate:credits-updated', loadBalance);
    return () => window.removeEventListener('soulmate:credits-updated', loadBalance);
  }, [loadBalance]);

  // Hooks must run unconditionally — hide admin/chat chrome only after all hooks.
  const hideChrome =
    Boolean(pathname?.startsWith('/admin')) ||
    Boolean(pathname?.startsWith('/chat/')) ||
    Boolean(pathname?.startsWith('/create')) ||
    (Boolean(pathname?.startsWith('/companion/')) && searchParams.get('tab') === 'chat');

  // Close sheet on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (hideChrome) return null;

  const isHome = pathname === '/';

  // 第十轮定稿顶栏：探索 / 卡池 / 好友 / 创建 / 个人主页
  const navLoggedIn = [
    { href: '/', label: t('nav.explore'), icon: Compass },
    { href: '/explore', label: t('nav.pool'), icon: Heart },
    { href: '/chats', label: t('nav.friends'), icon: Users },
    { href: '/create', label: t('nav.create'), icon: Wand2 },
    { href: '/profile', label: t('nav.profile'), icon: User },
  ];

  const navGuest = [
    { href: '/', label: t('nav.explore'), icon: Compass },
    { href: '/explore', label: t('nav.pool'), icon: Heart },
    { href: '/pricing', label: 'VIP', icon: Crown },
  ];

  const displayLinks = user ? navLoggedIn : navGuest;

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <nav
      className="sticky top-0 z-[60] border-b border-[#ff2e88]/15 bg-[#08040e]/80 backdrop-blur-2xl md:pl-64"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="max-w-none mx-auto px-3 sm:px-5 h-12 sm:h-14 flex items-center gap-2 sm:gap-3">
        {!isHome && (
          <button
            type="button"
            onClick={goBack}
            className="glass h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] active:scale-95 touch-manipulation"
            aria-label={t('general.back')}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2 group shrink-0 min-w-0">
          <div className="glass-btn !rounded-full h-9 w-9 flex items-center justify-center !p-0 shrink-0">
            <Flame className="h-4 w-4" />
          </div>
          <div className="leading-tight hidden min-[380px]:block">
            <div className="text-sm sm:text-base font-black tracking-tight bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
              Oxmate
            </div>
          </div>
        </Link>

        {/* Desktop center nav */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-0.5 min-w-0">
          {displayLinks.map((link) => {
            const active =
              link.href === '/'
                ? pathname === '/'
                : pathname === link.href || pathname?.startsWith(link.href + '/');
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all',
                  active
                    ? 'glass-btn !h-auto !px-3 !py-1.5 text-white'
                    : 'text-white/45 hover:text-white hover:bg-white/[0.05]',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex-1 md:hidden" />

        <div className="ml-auto md:ml-0 flex items-center gap-1 sm:gap-1.5 shrink-0 whitespace-nowrap">
          <LanguageSwitcher variant="compact" />
          {user ? (
            <>
              <Link
                href="/wallet"
                className="glass h-9 sm:h-10 px-2 sm:px-3 rounded-full text-xs flex items-center gap-1 text-amber-300 touch-manipulation shrink-0"
                aria-label="Tokens"
              >
                <Coins className="h-3.5 w-3.5 text-amber-400" />
                <span className="tabular-nums font-semibold hidden min-[400px]:inline">{balance ?? '…'}</span>
              </Link>
              <Link
                href="/pricing"
                className="glass h-9 sm:h-10 px-2 sm:px-3 rounded-full text-xs flex items-center gap-1 text-[#ffd700] touch-manipulation shrink-0"
              >
                <Crown className="h-3.5 w-3.5" />
                <span className="hidden min-[400px]:inline">VIP</span>
              </Link>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('soulmate:open-checkin'))}
                className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center touch-manipulation shrink-0 glass text-[#ffb3cd]"
                aria-label={t('home.checkin')}
                title={t('home.checkin')}
              >
                <CalendarCheck className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-xs text-white/55 hover:text-white px-1.5 sm:px-2 py-2 hidden min-[380px]:inline touch-manipulation shrink-0"
              >
                {t('home.login')}
              </Link>
              <Link
                href="/register"
                className="glass-btn !h-9 sm:!h-10 !px-3 sm:!px-3.5 text-xs touch-manipulation shrink-0 inline-flex items-center justify-center leading-none"
              >
                {t('home.join')}
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden glass h-10 w-10 rounded-full flex items-center justify-center text-white/80 touch-manipulation"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#ff2e88]/12 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="glass-strong rounded-2xl p-2 grid grid-cols-3 gap-1">
            {displayLinks.map((link) => {
              const Icon = link.icon;
              const active =
                link.href === '/'
                  ? pathname === '/'
                  : pathname === link.href || pathname?.startsWith(link.href + '/');
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3.5 rounded-xl text-xs font-medium transition-all touch-manipulation active:scale-95',
                    active
                      ? 'bg-[#ff2e88]/22 text-[#ff6ba6]'
                      : 'text-white/55 active:bg-white/[0.06]',
                  )}
                >
                  <Icon className="h-5 w-5" />
                  {link.label}
                </Link>
              );
            })}
          </div>
          {user && (
            <button
              onClick={() => {
                setMobileOpen(false);
                void signOut();
              }}
              className="mt-2 w-full py-3 text-xs text-red-400/90 text-center flex items-center justify-center gap-1.5 touch-manipulation"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('auth.logout') || 'Sign out'}
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
