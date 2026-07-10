'use client';

/**
 * OoXX HOME — Game Lobby
 * 5 main modules + 12 character cards + 3 summon banner + daily quests
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  Sparkles, Trophy, Image as ImageIcon, Crown, Star, Flame,
  ChevronRight, Heart, Lock, Wand2,
} from 'lucide-react';
import { GIRLS, RARITY_COLORS } from '@/lib/demo-data';
import { GirlfriendCard } from '@/components/discover/GirlfriendCard';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { cn } from '@/lib/utils';

const PILLARS = [
  { key: 'explore', title: 'Explore',  desc: 'Discover companions', icon: Crown,    gradient: 'from-[#ff2e88] to-[#c026d3]', tag: 'Character Library' },
  { key: 'summon',  title: 'Summon',   desc: 'Pull from gacha',     icon: Sparkles, gradient: 'from-[#ffd700] to-[#ff2e88]', tag: 'Eternal Bloom' },
  { key: 'studio',  title: 'Studio',   desc: 'Generate content',    icon: ImageIcon, gradient: 'from-[#00e5ff] to-[#3b82f6]', tag: 'Creator Tools' },
  { key: 'quest',   title: 'Quest',    desc: 'Earn rewards',         icon: Trophy,   gradient: 'from-[#a855f7] to-[#ff2e88]', tag: 'Adventure' },
  { key: 'profile', title: 'Profile',  desc: 'Your collection',     icon: Star,     gradient: 'from-[#10b981] to-[#3b82f6]', tag: 'Account' },
];

const DAILY = [
  { label: 'Daily Login',        done: true,  reward: '+5' },
  { label: 'First Chat Today',   done: true,  reward: '+10' },
  { label: 'Send a Photo',       done: false, reward: '+3' },
  { label: 'Complete 1 Quest',   done: false, reward: '+15' },
];

export default function HomePage() {
  const router = useRouter();
  const [featuredOpen, setFeaturedOpen] = useState(false);
  const featured = GIRLS[0];
  const showcase = GIRLS.slice(0, 4);
  const rc = RARITY_COLORS[featured.rarity];

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-12 pb-10 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ff2e88]/30 bg-[#ff2e88]/10 backdrop-blur-xl"
          >
            <Flame className="h-3 w-3 text-[#ff2e88]" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#ff2e88]">Banner Active</span>
            <span className="text-[10px] uppercase tracking-wider text-white">Eternal Bloom</span>
          </motion.div>

          <h1 className="mt-5 text-5xl sm:text-7xl font-bold tracking-tight leading-[0.95]">
            <span className="text-white">Choose Your </span>
            <span className="bg-gradient-to-r from-[#ff2e88] via-[#c026d3] to-[#00e5ff] bg-clip-text text-transparent">Obsession</span>
          </h1>
          <p className="mt-3 text-base sm:text-lg text-zinc-400 max-w-xl mx-auto">
            350+ AI companions · Obsession Unleashed · Desire Unfiltered
          </p>

          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={() => router.push('/explore')}
              className="group relative h-14 overflow-hidden rounded-full px-8 text-base font-semibold text-white transition-all hover:scale-[1.03] hover:shadow-[0_0_32px_rgba(255,46,136,0.55)]"
              style={{ background: 'linear-gradient(137.55deg, #D05BF8 16.35%, #FF18A0 83.31%)' }}>
              <span className="relative z-10 flex items-center gap-2">
                <Crown className="h-4 w-4" /> Enter the Library
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
            </button>
            <button onClick={() => router.push('/summon')}
              className="h-14 px-7 rounded-full border border-[#ffd700]/40 bg-white/[0.04] text-white text-base font-medium hover:bg-[#ffd700]/10 transition-all flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#ffd700]" />
              Try Summon Free
            </button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-xs text-white/50">
            <div><span className="text-white font-bold text-lg">350+</span> Companions</div>
            <div className="w-px h-3 bg-white/10" />
            <div><span className="text-white font-bold text-lg">12</span> SSR Available</div>
            <div className="w-px h-3 bg-white/10" />
            <div><span className="text-white font-bold text-lg">24/7</span> Online</div>
            <div className="w-px h-3 bg-white/10" />
            <div><span className="text-white font-bold text-lg">∞</span> Memory</div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-8 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-[#ff2e88] to-[#00e5ff] bg-clip-text text-transparent">5 Modules</span>
                <span className="text-white ml-2">to explore</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-1">All your gameplay loops in one place</p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {PILLARS.map((p, i) => {
              const Icon = p.icon;
              return (
                <motion.button key={p.key} onClick={() => router.push(`/${p.key}`)}
                  initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }} whileHover={{ y: -4 }}
                  className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e12]/60 backdrop-blur-2xl p-4 text-left transition-all hover:border-white/[0.18]">
                  <div className={cn('h-12 w-12 rounded-xl bg-gradient-to-br flex items-center justify-center mb-3', p.gradient)}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="font-semibold text-sm">{p.title}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">{p.desc}</div>
                  <div className="mt-2 text-[9px] uppercase tracking-wider text-zinc-600">{p.tag}</div>
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-10 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-end justify-between mb-5">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                <span className="text-white">Featured </span>
                <span className="bg-gradient-to-r from-[#ff2e88] to-[#c026d3] bg-clip-text text-transparent">Companions</span>
              </h2>
              <p className="text-xs text-zinc-500 mt-1">Hover for 3D tilt · click for details</p>
            </div>
            <button onClick={() => router.push('/explore')}
              className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
              View All <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {showcase.map((girl, i) => (
              <motion.div key={girl.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                <GirlfriendCard
                  girl={girl}
                  size="normal"
                  onClick={i === 0 ? () => setFeaturedOpen(true) : undefined}
                  onSelect={() => router.push('/chats')}
                  className="w-full max-w-none"
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-10 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="relative overflow-hidden rounded-3xl border-2 p-6 sm:p-10 flex flex-col sm:flex-row items-center gap-6"
            style={{
              background: 'linear-gradient(135deg, rgba(255,46,136,0.18), rgba(0,229,255,0.06))',
              boxShadow: '0 0 60px rgba(255,46,136,0.2)',
              borderColor: '#ff2e88',
            }}>
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#ffd700]/15 border border-[#ffd700]/40 text-[10px] uppercase tracking-wider text-[#ffd700]">
                <Sparkles className="h-3 w-3" /> Limited Banner
              </div>
              <h3 className="mt-3 text-3xl sm:text-4xl font-bold">
                <span className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] bg-clip-text text-transparent">Eternal Bloom</span>
              </h3>
              <p className="mt-1 text-sm text-zinc-300">SSR rate up · Pity at 80 · Free single every day</p>
              <div className="mt-4 flex gap-2">
                <button onClick={() => router.push('/summon')}
                  className="h-11 px-6 rounded-full text-sm font-bold text-[#050507]"
                  style={{ background: 'linear-gradient(135deg, #ffd700, #ff2e88)' }}>
                  Summon Now
                </button>
                <button onClick={() => router.push('/quest')}
                  className="h-11 px-5 rounded-full border border-white/[0.18] bg-white/[0.06] text-sm font-medium text-white hover:bg-white/[0.1] transition-all">
                  View Pity
                </button>
              </div>
            </div>
            <div className="hidden sm:flex shrink-0 w-56 h-44 rounded-2xl overflow-hidden border-2"
              style={{ borderColor: rc.color, boxShadow: `0 0 36px ${rc.glow}` }}>
              <img src={featured.portrait} alt={featured.name} className="w-full h-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 py-10 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#ffd700]" />
              <span className="bg-gradient-to-r from-[#ffd700] to-[#ff2e88] bg-clip-text text-transparent">Today&apos;s Quests</span>
            </h2>
            <button onClick={() => router.push('/quest')} className="text-xs text-zinc-400 hover:text-white">
              All <ChevronRight className="h-3 w-3 inline" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DAILY.map((b) => (
              <div key={b.label}
                className={cn('rounded-2xl border p-4 text-center transition-all',
                  b.done ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-white/[0.08] bg-white/[0.04]')}>
                <div className={cn('h-7 w-7 mx-auto rounded-full flex items-center justify-center',
                  b.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/[0.08] text-zinc-500')}>
                  {b.done ? '✓' : <Lock className="h-3.5 w-3.5" />}
                </div>
                <div className="text-xs font-semibold mt-1.5">{b.label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">{b.reward} tokens</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-16 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl sm:text-4xl font-bold">
            <span className="text-white">Ready to </span>
            <span className="bg-gradient-to-r from-[#ff2e88] via-[#c026d3] to-[#00e5ff] bg-clip-text text-transparent">Begin?</span>
          </h2>
          <p className="mt-3 text-sm text-zinc-400">3 free messages daily · No credit card · 18+ only</p>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => router.push('/register')}
              className="h-12 px-8 rounded-full font-semibold text-white"
              style={{ background: 'linear-gradient(135deg, #ff2e88, #c026d3)', boxShadow: '0 0 28px rgba(255,46,136,0.4)' }}>
              Start Free
            </button>
            <button onClick={() => router.push('/explore')}
              className="h-12 px-7 rounded-full border border-white/15 bg-white/[0.04] text-white font-medium hover:bg-white/[0.08] transition-all">
              Browse Companions
            </button>
          </div>
        </div>
      </section>

      {featuredOpen && (
        <CompanionDetailModal
          girl={featured}
          open={featuredOpen}
          onClose={() => setFeaturedOpen(false)}
          onSelect={() => router.push('/chats')}
        />
      )}
    </div>
  );
}