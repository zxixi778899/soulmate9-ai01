'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Heart, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';

/**
 * CreateV3PromoModal — acquisition popup shown right after the user
 * logs in (or opens the site while logged in). Promotes the V3 companion
 * creation flow. Displays once per browser session; a fresh SIGNED_IN
 * event always re-arms it so "login -> popup" holds even mid-session.
 */

const PROMO_FLAG = 'soulmate_promo_v3_shown';

const HIDDEN_ROUTE_PREFIXES = [
  '/admin',
  '/chat/',
  '/create',
  '/login',
  '/register',
  '/onboarding',
  '/payment',
  '/auth',
  '/forgot-password',
  '/update-password',
];

type FloatingBit = {
  id: number;
  left: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  kind: 'heart' | 'spark';
};

export default function CreateV3PromoModal() {
  const { user, supabase } = useAuth();
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loginTick, setLoginTick] = useState(0);

  // A fresh sign-in (even mid-session, e.g. after sign-out/sign-in) always
  // re-arms the popup.
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        sessionStorage.removeItem(PROMO_FLAG);
        setLoginTick((v) => v + 1);
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (!user) return;
    if (HIDDEN_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix))) return;
    if (sessionStorage.getItem(PROMO_FLAG)) return;
    // Poll until the 18+ age gate is confirmed so we never stack on top of it.
    const interval = window.setInterval(() => {
      if (!localStorage.getItem('soulmate_age_verified')) return;
      window.clearInterval(interval);
      sessionStorage.setItem(PROMO_FLAG, '1');
      window.setTimeout(() => setOpen(true), 700);
    }, 800);
    return () => window.clearInterval(interval);
  }, [user, pathname, loginTick]);

  const bits = useMemo<FloatingBit[]>(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 4 + Math.random() * 90,
        size: 8 + Math.random() * 9,
        delay: Math.random() * 2.4,
        duration: 3.2 + Math.random() * 2.6,
        drift: (Math.random() - 0.5) * 44,
        kind: (i % 3 === 0 ? 'spark' : 'heart') as FloatingBit['kind'],
      })),
    // Regenerate the particle field every time the popup opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const close = () => setOpen(false);
  const goCreate = () => {
    setOpen(false);
    router.push('/create');
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9990] flex items-center justify-center p-5">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-[#05030a]/80 backdrop-blur-[6px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />

          {/* Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.62, y: 46 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: 24 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="relative w-full max-w-[22rem]"
            role="dialog"
            aria-modal="true"
          >
            {/* Outer halo */}
            <div className="pointer-events-none absolute -inset-8 rounded-[3rem] bg-[radial-gradient(circle_at_50%_18%,rgba(255,45,120,.35),transparent_62%)] blur-2xl" />

            {/* Gradient border */}
            <div className="relative rounded-[28px] bg-gradient-to-br from-[#FF2D78] via-[#d946ef] to-[#7c3aed] p-[1.5px] shadow-[0_30px_90px_rgba(0,0,0,.6),0_0_60px_rgba(255,45,120,.28)]">
              <div className="relative overflow-hidden rounded-[26.5px] bg-[#0d0915] px-6 pb-7 pt-9 text-center">
                {/* Ambient glows */}
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,45,120,.16),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(124,58,237,.14),transparent_50%)]" />

                {/* Sweeping light beam */}
                <motion.div
                  className="pointer-events-none absolute -inset-y-8 w-24 rotate-12 bg-gradient-to-r from-transparent via-white/12 to-transparent"
                  initial={{ left: '-35%' }}
                  animate={{ left: '130%' }}
                  transition={{ duration: 1.9, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
                />

                {/* Floating hearts & sparks */}
                {bits.map((bit) => (
                  <motion.span
                    key={bit.id}
                    className="pointer-events-none absolute bottom-4"
                    style={{ left: `${bit.left}%`, color: bit.kind === 'spark' ? '#fcd34d' : 'rgba(255,45,120,.75)' }}
                    initial={{ y: 26, opacity: 0 }}
                    animate={{ y: -240, opacity: [0, 0.9, 0], x: bit.drift }}
                    transition={{ duration: bit.duration, delay: bit.delay, repeat: Infinity, ease: 'easeOut' }}
                  >
                    {bit.kind === 'heart' ? (
                      <Heart style={{ width: bit.size, height: bit.size }} fill="currentColor" strokeWidth={0} />
                    ) : (
                      <Sparkles style={{ width: bit.size, height: bit.size }} />
                    )}
                  </motion.span>
                ))}

                {/* Close */}
                <button
                  type="button"
                  onClick={close}
                  className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition hover:bg-white/10 hover:text-white"
                  aria-label={t('general.cancel')}
                >
                  <X className="h-4 w-4" />
                </button>

                {/* Badge */}
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF2D78] to-[#d946ef] shadow-[0_0_35px_rgba(255,45,120,.5)]"
                >
                  <Heart className="h-8 w-8 text-white" fill="white" />
                  <span className="absolute -right-2.5 -top-2.5 flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-300 to-orange-400 px-2 py-0.5 text-[10px] font-black tracking-wide text-[#3b1d03] shadow-[0_4px_14px_rgba(251,191,36,.45)]">
                    <Sparkles className="h-3 w-3" />
                    V3
                  </span>
                </motion.div>

                {/* Copy */}
                <h2 className="relative mt-5 text-[26px] font-black leading-snug tracking-wide">
                  <span className="bg-gradient-to-r from-[#ff5f9e] via-[#e879f9] to-[#a78bfa] bg-clip-text text-transparent">
                    {t('promo.v3.title')}
                  </span>
                </h2>
                <p className="relative mt-2.5 text-sm text-white/55">{t('promo.v3.subtitle')}</p>

                {/* CTA */}
                <motion.button
                  type="button"
                  onClick={goCreate}
                  whileTap={{ scale: 0.97 }}
                  className="relative mt-7 flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-gradient-to-r from-[#FF2D78] to-[#d946ef] text-base font-black text-white shadow-[0_10px_30px_rgba(255,45,120,.4)] transition hover:brightness-110"
                >
                  <motion.span
                    className="pointer-events-none absolute inset-y-0 w-16 bg-white/25 blur-md"
                    initial={{ left: '-25%' }}
                    animate={{ left: '115%' }}
                    transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
                  />
                  <Heart className="h-5 w-5" fill="white" />
                  {t('promo.v3.cta')}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
