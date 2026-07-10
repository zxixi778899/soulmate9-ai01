'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';
import {
  Heart, MessageCircle, User, Home, LogIn, Wand2, ShoppingBag, Sparkles,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { href: '/', label: '选角', icon: Home },
  { href: '/explore', label: '卡池', icon: Heart },
  { href: '/chats', label: '密语', icon: MessageCircle },
  { href: '/shop', label: '橱窗', icon: ShoppingBag },
  { href: '/profile', label: '我的', icon: User },
];

const publicNavItems: NavItem[] = [
  { href: '/', label: '选角', icon: Home },
  { href: '/explore', label: '卡池', icon: Heart },
  { href: '/login', label: '登录', icon: LogIn },
  { href: '/register', label: '加入', icon: Sparkles },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (pathname?.startsWith('/admin')) return null;
  if (pathname?.startsWith('/chat/')) return null;
  if (pathname?.startsWith('/create')) return null;

  const isLoggedIn = !!user;
  const items = isLoggedIn ? navItems : publicNavItems;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 game-bottom-nav pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 py-1.5">
        {items.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 min-w-[56px] py-1.5 px-2 rounded-xl transition-all',
                active ? 'text-[#FF6BA6]' : 'text-white/30 hover:text-white/55',
              )}
            >
              <span
                className={cn(
                  'relative flex h-8 w-8 items-center justify-center rounded-xl transition-all',
                  active && 'glass-btn !rounded-xl !h-8 !w-8 !p-0 shadow-[0_0_16px_rgba(255,45,120,0.4)]',
                )}
              >
                <Icon className={cn('h-[18px] w-[18px]', active && 'scale-110')} />
              </span>
              <span className="text-[10px] font-medium leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {isLoggedIn && (
        <Link
          href="/create"
          className="absolute -top-6 right-4 h-12 w-12 rounded-2xl glass-btn !rounded-2xl flex items-center justify-center border-2 border-[#0a0612] active:scale-95"
          aria-label="捏脸创建"
        >
          <Wand2 className="h-5 w-5" />
        </Link>
      )}
    </nav>
  );
}
