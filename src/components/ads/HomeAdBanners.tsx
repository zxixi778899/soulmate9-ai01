'use client';

/**
 * Homepage banner ads (admin_ads, position=banner) with i18n copy overlays.
 *
 * Known slots (detected by image_url marker) render translated
 * badge / title / feature chips / CTA on top of the banner art, so every
 * locale sees native copy over the same visual. Unknown ads fall back to
 * plain image rendering (legacy behavior).
 */
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import type { AdItem } from '@/hooks/useSiteSettings';
import { cn } from '@/lib/utils';

type AdSlot = 'weekly' | 'launch' | 'sale';

function detectSlot(imageUrl: string): AdSlot | null {
  if (imageUrl.includes('ad-weekly')) return 'weekly';
  if (imageUrl.includes('ad-beta-launch')) return 'launch';
  if (imageUrl.includes('ad-beta-sale')) return 'sale';
  return null;
}

interface SlotCopy {
  badge: TranslationKey;
  title: TranslationKey;
  cta: TranslationKey;
  chips?: TranslationKey[];
  sub?: TranslationKey;
  badgeClass: string;
  ctaClass: string;
  chipClass: string;
  /** Full-bleed crop focal point (ads are allowed to crop). */
  coverClass: string;
}

const SLOT_COPY: Record<AdSlot, SlotCopy> = {
  weekly: {
    badge: 'ads.weekly.badge',
    title: 'ads.weekly.title',
    cta: 'ads.weekly.cta',
    chips: ['ads.weekly.f1', 'ads.weekly.f2', 'ads.weekly.f3'],
    badgeClass: 'bg-[#ff2e88]/20 text-[#ffb3cd] ring-[#ff2e88]/40',
    ctaClass: 'bg-gradient-to-r from-[#FF2D78] to-[#C026D3] text-white',
    chipClass: 'bg-white/10 text-white/80 ring-white/15',
    coverClass: 'object-[50%_25%]',
  },
  launch: {
    badge: 'ads.beta.badge',
    title: 'ads.beta.title',
    cta: 'ads.beta.cta',
    chips: ['ads.beta.p1', 'ads.beta.p2', 'ads.beta.p3'],
    badgeClass: 'bg-amber-300/20 text-amber-200 ring-amber-300/40',
    ctaClass: 'bg-gradient-to-r from-amber-400 to-orange-500 text-black',
    chipClass: 'bg-amber-300/10 text-amber-100/90 ring-amber-300/25',
    coverClass: 'object-[50%_45%]',
  },
  sale: {
    badge: 'ads.sale.badge',
    title: 'ads.sale.title',
    cta: 'ads.sale.cta',
    sub: 'ads.sale.sub',
    badgeClass: 'bg-emerald-400/20 text-emerald-200 ring-emerald-400/40',
    ctaClass: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-black',
    chipClass: 'bg-emerald-400/10 text-emerald-100/90 ring-emerald-400/25',
    coverClass: 'object-center',
  },
};

export function HomeAdBanners({ ads }: { ads: AdItem[] }) {
  const { t } = useTranslation();
  if (ads.length === 0) return null;

  return (
    <section className="space-y-2">
      {ads.map((ad) => {
        const slot = detectSlot(ad.image_url);
        const copy = slot ? SLOT_COPY[slot] : null;
        const href = ad.link_url || '#';
        const internal = href.startsWith('/');
        const linkClass =
          'block relative overflow-hidden rounded-2xl ring-1 ring-white/10 hover:ring-[#ff2e88]/40 transition-all group h-32 sm:h-40';
        const inner = (
          <>
            {/* Full-bleed art — ads are designed to crop; focal point per slot */}
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic admin-managed ad asset */}
            <img
              src={ad.image_url}
              alt={ad.title}
              loading="lazy"
              decoding="async"
              className={cn(
                'absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300',
                copy?.coverClass || 'object-center',
              )}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/10 pointer-events-none" />
            {copy ? (
              <div className="relative z-[2] h-full flex flex-col justify-center gap-1 sm:gap-1.5 px-4 sm:px-6">
                <span
                  className={cn(
                    'w-fit rounded-full px-2 py-0.5 text-[9px] sm:text-[10px] font-black tracking-widest ring-1 backdrop-blur',
                    copy.badgeClass,
                  )}
                >
                  {t(copy.badge)}
                </span>
                <h3 className="text-base sm:text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                  {t(copy.title)}
                </h3>
                {copy.chips ? (
                  <div className="hidden sm:flex flex-wrap gap-1.5">
                    {copy.chips.map((chip) => (
                      <span
                        key={chip}
                        className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', copy.chipClass)}
                      >
                        {t(chip)}
                      </span>
                    ))}
                  </div>
                ) : null}
                {copy.sub ? (
                  <p className="hidden sm:block text-xs font-medium text-white/80 drop-shadow">
                    {t(copy.sub)}
                  </p>
                ) : null}
                <span
                  className={cn(
                    'mt-0.5 w-fit rounded-full px-3 py-1 text-[10px] sm:text-xs font-bold shadow-lg active:scale-95 transition-transform',
                    copy.ctaClass,
                  )}
                >
                  {t(copy.cta)} →
                </span>
              </div>
            ) : null}
            <span className="absolute top-2 right-2 z-[2] rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-white/80 ring-1 ring-white/20 backdrop-blur">
              AD
            </span>
          </>
        );

        return internal ? (
          <Link key={ad.id} href={href} className={linkClass}>
            {inner}
          </Link>
        ) : (
          <a
            key={ad.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            {inner}
          </a>
        );
      })}
    </section>
  );
}
