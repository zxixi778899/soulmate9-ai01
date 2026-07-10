'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Menu, X, User, LogOut, Crown, Flame, ArrowLeft,
  Heart, MessageCircle, ShoppingBag, Wand2, Home,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/', label: '选角', icon: Home },
  { href: '/explore', label: '卡池', icon: Heart },
  { href: '/chats', label: '密语', icon: MessageCircle },
  { href: '/shop', label: '橱窗', icon: ShoppingBag },
  { href: '/create', label: '捏脸', icon: Wand2 },
  { href: '/profile', label: '我的', icon: User },
] as const;

/**
 * Site-wide top navigation — always available (except admin).
 * Includes back control on non-home routes for better UX.
 */
export default function GlobalTopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Admin: hide. Chat room: hide (has ChatAppBar back) — all other pages keep top nav.
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/chat/')) return null;

  const isHome = pathname === '/';
  const isChatRoom = false;

  // Guests: home + explore + pricing
  const guestLinks = [
    { href: '/', label: '选角', icon: Home },
    { href: '/explore', label: '卡池', icon: Heart },
    { href: '/pricing', label: 'VIP', icon: Crown },
  ] as const;

  const displayLinks = user ? NAV : guestLinks;

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  return (
    <nav className="sticky top-0 z-[60] border-b border-[#ff2e88]/15 bg-[#08040e]/75 backdrop-blur-2xl">
      <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 flex items-center gap-2 sm:gap-3">
        {/* Back — always on non-home */}
        {!isHome && (
          <button
            type="button"
            onClick={goBack}
            className="glass h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[#ffb3cd] hover:text-white active:scale-95"
            aria-label="返回上一页"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="glass-btn !rounded-full h-9 w-9 flex items-center justify-center !p-0">
            <Flame className="h-4 w-4" />
          </div>
          <div className="leading-tight hidden xs:block sm:block">
            <div className="text-sm sm:text-base font-black tracking-tight bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
              SoulMate
            </div>
          </div>
        </Link>

        {/* Desktop center nav */}
        <div className="hidden md:flex flex-1 items-center justify-center gap-0.5">
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

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {user ? (
            <>
              <Link
                href="/pricing"
                className="hidden sm:inline-flex glass-btn !h-9 !px-3 text-xs items-center gap-1"
              >
                <Crown className="h-3.5 w-3.5" /> VIP
              </Link>
              {!isChatRoom && (
                <Link
                  href="/profile"
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center',
                    pathname?.startsWith('/profile')
                      ? 'glass-btn !rounded-full !p-0'
                      : 'glass text-[#ffb3cd]',
                  )}
                >
                  <User className="h-4 w-4" />
                </Link>
              )}
              <button
                onClick={() => void signOut()}
                className="hidden sm:flex text-white/30 hover:text-white p-1.5"
                aria-label="退出"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-xs text-white/50 hover:text-white px-2 hidden sm:inline">
                登录
              </Link>
              <Link href="/register" className="glass-btn !h-9 !px-3.5 text-xs">
                进入
              </Link>
            </>
          )}
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden glass h-9 w-9 rounded-full flex items-center justify-center text-white/80"
            aria-label="菜单"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile sheet nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#ff2e88]/12 px-3 pb-3 pt-2">
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
                    'flex flex-col items-center gap-1 py-3 rounded-xl text-xs font-medium transition-all',
                    active
                      ? 'bg-[#ff2e88]/20 text-[#ff6ba6]'
                      : 'text-white/55 hover:bg-white/[0.05] hover:text-white',
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
              onClick={() => { setMobileOpen(false); void signOut(); }}
              className="mt-2 w-full py-2.5 text-xs text-red-400/80 text-center"
            >
              退出登录
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
