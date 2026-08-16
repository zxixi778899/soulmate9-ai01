'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useUnreadMessages } from '@/hooks/useUnreadMessages';
import { cn } from '@/lib/utils';
import {
  Heart, MessageCircle, User, Home, LogIn, Wand2, ShoppingBag, Sparkles,
} from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { settings } = useSiteSettings();
  const { unreadTotal } = useUnreadMessages();

  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/chat/')) return null;
  if (pathname?.startsWith('/create')) return null;
  // Hide bottom nav when companion page is in chat tab (immersive mode)
  if (pathname?.startsWith('/companion/') && searchParams.get('tab') === 'chat') return null;

  const isLoggedIn = !!user;

  // 5-tab dock: create sits center (logged-in) for thumb reach
  const leftItems = isLoggedIn
    ? [
        { href: '/', label: t('home.selectCast'), icon: Home },
        { href: '/explore', label: t('home.pool'), icon: Heart },
      ]
    : [
        { href: '/', label: t('home.selectCast'), icon: Home },
        { href: '/explore', label: t('home.pool'), icon: Heart },
      ];

  const rightItems = isLoggedIn
    ? [
        { href: '/create', label: t('home.create'), icon: Wand2 },
        { href: '/profile', label: t('home.me'), icon: User },
      ]
    : [
        { href: '/login', label: t('home.login'), icon: LogIn },
        { href: '/register', label: t('home.join'), icon: Sparkles },
      ];

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname?.startsWith(href + '/');

  const NavItem = ({
    href,
    label,
    icon: Icon,
    badge,
  }: {
    href: string;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }) => {
    const active = isActive(href);
    return (
      <Link
        href={href}
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] min-w-0 py-1 rounded-xl transition-all active:scale-95',
          'touch-manipulation select-none',
          active ? 'text-[#FF6BA6]' : 'text-white/35',
        )}
      >
        <span
          className={cn(
            'relative flex h-9 w-9 items-center justify-center rounded-xl transition-all',
            active && 'bg-[#ff2e88]/18 shadow-[0_0_16px_rgba(255,45,120,0.35)]',
          )}
        >
          <Icon className={cn('h-5 w-5', active && 'scale-105')} strokeWidth={active ? 2.25 : 1.75} />
          {active && (
            <span className="absolute -bottom-0.5 left-1/2 h-0.5 w-3 -translate-x-1/2 rounded-full bg-[#ff6ba6]" />
          )}
          {!!badge && badge > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-gradient-to-br from-[#FF2D78] to-[#A855F7] px-1 text-[9px] font-bold text-white shadow-[0_0_8px_rgba(255,45,120,0.5)]">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </span>
        <span className="text-[10px] font-medium leading-none truncate max-w-[4.5rem]">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      className="md:hidden fixed bottom-2 left-2 right-2 z-50 game-bottom-nav overflow-hidden rounded-2xl ring-1 ring-white/[0.08] shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
      aria-label="Primary"
    >
      <div className="mx-auto flex max-w-lg items-end justify-between gap-0.5 px-1.5 pt-1">
        {leftItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}

        {isLoggedIn ? (
          <div className="relative flex flex-col items-center justify-end px-1 pb-0.5" style={{ width: 64 }}>
            <Link
              href="/chats"
              className={cn(
                'absolute -top-5 flex h-14 w-14 items-center justify-center rounded-2xl',
                'bg-gradient-to-br from-[#ff2e88] to-[#a855f7]',
                'border-2 border-[#0a0612] shadow-[0_8px_24px_rgba(255,45,120,0.45)]',
                'active:scale-95 transition-transform touch-manipulation',
                isActive('/chats') && 'ring-2 ring-[#ffb3cd]/60',
              )}
              aria-label={t('home.messages')}
            >
              <MessageCircle className="h-6 w-6 text-white" />
              {unreadTotal > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#0a0612] px-1 text-[10px] font-bold text-white shadow-[0_0_8px_rgba(255,45,120,0.5)]">
                  {unreadTotal > 9 ? '9+' : unreadTotal}
                </span>
              )}
            </Link>
            <span className="mt-8 text-[10px] font-medium text-white/40 leading-none">{t('home.messages')}</span>
          </div>
        ) : settings?.shop_enabled ? (
          <Link
            href="/shop"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] text-white/35"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[10px]">{t('home.shop')}</span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}

        {rightItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </div>
    </nav>
  );
}
