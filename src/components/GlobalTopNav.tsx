'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X, User, LogOut } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

export default function GlobalTopNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="text-3xl font-bold bg-gradient-to-r from-rose-500 to-purple-500 bg-clip-text text-transparent">
            OOXX
          </div>
          <span className="text-xs text-zinc-500 hidden sm:block">Obsession Unleashed</span>
        </Link>

        <div className="hidden md:flex items-center gap-8">
          <Link href="/discover" className="hover:text-rose-400 transition-colors">发现</Link>
          <Link href="/gallery" className="hover:text-rose-400 transition-colors">画廊</Link>
          <Link href="/shop" className="hover:text-rose-400 transition-colors">商城</Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-3">
              <Link href="/profile" className="flex items-center gap-2 hover:text-rose-400">
                <User className="h-5 w-5" />
                <span className="hidden md:block">{user.email?.split('@')[0]}</span>
              </Link>
              <button onClick={signOut} className="text-zinc-400 hover:text-white">
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <Link href="/login" className="px-5 py-2 rounded-full bg-white text-black font-medium hover:bg-zinc-200">
              登录
            </Link>
          )}
          <button onClick={() => setMobileOpen(!mobileOpen)} className="md:hidden p-2 text-white">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950 py-4">
          <div className="flex flex-col px-6 space-y-4">
            <Link href="/discover" className="py-2 hover:text-rose-400">发现</Link>
            <Link href="/gallery" className="py-2 hover:text-rose-400">画廊</Link>
            <Link href="/shop" className="py-2 hover:text-rose-400">商城</Link>
          </div>
        </div>
      )}
    </nav>
  );
}