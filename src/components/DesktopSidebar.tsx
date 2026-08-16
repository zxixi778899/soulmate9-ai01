'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { cn } from '@/lib/utils';
import {
  Home, Heart, MessageCircle, Wand2, ShoppingBag, Coins, Shirt,
  BookHeart, CalendarCheck, User, Crown, Sparkles, LogIn,
} from 'lucide-react';

/**
 * Desktop sidebar (md+) — golove-style floating glass nav panel:
 * sticky left, 8px edge gap, rounded-2xl, full-height minus 16px.
 * Hidden on mobile (BottomNav takes over) and on admin (admin layout owns nav).
 */
export default function DesktopSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { settings } = useSiteSettings();
  const { unreadTotal } = useUnreadMessages();

  if (pathname?.startsWith('/admin')) return null;

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname?.startsWith(href + '/');

  const items = user
    ? [
        { href: '/', label: t('home.selectCast'), icon: Home },
        { href: '/explore', label: t('home.pool'), icon: Heart },
        { href: '/chats', label: t('home.messages'), icon: MessageCircle, badge: unreadTotal },
        { href: '/create', label: t('home.create'), icon: Wand2 },
        { href: '/wallet', label: t('nav.wallet'), icon: Coins },
        { href: '/wardrobe', label: t('nav.wardrobe'), icon: Shirt },
        { href: '/memories', label: t('nav.memories'), icon: BookHeart },
        { href: '/quest', label: t('nav.quest'), icon: CalendarCheck },
        { href: '/profile', label: t('home.me'), icon: User },
      ].filter(
        (item) =>
          item.href !== '/shop' ||
          settings?.shop_enabled,
      )
    : [
        { href: '/', label: t('home.selectCast'), icon: Home },
        { href: '/explore', label: t('home.pool'), icon: Heart },
        { href: '/login', label: t('home.login'), icon: LogIn },
        { href: '/register', label: t('home.join'), icon: Sparkles },
      ];

  // Insert shop right after create when enabled (logged-in only)
  if (user && settings?.shop_enabled) {
    const shopItem = { href: '/shop', label: t('home.shop'), icon: ShoppingBag };
    const createIdx = items.findIndex((i) => i.href === '/create');
    if (createIdx >= 0) items.splice(createIdx + 1, 0, shopItem);
  }

  return (
    <aside className="hidden md:flex fixed left-2 top-2 bottom-2 z-[70] w-60 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0A0712]/78 backdrop-blur-2xl shadow-[0_16px_48px_rgba(0,0,0,0.5)]">
      <Link
        href="/"
        className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-5"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF2D78] to-[#A855F7] shadow-[0_0_18px_rgba(255,45,120,0.4)]">
          <Crown className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-black tracking-tight bg-gradient-to-r from-[#ff6ba6] via-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">
            Oxmate
          </div>
          <div className="text-[9px] uppercase tracking-[0.25em] text-white/35">AI Companion</div>
        </div>
      </Link>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all',
                active
                  ? 'bg-gradient-to-r from-[#ff2e88]/18 to-[#a855f7]/10 text-[#FF6BA6] ring-1 ring-[#ff2e88]/25'
                  : 'text-white/45 hover:text-white hover:bg-white/[0.05]',
              )}
            >
              <Icon className={cn('h-[18px] w-[18px] shrink-0', active && 'scale-105')} strokeWidth={active ? 2.2 : 1.8} />
              <span className="flex-1 truncate">{item.label}</span>
              {!!item.badge && item.badge > 0 && (
                <span className="flex h-4 min-w-[18px] items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78] to-[#A855F7] px-1 text-[9px] font-bold text-white">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-white/[0.06] px-5 py-3">
        <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">
          {user ? t('nav.signedIn') : t('nav.guest')}
        </div>
      </div>
    </aside>
  );
}
