'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Heart, Home, Menu, X, LayoutGrid, MessageCircle, ShoppingBag, Plus, User, LogOut, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Global top navigation bar — always shown, 5-tab main menu.
 */
export function GlobalTopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/chat/')) return null;

  const isAuthApp = !!user;
  const links = isAuthApp
    ? [
        { href: '/explore', label: 'Explore', icon: LayoutGrid },
        { href: '/chats', label: 'Chats', icon: MessageCircle },
        { href: '/shop', label: 'Shop', icon: ShoppingBag },
        { href: '/create', label: 'Create', icon: Plus },
        { href: '/profile', label: 'Profile', icon: User },
      ]
    : [
        { href: '/', label: 'Home', icon: Home },
        { href: '/pricing', label: 'Pricing', icon: CreditCard },
      ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 py-3">
        <nav className="flex items-center justify-between rounded-2xl bg-[#0c0c18]/80 px-3 sm:px-5 py-2.5 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full"
              style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}
            >
              <Heart className="h-3.5 w-3.5 text-white" fill="currentColor" />
            </div>
            <span className="font-bold text-base tracking-tight text-white hidden sm:inline">
              SoulMate
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all',
                  pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href))
                    ? 'bg-gradient-to-r from-[#D05BF8]/20 to-[#FF18A0]/20 text-white border border-[#FF18A0]/30 shadow-[0_0_12px_rgba(255,24,160,0.2)]'
                    : 'text-white/60 hover:text-white hover:bg-white/[0.05] border border-transparent',
                )}
              >
                <link.icon className="h-3.5 w-3.5" />
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="compact" />
            {isAuthApp ? (
              <button
                onClick={signOut}
                className="hidden md:flex h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.08] transition-all"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            ) : (
              <div className="hidden md:flex items-center gap-1.5">
                <Link href="/login" className="h-9 px-4 rounded-full text-sm font-medium text-white/80 hover:text-white transition-all flex items-center">
                  Login
                </Link>
                <Link
                  href="/register"
                  className="h-9 px-4 rounded-full text-sm font-semibold text-white flex items-center hover:scale-105 transition-all"
                  style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}
                >
                  Sign Up
                </Link>
              </div>
            )}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden h-9 w-9 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center text-white"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>

        {mobileOpen && (
          <div className="md:hidden mt-2 rounded-2xl bg-[#0c0c18]/95 backdrop-blur-2xl border border-white/[0.08] p-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            <div className="grid grid-cols-2 gap-1">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                    pathname === link.href || (link.href !== '/' && pathname?.startsWith(link.href))
                      ? 'bg-gradient-to-r from-[#D05BF8]/20 to-[#FF18A0]/20 text-white'
                      : 'text-white/70 hover:bg-white/[0.05]',
                  )}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
            </div>
            {isAuthApp ? (
              <button
                onClick={() => { signOut(); setMobileOpen(false); }}
                className="mt-2 w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-white/70 hover:bg-white/[0.05]"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            ) : null}
          </div>
        )}
      </div>
      <div className="h-20" />
    </header>
  );
}