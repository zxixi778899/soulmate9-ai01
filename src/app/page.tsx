'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import { Heart, Sparkles, MessageCircle, Loader2, AlertCircle, Menu, Star, TrendingUp, Flame, ChevronRight, Plus } from 'lucide-react';
import { AgeVerification } from '@/components/AgeVerification';
import { useAuth } from '@/components/AuthProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import DynamicNav from '@/components/page-builder/DynamicNav';
import { useTranslation } from '@/lib/i18n/context';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

// 4 个角色 — 与 Supabase Storage portraits/characters/ 下保持一致
const CHARACTERS = [
  { slug: 'luna', name: 'Luna', age: 24, tagline: 'Moonlit conversations, soft as silk.', accent: '#A78BFA', chipColor: 'rgba(167,139,250,0.85)' },
  { slug: 'ruby', name: 'Ruby', age: 22, tagline: 'Tokyo neon never sleeps. Neither do I.', accent: '#FF2D78', chipColor: 'rgba(255,45,120,0.85)' },
  { slug: 'summer', name: 'Summer', age: 25, tagline: 'Golden hour, all day, every day.', accent: '#F59E0B', chipColor: 'rgba(245,158,11,0.85)' },
  { slug: 'scarlet', name: 'Scarlet', age: 23, tagline: 'Tradition wears a crimson dress.', accent: '#EF4444', chipColor: 'rgba(239,68,68,0.85)' },
];

const SUPABASE_BASE = 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits';

interface PublicGirlfriend {
  id: string;
  name: string;
  age: number;
  slug: string;
  tags: string[];
  short_description: string;
  portrait_url: string | null;
  avatar_url?: string | null;
  image_url?: string | null;
}

