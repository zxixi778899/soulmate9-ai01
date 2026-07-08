'use client';

import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Loading wrapper with skeleton fallback for all main pages.
 * Shows branded loading animation while data fetches.
 */
export function PageLoading({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="relative">
        <div className="h-12 w-12 rounded-full border-2 border-white/[0.06]" />
        <div className="absolute inset-0 h-12 w-12 rounded-full border-2 border-t-[#FF2D78] animate-spin" />
      </div>
      <p className="text-sm text-[#8B8BA3] animate-pulse">{message}</p>
    </div>
  );
}

/**
 * Skeleton card for shop/gallery items while loading.
 */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-pulse">
      <div className="aspect-[4/3] bg-white/[0.04]" />
      <div className="p-4 space-y-3">
        <div className="h-4 w-2/3 rounded bg-white/[0.06]" />
        <div className="h-3 w-full rounded bg-white/[0.04]" />
        <div className="h-8 w-full rounded-lg bg-white/[0.06]" />
      </div>
    </div>
  );
}

/**
 * Full-page error state with retry button.
 */
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="h-16 w-16 rounded-full bg-red-500/[0.08] flex items-center justify-center">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-[#F0F0F5]">Something went wrong</p>
        <p className="text-xs text-[#8B8BA3] mt-1">{message || 'Please try again'}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-full text-xs font-medium bg-white/[0.08] text-white hover:bg-white/[0.12] transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

/**
 * Auth guard wrapper — redirects to login if no user.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) return <PageLoading message="Checking session..." />;
  if (!user) return null;

  return <>{children}</>;
}