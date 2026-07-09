'use client';

/**
 * /explore — OoXX Girl Selection Hall
 *
 * Game-style character selection page with 3D cards, neon ambient, holographic detail.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Sparkles, Heart, Star } from 'lucide-react';
import { GirlfriendCardGrid, type Girl } from '@/components/discover/GirlfriendCard';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { cn } from '@/lib/utils';

type SortKey = 'hot' | 'new' | 'intimacy' | 'rarity';

const GIRLS: Girl[] = [
  { id: 'g1', name: 'Nova', tagline: 'Your favorite synthwave girlfriend. Soft on the outside, fire in the dark.', age: 23, tags: ['mysterious', 'romantic', 'playful'], rarity: 'SSR', intimacy: 82, online: true, personality: 'mysterious·romantic·playful' },
  { id: 'g2', name: 'Luna', tagline: 'Mysterious dreamer who comes alive under starlight.', age: 24, tags: ['poetic', 'gentle', 'tender'], rarity: 'SR', intimacy: 65, online: true, personality: 'poetic·gentle' },
  { id: 'g3', name: 'Sophie', tagline: 'Sweet artist next door, ready to paint your story.', age: 22, tags: ['sweet', 'creative', 'flirty'], rarity: 'R', intimacy: 41, online: false, personality: 'sweet·creative' },
  { id: 'g4', name: 'Violet', tagline: 'Bold and powerful, knows exactly what she wants.', age: 26, tags: ['bold', 'confident', 'passionate'], rarity: 'SSR', intimacy: 91, online: true, personality: 'bold·confident·passionate' },
  { id: 'g5', name: 'Maya', tagline: 'Gentle morning poet who finds beauty in small things.', age: 23, tags: ['gentle', 'wise', 'caring'], rarity: 'SR', intimacy: 58, online: true, personality: 'gentle·wise' },
  { id: 'g6', name: 'Aria', tagline: 'Flirty troublemaker with a wink that breaks hearts.', age: 21, tags: ['flirty', 'playful', 'spicy'], rarity: 'R', intimacy: 33, online: true, personality: 'flirty·playful·spicy' },
  { id: 'g7', name: 'Ruby', tagline: 'Dominant queen. She runs the show, you obey.', age: 25, tags: ['dominant', 'spicy', 'confident'], rarity: 'SSR', intimacy: 77, online: false, personality: 'dominant·spicy·confident' },
  { id: 'g8', name: 'Celeste', tagline: 'Elegant Parisian who teaches French and forbidden things.', age: 27, tags: ['elegant', 'sophisticated', 'mature'], rarity: 'SR', intimacy: 49, online: true, personality: 'elegant·sophisticated' },
  { id: 'g9', name: 'Iris', tagline: 'Mysterious artist. Every conversation is a new painting.', age: 23, tags: ['artistic', 'mysterious', 'sensitive'], rarity: 'R', intimacy: 22, online: true, personality: 'artistic·mysterious' },
  { id: 'g10', name: 'Skye', tagline: 'Adventurous pilot. Up for anything above 30,000 feet.', age: 22, tags: ['adventurous', 'bold', 'fun'], rarity: 'R', intimacy: 38, online: true, personality: 'adventurous·bold' },
  { id: 'g11', name: 'Jade', tagline: 'Gentle yoga instructor. Stretches your body and your mind.', age: 24, tags: ['gentle', 'caring', 'fit'], rarity: 'N', intimacy: 15, online: false, personality: 'gentle·caring' },
  { id: 'g12', name: 'Ember', tagline: 'Fierce warrior with a soft spot for losers.', age: 26, tags: ['fierce', 'passionate', 'intense'], rarity: 'SR', intimacy: 66, online: true, personality: 'fierce·passionate' },
];

const TAG_POOL = ['mysterious', 'romantic', 'playful', 'sweet', 'creative', 'flirty', 'bold', 'confident', 'passionate', 'gentle', 'wise', 'caring'];

export default function ExplorePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('hot');
  const [selected, setSelected] = useState<Girl | null>(null);

  const girls = useMemo(() => {
    let arr = [...GIRLS];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((g) => g.name.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q));
    }
    if (selectedTags.length) {
      arr = arr.filter((g) => selectedTags.every((t) => g.tags.includes(t)));
    }
    if (sort === 'hot' || sort === 'intimacy') arr.sort((a, b) => (b.intimacy || 0) - (a.intimacy || 0));
    if (sort === 'new') arr = arr.reverse();
    if (sort === 'rarity') {
      const order: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 };
      arr.sort((a, b) => (order[b.rarity || 'N'] || 0) - (order[a.rarity || 'N'] || 0));
    }
    return arr;
  }, [search, selectedTags, sort]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      {/* Hero strip */}
      <section className="relative z-10 pt-6 pb-2 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ff2e88]">
              <Sparkles className="h-3 w-3" />
              Discover · Pick · Obsess
            </div>
            <h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="text-white">Choose Your </span>
              <span className="bg-gradient-to-r from-[#ff2e88] via-[#c026d3] to-[#00e5ff] bg-clip-text text-transparent">
                Obsession
              </span>
            </h1>
            <p className="mt-1 text-sm text-zinc-400">Obsession Unleashed. Desire Unfiltered.</p>
          </div>

          {/* Featured mini card */}
          <div className="hidden lg:flex items-center gap-3 rounded-2xl border border-[#ff2e88]/30 bg-[#111114]/80 backdrop-blur-3xl p-3 max-w-sm"
               style={{ boxShadow: '0 0 32px rgba(255, 46, 136, 0.15)' }}>
            <div className="h-14 w-14 rounded-xl bg-gradient-to-br from-[#ff2e88] to-[#c026d3] flex items-center justify-center font-bold text-xl">
              N
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-[#ff2e88]">Today&apos;s Pick</div>
              <div className="font-semibold truncate">Nova</div>
              <div className="text-[10px] text-zinc-500">2,847 chats today</div>
            </div>
            <button
              onClick={() => setSelected(GIRLS[0])}
              className="px-3 py-1.5 rounded-full text-[10px] font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #ff2e88, #c026d3)' }}
            >
              VIEW
            </button>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="relative z-10 sticky top-20 mt-6 backdrop-blur-3xl bg-[#0a0a0d]/70 border-y border-white/[0.06] py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, vibe, tag…"
              className="w-full h-10 pl-9 pr-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:border-[#ff2e88]/40 focus:bg-white/[0.06] outline-none transition-all"
            />
          </div>

          <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-xl">
            {TAG_POOL.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                    active
                      ? 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white border border-[#ff2e88]/40 shadow-[0_0_12px_rgba(255,46,136,0.4)]'
                      : 'bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.08]',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.08] p-1 text-xs">
            {[
              { key: 'hot', label: 'Hot', icon: TrendingUp },
              { key: 'new', label: 'New', icon: Sparkles },
              { key: 'intimacy', label: 'Intimacy', icon: Heart },
              { key: 'rarity', label: 'Rarity', icon: Star },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = sort === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key as SortKey)}
                  className={cn(
                    'flex items-center gap-1 px-3 h-7 rounded-full transition-all',
                    active ? 'bg-white text-[#050507] font-semibold' : 'text-zinc-400 hover:text-white',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Card grid */}
      <section className="relative z-10 py-8 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <GirlfriendCardGrid
            girls={girls}
            onSelectGirl={(g) => router.push('/chats')}
          />
        </div>
      </section>

      {selected && (
        <CompanionDetailModal
          girl={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onSelect={() => router.push('/chats')}
        />
      )}
    </div>
  );
}