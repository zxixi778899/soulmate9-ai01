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
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: '/explore', label: 'Explore', icon: Heart },
  { href: '/chats', label: 'Chats', icon: MessageCircle },
  { href: '/shop', label: 'Shop', icon: ShoppingBag },
  { href: '/create', label: 'Create', icon: Plus },
  { href: '/profile', label: 'Profile', icon: User },
];

const publicNavItems: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/login', label: 'Sign In', icon: LogIn },
  { href: '/register', label: 'Sign Up', icon: Sparkles },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname?.startsWith('/admin')) return null;
  // Hide bottom nav in chat detail (IM full-screen style)
  if (pathname?.startsWith('/chat/')) return null;

  const isLoggedIn = !!user;
  const items = isLoggedIn ? navItems : publicNavItems;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-3xl pb-[env(safe-area-inset-bottom)]"
      style={{
        background: 'rgba(11, 11, 11, 0.95)',
        borderTop: '1px solid rgba(255, 24, 160, 0.18)',
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
                  ? 'text-[#FF18A0]'
                  : 'text-white/35 hover:text-white/60',
              )}
              style={active ? {
                textShadow: '0 0 12px rgba(255, 24, 160, 0.55)',
              } : {}}
            >
              <Icon className={cn('h-5 w-5 transition-all', active && 'fill-[#FF18A0]/15 scale-110')} />
              <span className="text-[10px] leading-tight font-medium">
                {item.label}
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