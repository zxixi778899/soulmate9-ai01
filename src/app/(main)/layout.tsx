'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Sidebar } from '@/components/Sidebar';
import { Loader2 } from 'lucide-react';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isLoading && !user) {
      router.push('/login');
    }
  }, [mounted, isLoading, user, router]);

  // Onboarding redirect: check localStorage after user is confirmed
  useEffect(() => {
    if (mounted && !isLoading && user && pathname !== '/onboarding') {
      const onboardingDone = localStorage.getItem('soulmate_onboarding_complete');
      if (!onboardingDone) {
        router.push('/onboarding');
      }
    }
  }, [mounted, isLoading, user, pathname, router]);

  // Skip auth check for onboarding page
  if (pathname === '/onboarding' && user) {
    return <>{children}</>;
  }

  if (!mounted || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0E0E1A]">
        <Loader2 className="h-6 w-6 animate-spin text-[#FF2D78]" />
      </div>
    );
  }

  if (!user) return null;

  const isChatDetail = pathname?.startsWith('/chat/');

  return (
    <div className="flex h-screen">
      {!isAdmin && <Sidebar />}
      <main
        className={`flex-1 overflow-hidden ${
          !isAdmin && !isChatDetail ? 'pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0' : ''
        }`}
      >
        {children}
      </main>
      
    </div>
  );
}