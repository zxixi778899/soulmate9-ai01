'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import { Heart, Plus, MessageCircle, ShoppingBag, User, Home, LogIn, Sparkles } from 'lucide-react';
import type { TranslationKey } from '@/lib/i18n/types';

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: '/gallery', labelKey: 'nav.explore', icon: Heart },
  { href: '/create', labelKey: 'nav.create', icon: Plus },
  { href: '/messages', labelKey: 'nav.messages', icon: MessageCircle },
  { href: '/shop', labelKey: 'nav.shop', icon: ShoppingBag },
  { href: '/profile', labelKey: 'nav.profile', icon: User },
];

const publicNavItems: NavItem[] = [
  { href: '/', labelKey: 'landing.soulmateAwaits', icon: Home },
  { href: '/login', labelKey: 'hero.signIn', icon: LogIn },
  { href: '/register', labelKey: 'auth.signUp', icon: Sparkles },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useTranslation();

  if (pathname?.startsWith('/admin')) return null;
  // Hide bottom nav in chat detail (IM full-screen style)
  if (pathname?.startsWith('/chat/')) return null;

  const isLoggedIn = !!user;
  const items = isLoggedIn ? navItems : publicNavItems;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)]"
      style={{
        background: 'rgba(10, 5, 8, 0.85)',
        borderTop: '1px solid rgba(201, 166, 107, 0.25)',
      }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-center gap-1 px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-1.5 text-xs transition-all duration-200 min-w-[60px] relative',
                active
                  ? 'text-[#C9A66B]'
                  : 'text-[#8B6F4D] hover:text-[#C9A66B]',
              )}
              style={active ? {
                textShadow: '0 0 12px rgba(201, 166, 107, 0.4)',
              } : {}}
            >
              <Icon className={cn('h-5 w-5', active && 'fill-[#FF2D78]/[20]')} />
              <span className="text-[10px] leading-tight font-medium">
                {t(item.labelKey)}
              </span>
            </Link>
          );
        })}
        <div className="flex items-center justify-center px-1">
          <LanguageSwitcher variant="compact" />
        </div>
      </div>
    </nav>
  );
}