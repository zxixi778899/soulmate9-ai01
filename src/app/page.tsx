'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import { authedFetch } from '@/lib/supabase';
import { Heart, Sparkles, MessageCircle, Loader2, AlertCircle, Users, MessageSquare, Activity, UserPlus, Menu, Flame, TrendingUp, Star } from 'lucide-react';
import { AgeVerification } from '@/components/AgeVerification';
import { useAuth } from '@/components/AuthProvider';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import DynamicNav from '@/components/page-builder/DynamicNav';
import { useTranslation } from '@/lib/i18n/context';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { LandingSections } from '@/components/landing/LandingSections';

// Hero 动态副标题轮播 — 暧昧诱惑心智句
const HERO_TAGLINES = [
  'Uncensored Desires.',
  'No Judgment. Just Pleasure.',
  'She\'s Waiting for You.',
  'Unleash Your Fantasies.',
];

// Sort Tabs
const SORT_TABS: Array<{ value: string; label: string; icon: typeof Flame }> = [
  { value: 'Popular', label: 'Popular', icon: Star },
  { value: 'Trending', label: 'Trending', icon: TrendingUp },
  { value: 'New', label: 'New', icon: Sparkles },
  { value: 'Fetish', label: 'Hot & Spicy', icon: Flame },
];

// 基于 id 哈希稳定生成 Live 状态
function isGirlLive(id: string): boolean {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 3 === 0;
}

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
  personality: string;
  character_card: any;
}

const ALL_TAGS = ['Popular', 'Trending', '18+', 'Teen', 'MILF', 'Asian', 'Goth', 'Blonde', 'Ebony', 'Cosplay', 'Romantic', 'Caring'];

