'use client';

/**
 * Homepage banner ads (admin_ads, position=banner) as an auto-rotating
 * carousel (golove-style) with i18n copy overlays.
 *
 * Known slots (detected by image_url marker) render translated
 * badge / title / feature chips / CTA on top of the banner art, so every
 * locale sees native copy over the same visual. Unknown ads fall back to
 * plain image rendering (legacy behavior).
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import { useSiteCopy, type AdItem } from '@/hooks/useSiteSettings';
import type { SiteCopy } from '@/lib/copy-store';
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
  },
  launch: {
    badge: 'ads.beta.badge',
    title: 'ads.beta.title',
    cta: 'ads.beta.cta',
    chips: ['ads.beta.p1', 'ads.beta.p2', 'ads.beta.p3'],
    badgeClass: 'bg-amber-300/20 text-amber-200 ring-amber-300/40',
    ctaClass: 'bg-gradient-to-r from-amber-400 to-orange-500 text-black',
    chipClass: 'bg-amber-300/10 text-amber-100/90 ring-amber-300/25',
  },
  sale: {
    badge: 'ads.sale.badge',
    title: 'ads.sale.title',
    cta: 'ads.sale.cta',
    sub: 'ads.sale.sub',
    badgeClass: 'bg-emerald-400/20 text-emerald-200 ring-emerald-400/40',
    ctaClass: 'bg-gradient-to-r from-emerald-400 to-teal-500 text-black',
    chipClass: 'bg-emerald-400/10 text-emerald-100/90 ring-emerald-400/25',
  },
};

export function HomeAdBanners({ ads }: { ads: AdItem[] }) {
  const { t } = useTranslation();
  const { copy: siteCopy } = useSiteCopy();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = ads.length;

  // 管理员文案覆盖：空值回退到 i18n 默认翻译
  const chipOverrides: (string | undefined)[] = [
    siteCopy.bannerChip1,
    siteCopy.bannerChip2,
    siteCopy.bannerChip3,
  ];
  const overrideOf = (key: keyof SiteCopy): string | undefined => siteCopy[key] || undefined;

  // 自动轮播：6s 切换，悬停暂停，标签隐藏时跳过
  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setIndex((i) => (i + 1) % count);
    }, 6000);
    return () => clearInterval(timer);
  }, [count, paused]);

  if (count === 0) return null;
  const active = Math.min(index, count - 1);

  return (
    <section
      // 横屏构图：移动端 16:9 观感 → 桌面更宽幅，高度随断点抬升
      className="relative h-52 sm:h-64 lg:h-80"
      aria-label="Featured offers"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {ads.map((ad, i) => {
        const slot = detectSlot(ad.image_url);
        const slotCopy = slot ? SLOT_COPY[slot] : null;
        const href = ad.link_url || '#';
        const internal = href.startsWith('/');
        const linkClass = cn(
          'absolute inset-0 block overflow-hidden rounded-2xl ring-1 ring-white/10 bg-[#0a0612] transition-all duration-500 group',
          i === active ? 'opacity-100 z-[1]' : 'opacity-0 z-0 pointer-events-none',
        );
        const inner = (
          <>
            {/* Base art — full-bleed and centered (object-cover, focal 50% 50%) */}
            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic admin-managed ad asset */}
            <img
              src={ad.image_url}
              alt={ad.title}
              loading={i === active ? 'eager' : 'lazy'}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-300"
            />
            {/* 均匀暗化：居中排版下整幅文案可读，不偏侧遮人物 */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/30 to-black/50 pointer-events-none" />
            {slotCopy ? (
              // 文案居中排版：badge → 标题 → chips → CTA 纵向居中
              <div className="relative z-[2] h-full flex flex-col items-center justify-center gap-1 sm:gap-2 px-4 text-center">
                <span
                  className={cn(
                    'w-fit rounded-full px-2.5 py-0.5 text-[9px] sm:text-[10px] font-black tracking-widest ring-1 backdrop-blur',
                    slotCopy.badgeClass,
                  )}
                >
                  {overrideOf('bannerBadge') || t(slotCopy.badge)}
                </span>
                <h3 className="text-xl sm:text-3xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] leading-tight">
                  {overrideOf('bannerTitle') || t(slotCopy.title)}
                </h3>
                {slotCopy.sub ? (
                  <p className="text-[11px] sm:text-sm font-semibold text-white/85 drop-shadow">
                    {overrideOf('bannerSub') || t(slotCopy.sub)}
                  </p>
                ) : null}
                {slotCopy.chips ? (
                  <div className="flex flex-wrap justify-center gap-1.5 mt-0.5">
                    {slotCopy.chips.map((chip, chipIdx) => (
                      <span
                        key={chip}
                        className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1', slotCopy.chipClass)}
                      >
                        {chipOverrides[chipIdx] || t(chip)}
                      </span>
                    ))}
                  </div>
                ) : null}
                <span
                  className={cn(
                    'mt-1 w-fit rounded-full px-4 py-1.5 text-[11px] sm:text-sm font-bold shadow-lg active:scale-95 transition-transform',
                    slotCopy.ctaClass,
                  )}
                >
                  {overrideOf('bannerCta') || t(slotCopy.cta)} →
                </span>
              </div>
            ) : null}
            <span className="absolute top-2 right-2 z-[2] rounded-md bg-black/45 px-1.5 py-0.5 text-[9px] font-bold tracking-widest text-white/80 ring-1 ring-white/20 backdrop-blur">
              AD
            </span>
          </>
        );

        return internal ? (
          <Link
            key={ad.id}
            href={href}
            className={linkClass}
            aria-hidden={i !== active}
            tabIndex={i === active ? 0 : -1}
          >
            {inner}
          </Link>
        ) : (
          <a
            key={ad.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
            aria-hidden={i !== active}
            tabIndex={i === active ? 0 : -1}
          >
            {inner}
          </a>
        );
      })}

      {/* 轮播指示点（居中排版 → 底部居中） */}
      {count > 1 ? (
        <div className="absolute bottom-2 left-1/2 z-[3] flex -translate-x-1/2 gap-1.5">
          {ads.map((ad, i) => (
            <button
              key={ad.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Slide ${i + 1}`}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === active ? 'w-5 bg-[#ff2e88]' : 'w-1.5 bg-white/35 hover:bg-white/60',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
