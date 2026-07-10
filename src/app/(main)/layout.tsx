'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { Loader2 } from 'lucide-react';

/**
 * Main app shell — no left sidebar (full-bleed game canvas).
 * Navigation lives in bottom dock + top glass bar.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    setMounted(true);
  }, []);

  // Public routes inside (main) that must work without login
  const isPublicMainRoute =
    pathname === '/pricing' ||
    pathname?.startsWith('/pricing/') ||
    pathname === '/payment/success';

  useEffect(() => {
    if (mounted && !isLoading && !user && !isPublicMainRoute) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.push(`/login${next}`);
    }
  }, [mounted, isLoading, user, router, pathname, isPublicMainRoute]);

  useEffect(() => {
    if (mounted && !isLoading && user && pathname !== '/onboarding' && !isAdmin) {
      const onboardingDone = localStorage.getItem('soulmate_onboarding_complete');
      if (!onboardingDone) {
        router.push('/onboarding');
      }
    }
  }, [mounted, isLoading, user, pathname, router, isAdmin]);

  if (pathname === '/onboarding' && user) {
    return <>{children}</>;
  }

  // Always show a shell while hydrating / auth loads — never blank body
  if (!mounted || isLoading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08040e]">
        <div
          className="pointer-events-none fixed inset-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 60% 50% at 50% 50%, rgba(255, 45, 120, 0.28) 0%, transparent 60%),
              radial-gradient(ellipse 80% 60% at 80% 100%, rgba(168, 85, 247, 0.2) 0%, transparent 65%),
              linear-gradient(180deg, #050509 0%, #0A0A14 100%)
            `,
          }}
        />
        <div className="relative flex flex-col items-center gap-4 glass-strong rounded-3xl px-10 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-[#FF6BA6]" />
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Loading…</p>
        </div>
      </div>
    );
  }

  // Unauthenticated: keep loading shell while redirect runs (avoid empty white/black page)
  if (!user && !isPublicMainRoute) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08040e]">
        <div className="relative flex flex-col items-center gap-4 glass-strong rounded-3xl px-10 py-8">
          <Loader2 className="h-10 w-10 animate-spin text-[#FF6BA6]" />
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Redirecting to login…</p>
        </div>
      </div>
    );
  }

  const isChatDetail = pathname?.startsWith('/chat/');
  const isCreate = pathname?.startsWith('/create');

  // Chat / create: full-height fixed shell. Other pages: scrollable mobile canvas.
  const lockViewport = isChatDetail || isCreate || isAdmin;

  return (
    <div
      className={`relative flex bg-[#08040e] text-[#FAF7FF] ${
        lockViewport
          ? 'h-[100dvh] max-h-[100dvh] overflow-hidden'
          : 'min-h-[100dvh]'
      }`}
    >
      {!isAdmin && (
        <div
          className="pointer-events-none fixed inset-0 z-0"
          aria-hidden
          style={{
            background: `
              radial-gradient(ellipse 70% 50% at 50% -10%, rgba(255, 45, 120, 0.16) 0%, transparent 55%),
              radial-gradient(ellipse 50% 40% at 100% 80%, rgba(168, 85, 247, 0.12) 0%, transparent 55%),
              radial-gradient(ellipse 40% 30% at 0% 60%, rgba(255, 107, 166, 0.08) 0%, transparent 50%),
              linear-gradient(180deg, #0a0610 0%, #04020a 100%)
            `,
          }}
        />
      )}

      <main
        className={
          lockViewport
            ? 'relative z-10 flex-1 overflow-hidden w-full min-h-0'
            : `relative z-10 flex-1 w-full overflow-x-hidden ${
                !isAdmin
                  ? 'pb-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] md:pb-6'
                  : ''
              }`
        }
        style={
          lockViewport
            ? undefined
            : { WebkitOverflowScrolling: 'touch' }
        }
      >
        {children}
      </main>
    </div>
  );
}