export default function PublicLandingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [girlfriends, setGirlfriends] = useState<PublicGirlfriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTag, setActiveTag] = useState('Popular');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(179);
  const [heroIdx, setHeroIdx] = useState(0);

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

  useEffect(() => {
    const timer = setInterval(() => setCountdown((c) => c <= 0 ? 179 : c - 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setHeroIdx((i) => (i + 1) % HERO_TAGLINES.length), 2400);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (activeTag === 'Popular' || activeTag === 'Trending') return girlfriends;
    if (activeTag === 'New') {
      return [...girlfriends].reverse();
    }
    if (activeTag === 'Fetish') {
      const fetishKeywords = ['MILF', 'Teen', 'Cosplay', 'Goth', 'Submissive', 'Busty'];
      return girlfriends.filter((gf) => gf.tags?.some((t) => fetishKeywords.includes(t)));
    }
    return girlfriends.filter((gf) => gf.tags?.includes(activeTag));
  }, [girlfriends, activeTag]);

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const handleCardClick = (slug: string) => {
    router.push(`/girlfriend/${slug}`);
  };

  const handleGetStarted = () => {
    if (user) {
      router.push('/gallery');
    } else {
      router.push('/register');
    }
  };

  const handleAddFriend = async (slug: string, name: string) => {
    if (!user) { router.push('/login'); return; }
    try {
      const res = await authedFetch('/api/girlfriends/add-from-public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      if (data.id) {
        toast.success(`${name} added to your collection!`);
      } else {
        toast.error(data.error || 'Failed to add friend');
      }
    } catch {
      toast.error('Failed to add friend. Please try again.');
    }
  };

  return (
    <>
      <AgeVerification />
      <div className="min-h-screen text-[#F0F0F5] pb-20 md:pb-0">
        {/* Navbar — glass bar */}
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#07070F]/70 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#FF2D78] to-[#d946ef] flex items-center justify-center shadow-[0_0_15px_rgba(255,45,120,0.3)]">
                <Heart className="w-4 h-4 text-white fill-white" />
              </div>
              <span className="font-semibold text-lg tracking-tight">{APP_NAME}</span>
            </div>
            <div className="hidden md:flex items-center gap-1 mx-auto">
              <DynamicNav />
              {!user && (
                <>
                  <Link href="/" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#FF2D78] bg-[#FF2D78]/10">
                    Home
                  </Link>
                  <Link href="/login" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    Explore
                  </Link>
                  <Link href="/pricing" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    Pricing
                  </Link>
                </>
              )}
              {user && (
                <>
                  <Link href="/gallery" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    My Girls
                  </Link>
                  <Link href="/messages" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    Messages
                  </Link>
                  <Link href="/shop" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    Shop
                  </Link>
                  <Link href="/profile" className="px-3 py-2 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.06]">
                    Profile
                  </Link>
                </>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Mobile Menu Trigger */}
              <div className="md:hidden">
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-[#8B8BA3]">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px]">
                    <div className="flex flex-col gap-2 mt-8">
                      <DynamicNav />
                      {!user && (
                        <>
                          <Link href="/" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#FF2D78] bg-[#FF2D78]/10">
                            Home
                          </Link>
                          <Link href="/login" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            Explore
                          </Link>
                          <Link href="/pricing" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            Pricing
                          </Link>
                        </>
                      )}
                      {user && (
                        <>
                          <Link href="/gallery" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            My Girls
                          </Link>
                          <Link href="/messages" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            Messages
                          </Link>
                          <Link href="/shop" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            Shop
                          </Link>
                          <Link href="/profile" className="px-4 py-3 text-sm rounded-lg transition-colors text-[#8B8BA3] hover:text-[#F0F0F5]">
                            Profile
                          </Link>
                        </>
                      )}
                      <div className="border-t border-white/[0.08] my-2 pt-2">
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-sm text-[#8B8BA3]"
                          onClick={() => router.push('/login')}
                        >
                          {t('hero.signIn')}
                        </Button>
                        <Button
                          onClick={handleGetStarted}
                          variant="glow"
                          className="w-full mt-1 text-sm font-medium h-9 px-5 rounded-lg"
                        >
                          {t('hero.getStarted')}
                        </Button>
                        <div className="mt-4">
                          <LanguageSwitcher variant="compact" />
                        </div>
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
              <LanguageSwitcher variant="compact" />
              <Button
                variant="ghost"
                className="text-sm text-[#8B8BA3] hover:text-[#FF6BA6]"
                onClick={() => router.push('/login')}
              >
                {t('hero.signIn')}
              </Button>
              <Button
                onClick={handleGetStarted}
                variant="glow"
                className="text-sm font-medium h-9 px-5 rounded-lg"
              >
                {t('hero.getStarted')}
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section — dark starry + pink glow + H5 dynamic entry */}
        <section className="pt-32 pb-20 px-6 relative overflow-hidden">
          <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#FF2D78]/8 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-[#8b5cf6]/6 rounded-full blur-3xl pointer-events-none" />
          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="h5-enter h5-enter-1 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.10] backdrop-blur-sm text-xs font-mono-pretty tracking-wider text-[#FF6BA6] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] h5-halo" /> Live · 18+ Only
            </div>
            <h1 className="h5-enter h5-enter-2 font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.02] mt-6">
              <span className="block text-white/95">{t('landing.heroSection').split(' ').slice(0, -2).join(' ')}</span>
              <span className="block gradient-text italic">{t('landing.heroSection').split(' ').slice(-2).join(' ')}</span>
            </h1>
            {/* Dynamic tagline carousel — 暧昧诱惑心智句 */}
            <div className="h5-enter h5-enter-3 mt-8 h-10 relative flex items-center justify-center gap-2 text-xl md:text-2xl">
              {HERO_TAGLINES.map((line, i) => (
                <span
                  key={line}
                  className={`absolute inset-0 flex items-center justify-center transition-all duration-700 font-heading ${
                    i === heroIdx
                      ? 'opacity-100 translate-y-0 bg-gradient-to-r from-[#FF2D78] via-[#d946ef] to-[#8b5cf6] bg-clip-text text-transparent font-semibold'
                      : 'opacity-0 translate-y-3 pointer-events-none'
                  }`}
                >
                  {line}
                </span>
              ))}
            </div>
            <p className="h5-enter h5-enter-4 mt-6 text-base md:text-lg text-[#8B8BA3] max-w-2xl mx-auto leading-relaxed font-sans">
              {t('landing.heroDesc')}
            </p>
            <div className="h5-enter h5-enter-5 mt-10 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
              <Button
                onClick={() => document.getElementById('girl-grid')?.scrollIntoView({ behavior: 'smooth' })}
                variant="glow"
                size="xl"
                className="h5-shine h5-halo font-heading uppercase tracking-wider"
              >
                {t('hero.cta')}
              </Button>
              <Button
                onClick={() => document.getElementById('girl-grid')?.scrollIntoView({ behavior: 'smooth' })}
                variant="outline"
                size="xl"
                className="font-heading uppercase tracking-wider"
              >
                {t('landing.browseGirls')}
              </Button>
            </div>
            <div className="h5-enter h5-enter-6 mt-8 flex items-center justify-center gap-6 text-xs text-[#8B8BA3]/70 font-mono-pretty tracking-wide">
              <span className="flex items-center gap-1.5"><MessageSquare className="w-3 h-3" /> 20M+ Messages</span>
              <span className="flex items-center gap-1.5"><Users className="w-3 h-3" /> 350+ Models</span>
              <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> 99.9% Uptime</span>
            </div>
          </div>
        </section>

        {/* Filter Bar — glass */}
        <div className="sticky top-16 z-40 border-y border-white/[0.06] bg-[#07070F]/70 backdrop-blur-2xl">
          <div className="max-w-7xl mx-auto px-6 py-3 space-y-2">
            {/* Sort Tabs — glass buttons + pink highlight */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {SORT_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTag === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTag(tab.value)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                      active
                        ? 'bg-[#FF2D78] text-white shadow-[0_0_15px_rgba(255,45,120,0.3)]'
                        : 'bg-white/[0.04] text-[#8B8BA3] hover:text-[#F0F0F5] hover:bg-white/[0.08] border border-white/[0.06] backdrop-blur-xl'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
            {/* Sub-tag filter chips */}
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {ALL_TAGS.filter((t) => t !== 'Popular' && t !== 'Trending').map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(tag)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                    activeTag === tag
                      ? 'bg-[#FF2D78]/20 text-[#FF2D78] ring-1 ring-[#FF2D78]/40'
                      : 'bg-white/[0.03] text-[#8B8BA3]/70 hover:text-[#F0F0F5] hover:bg-white/[0.06] border border-white/[0.06]'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Girlfriend Grid */}
        <section id="girl-grid" className="max-w-7xl mx-auto px-6 py-10">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 className="w-8 h-8 text-[#FF2D78] animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-32 text-[#8B8BA3] gap-2">
              <AlertCircle className="w-5 h-5" /> {error}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {filtered.map((gf, idx) => (
                  <div
                    key={gf.id}
                    onMouseEnter={() => setHoveredCard(gf.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                    onClick={() => setSelectedCard(selectedCard === gf.id ? null : gf.id)}
                    style={{ animationDelay: `${(idx % 8) * 0.06}s` }}
                    className={`h5-rise h5-card-lift group bg-white/[0.03] backdrop-blur-xl border rounded-xl overflow-hidden cursor-pointer ${
                      selectedCard === gf.id
                        ? 'border-[#FF2D78]/50 shadow-[0_0_25px_rgba(255,45,120,0.15)] ring-1 ring-[#FF2D78]/30'
                        : 'border-white/[0.06]'
                    }`}
                  >
                    {/* Portrait area — 3:4 aspect */}
                    <div
                      onClick={() => handleCardClick(gf.slug)}
                      className="relative aspect-[3/4] bg-gradient-to-b from-white/[0.05] to-[#FF2D78]/5 overflow-hidden"
                    >
                      {(() => {
                        const imgUrl = gf.image_url || gf.portrait_url || gf.avatar_url;
                        return imgUrl ? (
                          <Image
                            src={imgUrl}
                            alt={gf.name}
                            fill
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                            unoptimized={imgUrl.startsWith('data:')}
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#FF2D78]/20 to-[#d946ef]/20 flex items-center justify-center">
                              <Heart className="w-8 h-8 text-[#FF2D78]/40" />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Frosted glass bottom panel */}
                      <div className="absolute inset-x-0 bottom-0 backdrop-blur-xl bg-black/30 border-t border-white/[0.10]">
                        {/* Name & tags row */}
                        <div className="px-3 pt-2.5 pb-1.5">
                          <div className="flex items-center justify-between">
                            <h3 className="font-heading font-semibold text-sm text-white tracking-tight">
                              {gf.name}, <span className="font-mono-pretty font-normal text-white/60">{gf.age}</span>
                            </h3>
                            {/* Chat button — glass + pink glow */}
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCardClick(gf.slug); }}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FF2D78]/20 border border-[#FF2D78]/30 text-[#FF2D78] text-[11px] font-medium hover:bg-[#FF2D78] hover:text-white hover:shadow-[0_0_15px_rgba(255,45,120,0.4)] transition-all duration-200 backdrop-blur-sm"
                            >
                              <MessageCircle className="w-3 h-3" /> Chat
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {gf.tags?.slice(0, 3).map((tag: string) => (
                              <span
                                key={tag}
                                className="text-[10px] bg-white/[0.08] text-[#8B8BA3] rounded-full px-2 py-0.5 backdrop-blur-sm border border-white/[0.06]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Action bar — hover / selected */}
                        <div className={`px-3 pb-2.5 pt-0 transition-all duration-200 ${
                          hoveredCard === gf.id || selectedCard === gf.id ? 'opacity-100 max-h-8' : 'opacity-0 max-h-0'
                        } overflow-hidden`}>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddFriend(gf.slug, gf.name); }}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-white/80 text-[11px] font-medium hover:bg-[#FF2D78]/10 hover:text-[#FF2D78] hover:border-[#FF2D78]/30 transition-all duration-200"
                            >
                              <UserPlus className="w-3 h-3" /> Add to My Girls
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Live indicator */}
                      {isGirlLive(gf.id) && (
                        <span className="absolute top-3 right-3 flex items-center gap-1 bg-[#FF2D78]/20 text-[#FF2D78] text-[10px] px-2 py-0.5 rounded-full font-bold backdrop-blur-sm ring-1 ring-[#FF2D78]/40">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] animate-pulse" />
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {filtered.length === 0 && (
                <div className="text-center py-20 text-[#8B8BA3]">
                  {t('common.noResults')}
                </div>
              )}
            </>
          )}
        </section>

        {/* Stats Section — glass card */}
        <section className="h5-reveal border-y border-white/[0.06] bg-white/[0.02] backdrop-blur-xl py-16 my-8">
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-3 gap-8 text-center">
            <div>
              <div className="font-mono-pretty text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#FF2D78] to-[#d946ef] bg-clip-text text-transparent">20M+</div>
              <div className="text-xs text-[#8B8BA3] mt-2 font-heading tracking-wider uppercase">Monthly Messages</div>
            </div>
            <div>
              <div className="font-mono-pretty text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#FF2D78] to-[#d946ef] bg-clip-text text-transparent">350+</div>
              <div className="text-xs text-[#8B8BA3] mt-2 font-heading tracking-wider uppercase">AI Models</div>
            </div>
            <div>
              <div className="font-mono-pretty text-3xl md:text-4xl font-bold bg-gradient-to-r from-[#FF2D78] to-[#d946ef] bg-clip-text text-transparent">3M+</div>
              <div className="text-xs text-[#8B8BA3] mt-2 font-heading tracking-wider uppercase">Monthly Visits</div>
            </div>
          </div>
        </section>

        {/* SEO + trust + process blocks */}
        <LandingSections />

        {/* CTA Section — pink glow + countdown */}
        <section className="h5-reveal py-24 px-6 text-center">
          <div className="max-w-2xl mx-auto">
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight gradient-text italic">Start Your Story</h2>
            <p className="mt-6 text-[#8B8BA3] text-base md:text-lg">
              Meet your perfect AI companion today. No credit card required.
            </p>
            {/* Countdown badge — glass + amber */}
            <div className="mt-6 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-sm backdrop-blur-xl">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-amber-400 font-medium">70% Off</span>
              <span className="text-[#8B8BA3]">•</span>
              <span className="text-[#F0F0F5] font-mono">{formatCountdown(countdown)}</span>
            </div>
            <Button
              onClick={handleGetStarted}
              variant="glow"
              size="xl"
              className="mt-8 pulse-glow"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Claim 70% Off
            </Button>
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
              {[
                { icon: MessageCircle, label: 'Unlimited Chatting' },
                { icon: Heart, label: 'NSFW Mode' },
                { icon: MessageSquare, label: 'Voice & Video' },
                { icon: Users, label: '350+ Models' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-[#8B8BA3]">
                  <item.icon className="w-4 h-4 text-[#FF2D78]" />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] py-8 text-center text-xs text-[#8B8BA3]/60">
          <div className="max-w-4xl mx-auto px-6">
            <p>© 2026 {APP_NAME}. All rights reserved.</p>
            <div className="flex items-center justify-center gap-4 mt-3">
              <Link href="/terms" className="hover:text-[#F0F0F5] transition-colors">{t('footer.terms')}</Link>
              <Link href="/privacy" className="hover:text-[#F0F0F5] transition-colors">{t('footer.privacy')}</Link>
              <button onClick={handleGetStarted} className="hover:text-[#F0F0F5] transition-colors">{t('hero.getStarted')}</button>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
