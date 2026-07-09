'use client';

import Link from 'next/link';
import { useTranslation } from '@/lib/i18n/context';
import { ArrowRight, MessageCircle, Image as ImageIcon, Sparkles, Heart, Shield, Lock, Star } from 'lucide-react';

const GIRLFRIENDS = [
  { name: 'Luna', tag: 'mysterious · poetic · 24', grad: 'from-[#D05BF8] via-[#A855F7] to-[#805BF8]', initial: 'L' },
  { name: 'Sophie', tag: 'sweet · creative · 22', grad: 'from-[#FF18A0] via-[#E81B9D] to-[#8313E4]', initial: 'S' },
  { name: 'Violet', tag: 'bold · passionate · 26', grad: 'from-[#8313E4] via-[#FF18A0] to-[#D05BF8]', initial: 'V' },
  { name: 'Maya', tag: 'gentle · poetic · 23', grad: 'from-[#D05BF8] via-[#FF18A0] to-[#E81B9D]', initial: 'M' },
  { name: 'Aria', tag: 'flirty · playful · 21', grad: 'from-[#805BF8] via-[#FF18A0] to-[#D05BF8]', initial: 'A' },
  { name: 'Ruby', tag: 'dominant · spicy · 25', grad: 'from-[#FF18A0] via-[#D05BF8] to-[#8313E4]', initial: 'R' },
  { name: 'Nova', tag: 'curious · intelligent · 24', grad: 'from-[#8313E4] via-[#FF18A0] to-[#A855F7]', initial: 'N' },
  { name: 'Celeste', tag: 'elegant · sophisticated · 27', grad: 'from-[#E81B9D] via-[#8313E4] to-[#FF18A0]', initial: 'C' },
  { name: 'Iris', tag: 'mysterious · artistic · 23', grad: 'from-[#D05BF8] via-[#E81B9D] to-[#805BF8]', initial: 'I' },
  { name: 'Skye', tag: 'adventurous · bold · 22', grad: 'from-[#FF18A0] via-[#A855F7] to-[#8313E4]', initial: 'S' },
  { name: 'Jade', tag: 'gentle · caring · 24', grad: 'from-[#8313E4] via-[#D05BF8] to-[#FF18A0]', initial: 'J' },
  { name: 'Ember', tag: 'passionate · fierce · 26', grad: 'from-[#E81B9D] via-[#FF18A0] to-[#D05BF8]', initial: 'E' },
];

