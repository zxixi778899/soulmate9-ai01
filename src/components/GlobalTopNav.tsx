'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Button } from '@/components/ui/button';
import {
  Heart, Sparkles, CreditCard, Home, Menu, X,
} from 'lucide-react';
import { useState } from 'react';

/**
 * Global top navigation bar for PUBLIC pages.
 * Hidden on /admin/* and (main)/* routes (those have their own navigation).
 * Visible on: landing, login, register, girlfriend/[slug], privacy, terms, p/[slug]
 */
export function GlobalTopNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hide on admin pages and authenticated app pages (they have Sidebar/BottomNav)
  if (pathname?.startsWith('/admin')) return null;
  // Also hide on (main) routes that have their own Sidebar
  // But show on landing (/), login, register, auth pages, girlfriend preview, legal, CMS
  const isMainApp = pathname !== '/' &&
    !pathname?.startsWith('/login') &&
    !pathname?.startsWith('/register') &&
    !pathname?.startsWith('/forgot') &&
    !pathname?.startsWith('/update-password') &&
    !pathname?.startsWith('/auth') &&
    !pathname?.startsWith('/girlfriend') &&
    !pathname?.startsWith('/privacy') &&
    !pathname?.startsWith('/terms') &&
    !pathname?.startsWith('/p/');
  if (isMainApp) return null;

  const publicLinks = [
    { href: '/', label: t('nav.explore'), icon: Home },
    { href: '/pricing', label: t('nav.pricing'), icon: CreditCard },
  ];

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <nav className="flex items-center justify-between rounded-2xl bg-[#0c0c18]/70 px-5 py-3 backdrop-blur-2xl border border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF2D78] to-[#8b5cf6]">
                <Heart className="h-4 w-4 text-white fill-white" />
              </div>
              <span className="font-display text-lg font-bold text-white hidden sm:inline">
                SoulMate AI
              </span>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'text-white bg-white/[0.08]'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <link.icon className="h-3.5 w-3.5" />
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Right side: language + auth */}
            <div className="flex items-center gap-2">
              {/* Language switcher */}
              <LanguageSwitcher variant="compact" />

              {/* Auth buttons */}
              {user ? (
                <Link href="/gallery">
                  <Button
                    size="sm"
                    className="gap-1.5 bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] hover:opacity-90 text-white text-xs"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {t('nav.explore')}
                  </Button>
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                  <Link href="/login" className="hidden sm:block">
                    <Button variant="ghost" size="sm" className="text-white/70 hover:text-white text-xs">
                      {t('hero.signIn')}
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button
                      size="sm"
                      className="gap-1.5 bg-gradient-to-r from-[#FF2D78] to-[#d946ef] shadow-[0_0_20px_rgba(255,45,120,0.4)] hover:shadow-[0_0_30px_rgba(255,45,120,0.6)] hover:scale-105 transition-all text-white text-xs"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      {t('hero.getStarted')}
                    </Button>
                  </Link>
                </div>
              )}

              {/* Mobile menu toggle */}
              <button
                className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:text-white hover:bg-white/[0.08] transition-colors"
                onClick={() => setMobileOpen(!mobileOpen)}
              >
                {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            </div>
          </nav>

          {/* Mobile dropdown */}
          {mobileOpen && (
            <div className="md:hidden mt-2 rounded-xl bg-[#0c0c18]/95 backdrop-blur-2xl border border-white/[0.08] p-3 shadow-xl">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    pathname === link.href
                      ? 'text-white bg-white/[0.08]'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <link.icon className="h-4 w-4" />
                  {link.label}
                </Link>
              ))}
              {!user && (
                <>
                  <div className="my-2 border-t border-white/[0.06]" />
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm text-white/60 hover:text-white"
                  >
                    {t('hero.signIn')}
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Spacer to prevent content from going under fixed nav */}
      <div className="h-20" />
    </>
  );
}
