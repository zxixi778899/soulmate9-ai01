'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { cn } from '@/lib/utils';
import {
  Heart, MessageCircle, User, Home, LogIn, Wand2, ShoppingBag, Sparkles,
} from 'lucide-react';

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();

  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/chat/')) return null;
  if (pathname?.startsWith('/create')) return null;

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
        { href: '/chats', label: t('home.messages'), icon: MessageCircle },
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
  }: {
    href: string;
    label: string;
    icon: React.ElementType;
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
        </span>
        <span className="text-[10px] font-medium leading-none truncate max-w-[4.5rem]">{label}</span>
      </Link>
    );
  };

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 game-bottom-nav"
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
              href="/create"
              className={cn(
                'absolute -top-5 flex h-14 w-14 items-center justify-center rounded-2xl',
                'bg-gradient-to-br from-[#ff2e88] to-[#a855f7]',
                'border-2 border-[#0a0612] shadow-[0_8px_24px_rgba(255,45,120,0.45)]',
                'active:scale-95 transition-transform touch-manipulation',
                isActive('/create') && 'ring-2 ring-[#ffb3cd]/60',
              )}
              aria-label={t('home.createAria')}
            >
              <Wand2 className="h-6 w-6 text-white" />
            </Link>
            <span className="mt-8 text-[10px] font-medium text-white/40 leading-none">{t('home.create')}</span>
          </div>
        ) : (
          <Link
            href="/shop"
            className="flex flex-1 flex-col items-center justify-center gap-0.5 min-h-[48px] text-white/35"
          >
            <ShoppingBag className="h-5 w-5" />
            <span className="text-[10px]">{t('home.shop')}</span>
          </Link>
        )}

        {rightItems.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </div>
    </nav>
  );
}
