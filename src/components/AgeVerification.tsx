'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { APP_NAME } from '@/lib/constants';
import { Heart } from 'lucide-react';

export function AgeVerification() {
  const [showOverlay, setShowOverlay] = useState<boolean | null>(null);
  const [agreed, setAgreed] = useState(false);
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register' || pathname.startsWith('/auth/');

  useEffect(() => {
    if (isAuthPage) {
      setShowOverlay(false);
      return;
    }
    const verified = localStorage.getItem('soulmate_age_verified');
    setShowOverlay(!verified);
  }, [isAuthPage]);

  const handleConfirm = () => {
    if (!agreed) return;
    localStorage.setItem('soulmate_age_verified', new Date().toISOString());
    setShowOverlay(false);
  };

  if (showOverlay !== true) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#07070F]/80 backdrop-blur-md">
      {/* Pink orb glow - subtle accents only, let homepage show through */}
      <div className="absolute top-1/4 right-1/4 w-80 h-80 rounded-full bg-[#FF2D78]/8 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 left-1/4 w-60 h-60 rounded-full bg-[#8b5cf6]/6 blur-3xl pointer-events-none" />

      <div className="relative z-10 mx-auto w-full max-w-md px-6 text-center">
        {/* Logo */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF2D78] to-[#d946ef] shadow-[0_0_25px_rgba(255,45,120,0.4)]">
            <Heart className="h-6 w-6 text-white" fill="white" />
          </div>
          <span className="text-2xl font-bold tracking-tight">{APP_NAME}</span>
        </div>

        {/* Age Gate Card  glass style */}
        <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] backdrop-blur-2xl p-8 shadow-[0_25px_60px_rgba(0,0,0,0.6),0_0_40px_rgba(255,45,120,0.08)]">
          <h1 className="text-xl font-semibold tracking-tight">Age Verification Required</h1>
          <p className="mt-3 text-sm leading-relaxed text-[#8B8BA3]">
            This website contains adult-oriented AI companion content. 
            You must be <strong className="text-[#F0F0F5]">18 years or older</strong> to access this site.
          </p>

          <div className="mt-6 space-y-4">
            <div
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl p-4 text-left transition-all hover:border-[#FF2D78]/20"
              onClick={() => setAgreed((prev) => !prev)}
              role="checkbox"
              aria-checked={agreed}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault();
                  setAgreed((prev) => !prev);
                }
              }}
            >
              <Checkbox
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                onClick={(e) => e.stopPropagation()}
                className="mt-0.5 border-[#8B8BA3]/40 data-[state=checked]:border-[#FF2D78] data-[state=checked]:bg-[#FF2D78]"
              />
              <span className="select-none text-sm leading-relaxed text-[#8B8BA3]">
                I confirm that I am <strong className="text-[#F0F0F5]">18 years or older</strong> and I agree to the{' '}
                <a href="/terms" className="text-[#FF2D78] underline underline-offset-2 hover:text-[#FF6BA6]" onClick={(e) => e.stopPropagation()}>Terms of Service</a>{' '}
                and{' '}
                <a href="/privacy" className="text-[#FF2D78] underline underline-offset-2 hover:text-[#FF6BA6]" onClick={(e) => e.stopPropagation()}>Privacy Policy</a>.
              </span>
            </div>

            <Button
              onClick={handleConfirm}
              disabled={!agreed}
              className="h-12 w-full text-sm font-semibold rounded-xl bg-[#FF2D78] text-white hover:bg-[#FF6BA6] shadow-[0_0_20px_rgba(255,45,120,0.3)] hover:shadow-[0_0_30px_rgba(255,45,120,0.5)] transition-all duration-200 disabled:opacity-40 disabled:shadow-none"
              size="lg"
            >
              Enter {APP_NAME}
            </Button>

            <p className="text-xs text-muted-foreground/60">
              By entering, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}