export default function HeroLandingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [girlfriends, setGirlfriends] = useState<PublicGirlfriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // hero 当前选中角色
  const [activeIdx, setActiveIdx] = useState(0);
  const active = CHARACTERS[activeIdx];

  // 加载女友列表
  useEffect(() => {
    const fetchGirlfriends = async () => {
      try {
        const res = await fetch('/api/girlfriends/public');
        const data = await res.json();
        if (data.girlfriends) setGirlfriends(data.girlfriends);
      } catch {
        setError(t('common.error'));
      } finally {
        setLoading(false);
      }
    };
    fetchGirlfriends();
  }, []);

  // 自动轮转（6 秒一档；hover/click 卡片会重置）
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % CHARACTERS.length), 6000);
    return () => clearInterval(id);
  }, [paused]);

  const handleGetStarted = () => (user ? router.push('/gallery') : router.push('/register'));
  const handleCardClick = (slug: string) => router.push(`/girlfriend/${slug}`);

  return (
    <>
      <AgeVerification />
      <div className="min-h-screen text-[#F0F0F5] bg-[#07070F] overflow-x-hidden">
        {/* ===== NAV ===== */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#07070F]/70 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2D78] to-[#d946ef] flex items-center justify-center shadow-[0_0_15px_rgba(255,45,120,0.3)]">
                <Heart className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">{APP_NAME}</span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <Link href="/" className="px-3 py-2 text-sm rounded-lg text-[#FF2D78] bg-[#FF2D78]/10">Home</Link>
              <Link href="/pricing" className="px-3 py-2 text-sm rounded-lg text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">Pricing</Link>
              <Link href="/explore" className="px-3 py-2 text-sm rounded-lg text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">Explore</Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-[#8B8BA3]"><Menu className="w-5 h-5" /></Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px]">
                    <div className="flex flex-col gap-2 mt-8">
                      <Link href="/" className="px-4 py-3 text-sm rounded-lg text-[#FF2D78] bg-[#FF2D78]/10">Home</Link>
                      <Link href="/pricing" className="px-4 py-3 text-sm rounded-lg text-[#8B8BA3]">Pricing</Link>
                      <Link href="/explore" className="px-4 py-3 text-sm rounded-lg text-[#8B8BA3]">Explore</Link>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              <LanguageSwitcher variant="compact" />
              {!user && (
                <Button variant="ghost" className="text-sm text-[#8B8BA3] hover:text-[#FF6BA6]" onClick={() => router.push('/login')}>
                  {t('hero.signIn')}
                </Button>
              )}
              <Button onClick={handleGetStarted} variant="glow" className="text-sm font-medium h-9 px-5 rounded-lg">
                {t('hero.getStarted')}
              </Button>
            </div>
          </div>
        </header>

        {/* ===== HERO — 分层 ===== */}
        <section
          className="relative w-full h-[100vh] min-h-[720px] overflow-hidden"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* 背景层 — 4 张图交叉淡入淡出 */}
          {CHARACTERS.map((c, i) => (
            <div
              key={c.slug}
              className="absolute inset-0 transition-opacity duration-[1800ms] ease-in-out"
              style={{
                opacity: i === activeIdx ? 1 : 0,
                zIndex: 1,
              }}
            >
              <Image
                src={`${SUPABASE_BASE}/portraits/${c.slug}_1783036793301.png`}
                alt={c.name}
                fill
                priority={i === 0}
                className="object-cover scale-110 animate-[heroZoom_18s_ease-in-out_infinite_alternate]"
                sizes="100vw"
                unoptimized
              />
            </div>
          ))}

          {/* 背景渐变遮罩 — 让前景更突出、文字更清晰 */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background:
                'linear-gradient(180deg, rgba(7,7,15,0.30) 0%, rgba(7,7,15,0.10) 30%, rgba(7,7,15,0.55) 70%, rgba(7,7,15,0.95) 100%), radial-gradient(circle at 30% 50%, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.55) 70%)',
            }}
          />

          {/* 背景氛围 — 主角色 accent */}
          <div
            key={`glow-${active.slug}`}
            className="absolute inset-0 z-[3] animate-[ambientShift_1800ms_ease-out] pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 80% 60% at 50% 40%, ${active.accent}33 0%, transparent 60%)`,
            }}
          />

          {/* ===== 顶部状态条 ===== */}
          <div className="absolute top-24 left-0 right-0 z-10 flex justify-center pointer-events-none">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/30 border border-white/[0.12] backdrop-blur-md text-xs font-mono-pretty tracking-wider text-[#FF6BA6] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] animate-pulse" /> Live · 18+ Only
            </div>
          </div>

          {/* ===== 中部人物立绘（透明 PNG）====== */}
          <div className="absolute inset-0 z-[4] flex items-end justify-center pointer-events-none">
            {CHARACTERS.map((c, i) => (
              <div
                key={c.slug}
                className="absolute bottom-0 left-1/2 -translate-x-1/2 transition-all duration-[1200ms] ease-out"
                style={{
                  opacity: i === activeIdx ? 1 : 0,
                  transform: `translate(-50%, ${i === activeIdx ? '0' : '40px'}) scale(${i === activeIdx ? 1 : 0.96})`,
                  pointerEvents: i === activeIdx ? 'auto' : 'none',
                  width: 'min(640px, 60vw)',
                  height: 'min(820px, 78vh)',
                  filter: i === activeIdx ? 'drop-shadow(0 30px 60px rgba(0,0,0,0.5))' : 'none',
                }}
              >
                <Image
                  src={`${SUPABASE_BASE}/characters/${c.slug}.png`}
                  alt={c.name}
                  fill
                  priority={i === 0}
                  className="object-contain object-bottom animate-[heroFloat_8s_ease-in-out_infinite_alternate]"
                  sizes="60vw"
                  unoptimized
                />
              </div>
            ))}
          </div>

          {/* ===== 左侧：动态字体 ===== */}
          <div className="absolute top-[24%] left-[6%] md:left-[10%] z-[5] max-w-[480px] pointer-events-none">
            <div
              key={`name-${active.slug}`}
              className="font-display text-6xl md:text-7xl lg:text-8xl font-bold italic tracking-tight animate-[textRise_1000ms_ease-out]"
              style={{
                background: `linear-gradient(180deg, #fff 0%, ${active.accent} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                lineHeight: 0.95,
              }}
            >
              {active.name}
            </div>
            <div className="mt-4 h-[2px] w-32 bg-gradient-to-r from-transparent via-[#FF2D78] to-transparent animate-[lineExpand_1000ms_ease-out]" />
            <div
              key={`tagline-${active.slug}`}
              className="mt-6 font-heading text-base md:text-lg text-white/80 italic tracking-wide animate-[textFade_1000ms_ease-out_400ms_both]"
            >
              "{active.tagline}"
            </div>
          </div>

          {/* ===== 右下：CTA ===== */}
          <div className="absolute bottom-10 right-6 md:right-12 z-[6] flex flex-col items-end gap-3">
            <Button
              onClick={() => handleCardClick(active.slug)}
              variant="glow"
              size="xl"
              className="font-heading uppercase tracking-wider shadow-[0_0_30px_rgba(255,45,120,0.4)]"
            >
              <MessageCircle className="w-4 h-4 mr-2" /> Chat with {active.name}
            </Button>
            <div className="text-xs text-white/50 font-mono-pretty tracking-wider">
              {active.name}, {active.age}
            </div>
          </div>

          {/* ===== 轮转指示器（左侧竖直） ===== */}
          <div className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-[6] flex flex-col gap-3">
            {CHARACTERS.map((c, i) => (
              <button
                key={c.slug}
                onClick={() => setActiveIdx(i)}
                className="group flex items-center gap-2 cursor-pointer"
                aria-label={c.name}
              >
                <span
                  className="block transition-all duration-300 rounded-full"
                  style={{
                    width: i === activeIdx ? 28 : 14,
                    height: 2,
                    background: i === activeIdx ? c.accent : 'rgba(255,255,255,0.25)',
                    boxShadow: i === activeIdx ? `0 0 12px ${c.accent}` : 'none',
                  }}
                />
                <span
                  className="text-xs font-heading tracking-wider transition-all duration-300"
                  style={{
                    color: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                    opacity: i === activeIdx ? 1 : 0,
                    transform: i === activeIdx ? 'translateX(0)' : 'translateX(-8px)',
                  }}
                >
                  {c.name.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ===== 女友卡 — 彩色 mood 色块 ===== */}
        <section className="relative bg-[#07070F] py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-end justify-between mb-8">
              <div>
                <div className="text-xs font-mono-pretty tracking-[0.2em] text-[#FF6BA6] uppercase">Meet Your Match</div>
                <h2 className="font-display text-4xl md:text-5xl font-bold mt-2 tracking-tight">
                  Choose Your <span className="italic bg-gradient-to-r from-[#FF2D78] to-[#d946ef] bg-clip-text text-transparent">Companion</span>
                </h2>
              </div>
              <div className="hidden md:flex items-center gap-2 text-xs text-white/40 font-mono-pretty">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] animate-pulse" />
                {CHARACTERS.length} active models
              </div>
            </div>

            {/* 4 张彩色 mood 色块卡 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {CHARACTERS.map((c, i) => (
                <button
                  key={c.slug}
                  onClick={() => {
                    setActiveIdx(i);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="group relative aspect-[3/4] rounded-2xl overflow-hidden border border-white/[0.08] hover:border-white/[0.20] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
                  style={{
                    background: `linear-gradient(160deg, ${c.accent} 0%, ${c.accent}88 40%, #1a1a2e 100%)`,
                  }}
                >
                  {/* 透明人物立绘 */}
                  <div className="absolute inset-0 transition-transform duration-700 group-hover:scale-110">
                    <Image
                      src={`${SUPABASE_BASE}/characters/${c.slug}.png`}
                      alt={c.name}
                      fill
                      className="object-contain object-bottom"
                      sizes="(max-width: 1024px) 50vw, 25vw"
                      unoptimized
                    />
                  </div>

                  {/* 顶部 Live dot */}
                  <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 bg-black/40 backdrop-blur-md border border-white/20 rounded-full px-2 py-0.5 text-[10px] font-mono-pretty text-white tracking-wider uppercase">
                    <span className="w-1 h-1 rounded-full bg-[#FF2D78] animate-pulse" />
                    Live
                  </div>

                  {/* 顶部右侧 accent */}
                  <div className="absolute top-3 right-3 opacity-50 group-hover:opacity-100 transition-opacity">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>

                  {/* 底部信息区 */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-12 pb-3 px-3">
                    <div className="font-display text-2xl font-bold italic text-white tracking-tight leading-none">
                      {c.name}
                    </div>
                    <div className="text-[10px] text-white/60 font-mono-pretty mt-1 tracking-wider">
                      {c.age} · {c.tagline.split(',')[0]}
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1 text-[10px] font-heading uppercase tracking-wider text-white/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      Chat <ChevronRight className="w-3 h-3" />
                    </div>
                  </div>

                  {/* 悬浮 accent ring */}
                  <div
                    className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ boxShadow: `inset 0 0 0 1px ${c.accent}55, 0 0 30px ${c.accent}22` }}
                  />
                </button>
              ))}
            </div>

            {/* 真实数据 fallback —— 如果后端有更多角色，水平滚动展示 */}
            {!loading && girlfriends.length > 4 && (
              <div className="mt-12">
                <div className="text-xs font-mono-pretty tracking-[0.2em] text-white/40 uppercase mb-4">More Companions</div>
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {girlfriends.slice(4).map((gf) => (
                    <div
                      key={gf.id}
                      onClick={() => handleCardClick(gf.slug)}
                      className="flex-shrink-0 w-40 aspect-[3/4] rounded-xl overflow-hidden bg-white/[0.04] border border-white/[0.08] hover:border-[#FF2D78]/40 cursor-pointer transition-all"
                    >
                      {gf.image_url ? (
                        <Image src={gf.image_url} alt={gf.name} fill className="object-cover" sizes="160px" unoptimized />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Heart className="w-6 h-6 text-[#FF2D78]/40" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ===== Stats Section ===== */}
        <section className="border-y border-white/[0.06] bg-white/[0.02] backdrop-blur-xl py-16 my-8">
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-8 text-center">
            {[
              { n: '20M+', l: 'Monthly Messages' },
              { n: '350+', l: 'AI Models' },
              { n: '3M+', l: 'Monthly Visits' },
            ].map((s) => (
              <div key={s.l}>
                <div className="font-mono-pretty text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#FF2D78] to-[#d946ef] bg-clip-text text-transparent">{s.n}</div>
                <div className="text-xs text-[#8B8BA3] mt-2 font-heading tracking-wider uppercase">{s.l}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ===== Footer ===== */}
        <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-[#8B8BA3]/60">
          <div className="max-w-4xl mx-auto px-6">
            <p>© 2026 {APP_NAME}. All rights reserved.</p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <Link href="/terms" className="hover:text-[#F0F0F5] transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-[#F0F0F5] transition-colors">Privacy</Link>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}