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

  // IntersectionObserver for vn-fade-in elements
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('vn-in');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -10% 0px' }
    );
    // observe all .vn-fade-in after mount
    const timer = setTimeout(() => {
      document.querySelectorAll('.vn-fade-in').forEach((el) => observer.observe(el));
    }, 100);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

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
      <div className="vn-holo-bg min-h-screen text-[#F5E8D3] pb-20 md:pb-0 relative">
      {/* Vignette overlay — covers full page for noir atmosphere */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 vn-vignette" />
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 50% at center 20%, rgba(201, 166, 107, 0.05) 0%, transparent 60%)',
          }}
        />
      </div>
      <div className="relative z-10">
        {/* Navbar — glass bar */}
        <header
          className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl"
          style={{
            background: 'linear-gradient(180deg, rgba(10, 5, 8, 0.75) 0%, rgba(10, 5, 8, 0.4) 100%)',
            borderBottom: '1px solid rgba(201, 166, 107, 0.2)',
          }}
        >
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="w-9 h-9 rounded-md flex items-center justify-center relative"
                style={{
                  background: 'linear-gradient(135deg, #C9A66B 0%, #8B6F4D 100%)',
                  boxShadow: '0 0 20px rgba(201, 166, 107, 0.25)',
                }}
              >
                <Heart className="w-4 h-4 text-[#0A0508] fill-[#0A0508]" />
              </div>
              <div className="flex flex-col leading-none">
                <span
                  className="text-lg tracking-[0.2em] uppercase"
                  style={{
                    fontFamily: 'Playfair Display, serif',
                    fontWeight: 700,
                    color: '#C9A66B',
                  }}
                >
                  SoulMate
                </span>
                <span className="text-[9px] tracking-[0.3em] uppercase text-[#8B6F4D] mt-0.5">
                  Velvet Noir
                </span>
              </div>
            </div>
            <div className="hidden md:flex items-center gap-1 mx-auto">
              <DynamicNav />
              {!user && (
                <>
                  <Link href="/" className="px-3 py-2 text-sm transition-colors" style={{ color: '#C9A66B', borderBottom: '1px solid #C9A66B' }}>
                    Home
                  </Link>
                  <Link href="/login" className="px-3 py-2 text-sm transition-colors text-[#8B6F4D] hover:text-[#F5E8D3]">
                    Explore
                  </Link>
                  <Link href="/pricing" className="px-3 py-2 text-sm transition-colors text-[#8B6F4D] hover:text-[#F5E8D3]">
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
                className="text-sm text-[#8B6F4D] hover:text-[#C9A66B] transition-colors"
                onClick={() => router.push('/login')}
              >
                {t('hero.signIn')}
              </Button>
              <Button
                onClick={handleGetStarted}
                className="text-sm font-medium h-9 px-5 rounded-md tracking-wider uppercase transition-all duration-300"
                style={{
                  background: 'linear-gradient(135deg, #C9A66B 0%, #8B6F4D 100%)',
                  color: '#0A0508',
                  boxShadow: '0 4px 20px rgba(201, 166, 107, 0.25)',
                  fontFamily: 'Playfair Display, serif',
                  fontWeight: 700,
                }}
              >
                {t('hero.getStarted')}
              </Button>
            </div>
          </div>
        </header>

        {/* Hero Section — Velvet Noir + Holographic */}
        <section className="relative pt-32 pb-24 px-6 overflow-hidden min-h-[88vh] flex items-center">
          {/* Vignette spotlight — directional, off-center */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute"
              style={{
                top: '15%',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '900px',
                height: '900px',
                background: 'radial-gradient(circle, rgba(201, 166, 107, 0.08) 0%, rgba(61, 14, 26, 0.3) 30%, transparent 60%)',
                filter: 'blur(40px)',
              }}
            />
          </div>

          <div className="max-w-5xl mx-auto text-center relative z-10 w-full">
            {/* Eyebrow — letter-spaced label */}
            <div
              className="vn-fade-in inline-flex items-center gap-3 px-5 py-2"
              style={{
                border: '1px solid rgba(201, 166, 107, 0.35)',
                background: 'rgba(10, 5, 8, 0.4)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#C9A66B]"
                style={{ boxShadow: '0 0 12px #C9A66B', animation: 'vn-breathe 2s ease-in-out infinite' }}
              />
              <span
                className="text-[10px] tracking-[0.4em] uppercase"
                style={{ color: '#C9A66B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}
              >
                Velvet Noir · Live · 18+
              </span>
            </div>

            {/* Hero title — Playfair with RGB split */}
            <h1
              className="vn-fade-in mt-10 leading-[0.95]"
              style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 700,
                fontSize: 'clamp(3.5rem, 9vw, 7.5rem)',
                letterSpacing: '-0.02em',
                animationDelay: '0.15s',
              }}
            >
              <span className="block vn-rgb-text">
                {t('landing.heroSection').split(' ').slice(0, -2).join(' ')}
              </span>
              <span
                className="block italic mt-2"
                style={{
                  fontFamily: 'Playfair Display, serif',
                  fontStyle: 'italic',
                  fontWeight: 600,
                  background: 'linear-gradient(135deg, #C9A66B 0%, #F5E8D3 50%, #C9A66B 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontSize: '0.7em',
                }}
              >
                {t('landing.heroSection').split(' ').slice(-2).join(' ')}
              </span>
            </h1>

            {/* Dynamic tagline — Sora italic, slow color shift */}
            <div
              className="vn-fade-in mt-10 h-10 relative flex items-center justify-center"
              style={{ animationDelay: '0.3s' }}
            >
              {HERO_TAGLINES.map((line, i) => (
                <span
                  key={line}
                  className="absolute inset-0 flex items-center justify-center transition-all duration-700"
                  style={{
                    fontFamily: 'Sora, sans-serif',
                    fontWeight: 300,
                    fontStyle: 'italic',
                    fontSize: 'clamp(1rem, 2vw, 1.5rem)',
                    letterSpacing: '0.05em',
                    color: i === heroIdx ? '#F5E8D3' : 'transparent',
                    opacity: i === heroIdx ? 1 : 0,
                    transform: i === heroIdx ? 'translateY(0)' : 'translateY(8px)',
                  }}
                >
                  <span className="vn-bubble">「 {line} 」</span>
                </span>
              ))}
            </div>

            <p
              className="vn-fade-in mt-8 max-w-xl mx-auto leading-relaxed"
              style={{
                color: '#8B6F4D',
                fontFamily: 'Sora, sans-serif',
                fontWeight: 300,
                fontSize: 'clamp(0.9rem, 1.2vw, 1rem)',
                letterSpacing: '0.02em',
                animationDelay: '0.45s',
              }}
            >
              {t('landing.heroDesc')}
            </p>

            {/* CTAs — gold primary + hairline secondary */}
            <div
              className="vn-fade-in mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
              style={{ animationDelay: '0.6s' }}
            >
              <button
                onClick={() => document.getElementById('girl-grid')?.scrollIntoView({ behavior: 'smooth' })}
                className="vn-shimmer relative h-14 px-10 tracking-[0.25em] uppercase transition-all duration-500"
                style={{
                  background: 'linear-gradient(135deg, #C9A66B 0%, #8B6F4D 100%)',
                  color: '#0A0508',
                  fontFamily: 'Playfair Display, serif',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  boxShadow: '0 8px 30px rgba(201, 166, 107, 0.3)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {t('hero.cta')}
              </button>
              <button
                onClick={() => document.getElementById('girl-grid')?.scrollIntoView({ behavior: 'smooth' })}
                className="h-14 px-10 tracking-[0.25em] uppercase transition-all duration-500"
                style={{
                  background: 'transparent',
                  color: '#C9A66B',
                  fontFamily: 'Sora, sans-serif',
                  fontWeight: 400,
                  fontSize: '0.85rem',
                  border: '1px solid #C9A66B',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(201, 166, 107, 0.1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                {t('landing.browseGirls')}
              </button>
            </div>

            {/* Stats — bronze labels with gold numbers */}
            <div
              className="vn-fade-in mt-16 flex items-center justify-center gap-10 md:gap-16"
              style={{ animationDelay: '0.75s' }}
            >
              {[
                { value: '20M+', label: 'Messages' },
                { value: '350+', label: 'AI Souls' },
                { value: '99.9%', label: 'Always On' },
              ].map((stat) => (
                <div key={stat.label} className="flex flex-col items-center">
                  <span
                    style={{
                      fontFamily: 'Playfair Display, serif',
                      fontWeight: 700,
                      fontSize: '1.75rem',
                      color: '#C9A66B',
                    }}
                  >
                    {stat.value}
                  </span>
                  <span
                    className="mt-1 text-[10px] tracking-[0.3em] uppercase"
                    style={{ color: '#8B6F4D', fontFamily: 'Space Grotesk, sans-serif' }}
                  >
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Filter Bar — glass */}
        <div
          className="sticky top-16 z-40 backdrop-blur-2xl"
          style={{
            background: 'rgba(10, 5, 8, 0.6)',
            borderTop: '1px solid rgba(201, 166, 107, 0.15)',
            borderBottom: '1px solid rgba(201, 166, 107, 0.15)',
          }}
        >
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

        {/* The Collection */}
        <section id="girl-grid" className="max-w-7xl mx-auto px-6 py-20 relative">
          {/* Section header */}
          <div className="text-center mb-16 vn-fade-in">
            <div
              className="inline-block text-[10px] tracking-[0.4em] uppercase mb-4"
              style={{ color: '#C9A66B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}
            >
              — The Collection —
            </div>
            <h2
              style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 700,
                fontSize: 'clamp(2rem, 4vw, 3.5rem)',
                color: '#F5E8D3',
                letterSpacing: '-0.01em',
              }}
            >
              Meet Your <span style={{ fontStyle: 'italic', color: '#C9A66B' }}>Companions</span>
            </h2>
            <p
              className="mt-4 max-w-md mx-auto"
              style={{ color: '#8B6F4D', fontFamily: 'Sora, sans-serif', fontWeight: 300, fontSize: '0.95rem' }}
            >
              {filtered.length} {filtered.length === 1 ? 'soul awaits' : 'souls await'}
            </p>
          </div>

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
                    className={`vn-hairline group relative overflow-hidden cursor-pointer ${
                      selectedCard === gf.id
                        ? 'shadow-[0_0_30px_rgba(201,166,107,0.2)]'
                        : ''
                    }`}
                    style={{
                      background: 'rgba(10, 5, 8, 0.4)',
                      backdropFilter: 'blur(20px)',
                    }}
                  >
                    {/* Portrait area — 3:4 aspect */}
                    <div
                      onClick={() => handleCardClick(gf.slug)}
                      className="relative aspect-[3/4] overflow-hidden"
                    style={{
                      background: 'linear-gradient(180deg, rgba(61, 14, 26, 0.2) 0%, rgba(10, 5, 8, 0.6) 100%)',
                    }}
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
                            <div
                              className="w-20 h-20 rounded-full flex items-center justify-center"
                              style={{
                                background: 'radial-gradient(circle, rgba(201, 166, 107, 0.15) 0%, transparent 70%)',
                                border: '1px solid rgba(201, 166, 107, 0.3)',
                              }}
                            >
                              <Heart className="w-8 h-8" style={{ color: 'rgba(201, 166, 107, 0.4)' }} />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Frosted glass bottom panel */}
                      <div
                        className="absolute inset-x-0 bottom-0 backdrop-blur-xl"
                        style={{
                          background: 'linear-gradient(180deg, rgba(10, 5, 8, 0.6) 0%, rgba(10, 5, 8, 0.95) 100%)',
                          borderTop: '1px solid rgba(201, 166, 107, 0.25)',
                        }}
                      >
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
                        <span
                          className="absolute top-3 right-3 flex items-center gap-1 text-[9px] px-2.5 py-1 rounded-full font-bold backdrop-blur-sm tracking-[0.2em]"
                          style={{
                            background: 'rgba(201, 166, 107, 0.15)',
                            color: '#C9A66B',
                            border: '1px solid rgba(201, 166, 107, 0.4)',
                            fontFamily: 'Space Grotesk, sans-serif',
                          }}
                        >
                          <span
                            className="w-1 h-1 rounded-full bg-[#C9A66B]"
                            style={{ boxShadow: '0 0 8px #C9A66B' }}
                          />
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

        {/* Stats — editorial display */}
        <section
          className="h5-reveal py-20 my-12 relative"
          style={{
            borderTop: '1px solid rgba(201, 166, 107, 0.2)',
            borderBottom: '1px solid rgba(201, 166, 107, 0.2)',
          }}
        >
          <div className="max-w-5xl mx-auto px-6 grid grid-cols-3 gap-8 md:gap-12 text-center">
            {[
              { value: '20M+', label: 'Monthly Messages' },
              { value: '350+', label: 'AI Souls' },
              { value: '3M+', label: 'Monthly Visits' },
            ].map((stat) => (
              <div key={stat.label}>
                <div
                  style={{
                    fontFamily: 'Playfair Display, serif',
                    fontWeight: 700,
                    fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                    background: 'linear-gradient(135deg, #C9A66B 0%, #F5E8D3 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}
                >
                  {stat.value}
                </div>
                <div
                  className="mt-3 text-[10px] tracking-[0.3em] uppercase"
                  style={{ color: '#8B6F4D', fontFamily: 'Space Grotesk, sans-serif' }}
                >
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SEO + trust + process blocks */}
        <LandingSections />

        {/* CTA — finale */}
        <section className="h5-reveal py-32 px-6 text-center relative">
          <div className="max-w-2xl mx-auto relative z-10">
            <div
              className="inline-block text-[10px] tracking-[0.4em] uppercase mb-6"
              style={{ color: '#C9A66B', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 500 }}
            >
              — Finale —
            </div>
            <h2
              className="leading-[1.05]"
              style={{
                fontFamily: 'Playfair Display, serif',
                fontWeight: 700,
                fontSize: 'clamp(2.5rem, 6vw, 5rem)',
                color: '#F5E8D3',
                letterSpacing: '-0.02em',
              }}
            >
              Start Your{' '}
              <span
                style={{
                  fontStyle: 'italic',
                  background: 'linear-gradient(135deg, #C9A66B 0%, #F5E8D3 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                Story
              </span>
            </h2>
            <p
              className="mt-6"
              style={{ color: '#8B6F4D', fontFamily: 'Sora, sans-serif', fontWeight: 300, fontSize: '1rem' }}
            >
              Meet your perfect AI companion today. No credit card required.
            </p>
            <div
              className="mt-8 inline-flex items-center gap-3 px-5 py-2"
              style={{
                border: '1px solid rgba(201, 166, 107, 0.3)',
                background: 'rgba(10, 5, 8, 0.5)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <Sparkles className="w-3.5 h-3.5" style={{ color: '#C9A66B' }} />
              <span
                className="font-medium tracking-wider"
                style={{ color: '#C9A66B', fontFamily: 'Playfair Display, serif', fontStyle: 'italic' }}
              >
                70% Off
              </span>
              <span style={{ color: '#8B6F4D' }}>·</span>
              <span style={{ color: '#F5E8D3', fontFamily: 'Sora, sans-serif' }} className="font-mono">
                {formatCountdown(countdown)}
              </span>
            </div>
            <button
              onClick={handleGetStarted}
              className="vn-shimmer mt-10 h-14 px-12 tracking-[0.25em] uppercase transition-all duration-500"
              style={{
                background: 'linear-gradient(135deg, #C9A66B 0%, #8B6F4D 100%)',
                color: '#0A0508',
                fontFamily: 'Playfair Display, serif',
                fontWeight: 700,
                fontSize: '0.85rem',
                boxShadow: '0 8px 30px rgba(201, 166, 107, 0.3)',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              <Sparkles className="w-4 h-4 inline mr-2" />
              Claim 70% Off
            </button>
            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left">
              {[
                { icon: MessageCircle, label: 'Unlimited Chat' },
                { icon: Heart, label: 'NSFW Mode' },
                { icon: MessageSquare, label: 'Voice & Video' },
                { icon: Users, label: '350+ Souls' },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: '#8B6F4D', fontFamily: 'Sora, sans-serif' }}
                >
                  <item.icon className="w-4 h-4" style={{ color: '#C9A66B' }} />
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer
          className="py-10 text-center text-xs"
          style={{
            borderTop: '1px solid rgba(201, 166, 107, 0.15)',
            color: '#8B6F4D',
          }}
        >
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
