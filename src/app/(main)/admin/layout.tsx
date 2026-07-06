'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, LayoutDashboard, Users, Image, Heart, ShoppingBag, CheckSquare, Brain, CreditCard, FileImage, BookOpen, ChevronLeft, LayoutTemplate, Menu } from 'lucide-react';

const adminNav = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Images', href: '/admin/images', icon: FileImage },
  { label: 'Users', href: '/admin/users', icon: Users },
  { label: 'Ads', href: '/admin/ads', icon: Image },
  { label: 'Girlfriends', href: '/admin/girlfriends', icon: Heart },
  { label: 'Character Cards', href: '/admin/character-cards', icon: FileImage },
  { label: 'Lore', href: '/admin/lore', icon: BookOpen },
  { label: 'Shop', href: '/admin/shop', icon: ShoppingBag },
  { label: 'Review', href: '/admin/review', icon: CheckSquare },
  { label: 'AI Models', href: '/admin/models', icon: Brain },
  { label: 'Credits', href: '/admin/credits', icon: CreditCard },
  { label: 'Crypto', href: '/admin/crypto', icon: CreditCard },
  { label: 'Pages', href: '/admin/pages', icon: LayoutTemplate },
  { label: 'Navigation', href: '/admin/navigation', icon: Menu },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    //  AuthProvider  token localStorage key
    const token = session?.access_token || '';

    fetch('/api/admin/check-role', {
      headers: token ? { 'x-session': token } : {},
    })
      .then(r => r.json())
      .then(data => {
        if (!data.isAdmin) {
          router.push('/gallery');
        } else {
          setIsAdmin(true);
        }
      })
      .catch(() => {
        router.push('/gallery');
      });
  }, [user, session, router]);

  if (!user || isAdmin === null) {
    return (
      <div className="admin-layout flex h-screen items-center justify-center bg-[#F5F7FA]">
        <Loader2 className="h-8 w-8 animate-spin text-[#2563EB]" />
      </div>
    );
  }

  return (
    <div className="admin-layout flex h-full bg-[#F5F7FA]" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Mobile sidebar toggle */}
      <button
        className="fixed bottom-20 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-[#2563EB] shadow-lg text-white lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <ChevronLeft className={`h-5 w-5 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[#E2E8F0] bg-white transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center gap-2 border-b border-[#E2E8F0] px-6">
          <LayoutDashboard className="h-5 w-5 text-[#2563EB]" />
          <span className="font-semibold text-[#1E293B]">Admin Panel</span>
        </div>
        <ScrollArea className="h-[calc(100%-56px)] p-3">
          <nav className="flex flex-col gap-1">
            {adminNav.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#EFF6FF] text-[#2563EB]'
                      : 'text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#1E293B]'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-6 border-t border-[#E2E8F0] pt-4 px-3">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs text-[#64748B] gap-2 hover:bg-[#F1F5F9]"
              onClick={() => router.push('/gallery')}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to App
            </Button>
          </div>
        </ScrollArea>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