export default function LandingPage() {
  const { t } = useTranslation();

  const HERO_FEATURES = [
    { icon: Heart, label: t('landing.featChatTitle') },
    { icon: MessageCircle, label: t('landing.featImageTitle') },
    { icon: ImageIcon, label: t('landing.featMemoryTitle') },
    { icon: Sparkles, label: t('landing.featureNSFWTitle') },
  ];

  const PLANS = [
    { tier: t('landing.planWeekly'), price: '$6.99', perWeek: '/ week', color: 'gray', features: [t('landing.feat1')] },
    { tier: t('landing.planMonthly'), price: '$20', perWeek: '$6.2/mo', discount: '70% off', color: 'gray', features: [t('landing.feat1'), t('landing.feat2')] },
    { tier: t('landing.planYearly'), price: '$99.99', perWeek: '$8.33/mo', discount: 'Save 58%', color: 'pink', badge: t('landing.planMostPopular'), features: [t('landing.feat1'), t('landing.feat2'), t('landing.feat3'), t('landing.feat4')] },
    { tier: t('landing.planLifetime'), price: '$299', perWeek: 'one-time', discount: t('landing.planBestValue'), color: 'yellow', features: [t('landing.feat6'), t('landing.feat7'), t('landing.feat8')] },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0F0E0F] text-[#FAF7FF]" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <div className="pointer-events-none fixed inset-0" aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 70% 50% at 15% 0%, rgba(208, 91, 248, 0.18) 0%, transparent 55%),
            radial-gradient(ellipse 60% 45% at 85% 30%, rgba(255, 24, 160, 0.16) 0%, transparent 55%),
            radial-gradient(ellipse 80% 50% at 50% 100%, rgba(131, 19, 228, 0.12) 0%, transparent 60%),
            linear-gradient(180deg, #0F0E0F 0%, #04020C 60%, #0F0E0F 100%)
          `,
        }}
      />

      {/* HERO */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-12 sm:pt-24 sm:pb-16 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-1.5 backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-[#35F692] shadow-[0_0_8px_rgba(53,246,146,0.8)]" />
          <span className="text-xs font-medium tracking-wider text-white/70">{t('landing.heroEyebrow')}</span>
        </div>

        <h1 className="font-bold tracking-tight leading-[1.05] text-5xl sm:text-6xl md:text-7xl lg:text-8xl mb-6"
            style={{ fontFamily: "'Poppins', sans-serif", fontWeight: 800 }}>
          <span className="block text-white">{t('landing.heroLine1') || 'Your Fantasy.'}</span>
          <span className="block bg-gradient-to-br from-[#E081C3] via-[#FF18A0] to-[#D05BF8] bg-clip-text text-transparent">
            {t('landing.heroLine2') || 'Your Rules.'}
          </span>
          <span className="block text-white">{t('landing.heroLine3') || 'No Limits.'}</span>
        </h1>

        <p className="mx-auto mb-8 max-w-2xl text-base sm:text-lg text-white/70 leading-relaxed">
          {t('landing.heroSubtitle')}
        </p>

        <div className="mb-10 flex flex-wrap items-center justify-center gap-2">
          {HERO_FEATURES.map((f) => (
            <div key={f.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] px-3.5 py-1.5 backdrop-blur-xl">
              <f.icon className="h-3.5 w-3.5 text-[#FF18A0]" />
              <span className="text-xs font-medium text-white/90">{f.label}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/register">
            <button
              className="group relative h-14 overflow-hidden rounded-full px-9 text-base font-semibold text-white transition-all hover:scale-[1.03] hover:shadow-[0_0_24px_rgba(255,24,160,0.55)]"
              style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}
            >
              <span className="relative z-10 flex items-center gap-2">
                {t('landing.ctaPrimary')}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </Link>
          <Link href="/pricing">
            <button className="h-14 rounded-full border border-white/[0.12] bg-white/[0.04] px-9 text-base font-medium text-white backdrop-blur-2xl transition-all hover:bg-white/[0.08]">
              {t('landing.ctaSecondary')}
            </button>
          </Link>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-white/50">
          <div className="flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" />
            {t('landing.trustPrivacy')}
          </div>
          <div className="flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            {t('landing.trustData')}
          </div>
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            {t('landing.trustRating')}
          </div>
        </div>
      </section>

      {/* COMPANIONS GRID */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              {(() => {
                const full = t('landing.companionsTitle');
                const parts = full.split(/<0>(.*?)<\/0>/);
                return (
                  <>
                    {parts[0]}
                    <span className="bg-gradient-to-r from-[#D05BF8] to-[#FF18A0] bg-clip-text text-transparent">{parts[1]}</span>
                    {parts[2]}
                  </>
                );
              })()}
            </h2>
            <p className="mt-1 text-sm text-white/60">{t('landing.companionsSubtitle')}</p>
          </div>
          <Link href="/explore">
            <button className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.12] bg-white/[0.04] px-4 text-sm font-medium text-white hover:bg-white/[0.08] transition-all">
              {t('landing.viewAll')}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
          {GIRLFRIENDS.map((g, i) => (
            <Link href="/register" key={g.name}>
              <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0B0B0B] transition-all hover:border-[#FF18A0]/40 hover:shadow-[0_8px_24px_rgba(255,24,160,0.2)] hover:-translate-y-1">
                <div className="relative aspect-[3/4] overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-br ${g.grad}`} />
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.25),transparent_60%)]" />
                  <div className="absolute inset-0 flex items-center justify-center font-bold text-7xl sm:text-8xl text-white/90 group-hover:scale-110 transition-transform duration-500">
                    {g.initial}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 h-1/3"
                       style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(11,11,11,0.95) 100%)' }} />
                  {i < 3 && (
                    <div className="absolute top-2 left-2 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#0F0E0F]"
                         style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}>
                      {t('landing.popularTag')}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                  <p className="text-[10px] text-white/50 truncate mt-0.5">{g.tag}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FEATURE GRID */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: MessageCircle, title: t('landing.featChatTitle'), desc: t('landing.featChatDesc'), grad: 'from-[#D05BF8]/20 to-[#805BF8]/5' },
            { icon: ImageIcon, title: t('landing.featImageTitle'), desc: t('landing.featImageDesc'), grad: 'from-[#FF18A0]/20 to-[#E81B9D]/5' },
            { icon: Sparkles, title: t('landing.featMemoryTitle'), desc: t('landing.featMemoryDesc'), grad: 'from-[#8313E4]/20 to-[#D05BF8]/5' },
          ].map((f) => (
            <div
              key={f.title}
              className={`group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br ${f.grad} backdrop-blur-2xl p-6 transition-all hover:border-white/[0.15] hover:shadow-[0_8px_24px_rgba(255,24,160,0.10)]`}
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#D05BF8] to-[#FF18A0]">
                <f.icon className="h-5 w-5 text-white" />
              </div>
              <h3 className="font-semibold text-lg text-white mb-1">{f.title}</h3>
              <p className="text-sm text-white/60">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center mb-10">
          <h2 className="font-bold text-4xl sm:text-5xl tracking-tight text-white mb-3">
            {(() => {
              const full = t('landing.pricingTitle');
              const parts = full.split(/<0>(.*?)<\/0>/);
              return (
                <>
                  {parts[0]}
                  <span className="bg-gradient-to-r from-[#D05BF8] to-[#FF18A0] bg-clip-text text-transparent">{parts[1]}</span>
                  {parts[2]}
                </>
              );
            })()}
          </h2>
          <p className="text-base text-white/60">{t('landing.pricingSubtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`group relative overflow-hidden rounded-2xl p-6 transition-all hover:-translate-y-1 ${
                plan.color === 'pink'
                  ? 'border-2 border-transparent bg-[#0B0B0B]'
                  : 'border border-white/[0.08] bg-[#0B0B0B] hover:border-white/[0.15]'
              }`}
              style={
                plan.color === 'pink'
                  ? {
                      backgroundImage:
                        'linear-gradient(#0B0B0B, #0B0B0B), linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)',
                      backgroundOrigin: 'border-box',
                      backgroundClip: 'padding-box, border-box',
                      boxShadow: '0 0 32px rgba(255,24,160,0.25)',
                    }
                  : undefined
              }
            >
              {plan.badge && (
                <div className="absolute -top-2 right-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white"
                     style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}>
                  {plan.badge}
                </div>
              )}
              <h3 className="text-sm font-bold uppercase tracking-wider text-white/60 mb-2">{plan.tier}</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                <span className="text-xs text-white/50">{plan.perWeek}</span>
              </div>
              {plan.discount && (
                <span className="inline-block mt-1 mb-4 text-[10px] font-bold uppercase rounded-full bg-[#FF18A0]/20 text-[#FF18A0] px-2 py-0.5">
                  {plan.discount}
                </span>
              )}
              <ul className="space-y-2 mt-4">
                {plan.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-sm text-white/70">
                    <span className="mt-1 h-1 w-1 rounded-full bg-[#FF18A0] shrink-0" />
                    {feat}
                  </li>
                ))}
              </ul>
              <button
                className={`mt-6 w-full h-11 rounded-full font-semibold text-sm transition-all ${
                  plan.color === 'pink'
                    ? 'text-white hover:scale-[1.02] hover:shadow-[0_0_24px_rgba(255,24,160,0.55)]'
                    : 'border border-white/[0.12] bg-white/[0.04] text-white hover:bg-white/[0.08]'
                }`}
                style={
                  plan.color === 'pink'
                    ? { background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }
                    : undefined
                }
              >
                {t('landing.ctaPlan')} {plan.tier}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-20">
        <h2 className="text-center font-bold text-4xl text-white mb-8">{t('landing.faqTitle')}</h2>
        <div className="space-y-3">
          {[
            { q: t('landing.faq1Q'), a: t('landing.faq1A') },
            { q: t('landing.faq2Q'), a: t('landing.faq2A') },
            { q: t('landing.faq3Q'), a: t('landing.faq3A') },
          ].map((item) => (
            <details key={item.q} className="group rounded-2xl border border-white/[0.08] bg-[#0B0B0B] p-5 hover:border-white/[0.15] transition-all">
              <summary className="cursor-pointer font-semibold text-white flex items-center justify-between">
                {item.q}
                <span className="text-[#FF18A0] group-open:rotate-45 transition-transform text-xl leading-none">+</span>
              </summary>
              <p className="mt-3 text-sm text-white/60 leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.06] py-8 px-4 text-center">
        <p className="text-xs text-white/30">{t('landing.footerCopy')}</p>
      </footer>
    </main>
  );
}