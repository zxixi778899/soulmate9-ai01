'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import DesktopSidebar from '@/components/DesktopSidebar';
import { Loader2 } from 'lucide-react';

/**
 * Route prefixes that require authentication.
 * Guests can freely browse everything else (explore, category, pricing…).
 * When a guest hits one of these, we redirect to /login?next=<path>.
 */
const AUTH_REQUIRED_PREFIXES = [
  '/chat/',
  '/chats',
  '/create',
  '/studio',
  '/wallet',
  '/wardrobe',
  '/memories',
  '/quest',
  '/voice',
  '/summon',
  '/profile',
  '/account',
  '/shop',
  '/purchases',
  '/payment',
  '/admin',
  '/achievements',
];

function isAuthRequired(pathname: string | null): boolean {
  if (!pathname) return false;
  // /payment/success is public (post-checkout landing)
  if (pathname === '/payment/success' || pathname.startsWith('/payment/success/')) return false;
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix.replace(/\/$/, '') || pathname.startsWith(prefix),
  );
}

/**
 * Main app shell — no left sidebar (full-bleed game canvas).
 * Navigation lives in bottom dock + top glass bar.
 *
 * Permission model:
 *  - Guest (no session): browse explore / category / pricing freely.
 *    Triggered login when entering chat, create, shop, etc.
 *  - User (authenticated): full access gated by membership tier.
 *  - Admin: /admin guarded separately by admin layout + requireAdmin().
 */
function MainLayoutShell({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const isAdmin = pathname?.startsWith('/admin');

  useEffect(() => {
    setMounted(true);
  }, []);

  const needsAuth = isAuthRequired(pathname);

  // Redirect guests only when they hit an auth-required route
  useEffect(() => {
    if (mounted && !isLoading && !user && needsAuth) {
      const next = pathname && pathname !== '/' ? `?next=${encodeURIComponent(pathname)}` : '';
      router.push(`/login${next}`);
    }
  }, [mounted, isLoading, user, router, pathname, needsAuth]);

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

  // Guest on auth-required route: keep loading shell while redirect runs
  if (!user && needsAuth) {
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
  const isChats = pathname === '/chats' || pathname?.startsWith('/chats/');
  const isCreate = pathname?.startsWith('/create');
  const isProfile = pathname === '/profile' || pathname?.startsWith('/profile/');
  const isCompanionChat = pathname?.startsWith('/companion/') && searchParams.get('tab') === 'chat';

  // Chat / chats / create: full-height fixed shell. Other pages: scrollable mobile canvas.
  const lockViewport = isChatDetail || isChats || isCreate || isProfile || isAdmin || isCompanionChat;

  // /chats keeps the sticky top nav visible, so the locked shell must subtract the
  // nav height (3rem mobile / 3.5rem desktop + 1px border + safe-area top inset)
  // to fit exactly between the nav and the viewport bottom. Other locked pages hide
  // the nav and can use the full dynamic viewport height.
  const lockedShellHeight = isChats
    ? 'h-[calc(100dvh-3rem-1px-env(safe-area-inset-top,0px))] sm:h-[calc(100dvh-3.5rem-1px-env(safe-area-inset-top,0px))]'
    : 'h-[100dvh] max-h-[100dvh]';

  return (
    <div
      className={`relative flex bg-[#08040e] text-[#FAF7FF] ${
        lockViewport
          ? `${lockedShellHeight} overflow-hidden`
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

      <DesktopSidebar />

      <main
        className={
          lockViewport
            ? `relative z-10 flex-1 overflow-hidden w-full min-h-0 ${!isAdmin ? 'md:pl-64' : ''}`
            : `relative z-10 flex-1 w-full overflow-x-hidden ${!isAdmin ? 'md:pl-64' : ''} ${
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

/**
 * Suspense boundary required because the shell reads useSearchParams();
 * without it, static prerendering of (main) pages bails out with
 * missing-suspense-with-csr-bailout.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <MainLayoutShell>{children}</MainLayoutShell>
    </Suspense>
  );
}
