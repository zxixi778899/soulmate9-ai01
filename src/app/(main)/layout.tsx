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

  useEffect(() => {
    if (mounted && !isLoading && user && pathname !== '/onboarding') {
      const onboardingDone = localStorage.getItem('soulmate_onboarding_complete');
      if (!onboardingDone) {
        router.push('/onboarding');
      }
    }
  }, [mounted, isLoading, user, pathname, router]);

  if (pathname === '/onboarding' && user) {
    return <>{children}</>;
  }

  if (!mounted || isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050509]">
        <div
          className="pointer-events-none fixed inset-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255, 45, 120, 0.25) 0%, transparent 60%),
              radial-gradient(ellipse 80% 60% at 80% 100%, rgba(168, 85, 247, 0.18) 0%, transparent 65%),
              linear-gradient(180deg, #050509 0%, #0A0A14 100%)
            `,
          }}
        />
        <div className="relative flex flex-col items-center gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-[#FF6BA6]" />
          <p className="text-xs uppercase tracking-[0.3em] text-white/40">Loading</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isChatDetail = pathname?.startsWith('/chat/');

  return (
    <div className="relative flex h-screen overflow-hidden bg-[#050509]">
      {/* Ambient nebula backdrop — shared across all main pages */}
      {!isAdmin && (
        <div
          className="pointer-events-none fixed inset-0 z-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 60% 40% at 20% 10%, rgba(255, 45, 120, 0.10) 0%, transparent 55%),
              radial-gradient(ellipse 50% 35% at 90% 80%, rgba(168, 85, 247, 0.08) 0%, transparent 55%),
              radial-gradient(ellipse 40% 30% at 50% 100%, rgba(59, 130, 246, 0.05) 0%, transparent 60%)
            `,
          }}
        />
      )}

      {!isAdmin && <Sidebar />}
      <main
        className={`relative z-10 flex-1 overflow-hidden ${
          !isAdmin && !isChatDetail ? 'pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-0' : ''
        }`}
      >
        {children}
      </main>
    </div>
  );
}