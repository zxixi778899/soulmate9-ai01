'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Sparkles, Heart, Star } from 'lucide-react';
import { GirlfriendCardGrid } from '@/components/discover/GirlfriendCard';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { GIRLS, type DemoGirl } from '@/lib/demo-data';
import { cn } from '@/lib/utils';

type SortKey = 'rarity' | 'hot' | 'intimacy' | 'new';

const TAG_POOL = ['mysterious', 'romantic', 'playful', 'sweet', 'creative', 'flirty', 'bold', 'confident', 'passionate', 'gentle', 'wise', 'caring'];

export default function ExplorePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('rarity');
  const [selected, setSelected] = useState<DemoGirl | null>(null);

  const girls = useMemo(() => {
    let arr = [...GIRLS];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((g) => g.name.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q));
    }
    if (selectedTags.length) {
      arr = arr.filter((g) => selectedTags.every((t) => g.tags.includes(t)));
    }
    if (sort === 'hot' || sort === 'intimacy') arr.sort((a, b) => b.intimacy - a.intimacy);
    if (sort === 'new') arr = arr.reverse();
    if (sort === 'rarity') {
      const order: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 };
      arr.sort((a, b) => (order[b.rarity] || 0) - (order[a.rarity] || 0));
    }
    return arr;
  }, [search, selectedTags, sort]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 pb-2 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl flex items-end justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ff2e88]">
              <Sparkles className="h-3 w-3" /> Explore · Select · Bond
            </div>
            <h1 className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
              <span className="text-white">Character </span>
              <span className="bg-gradient-to-r from-[#ff2e88] via-[#c026d3] to-[#00e5ff] bg-clip-text text-transparent">Library</span>
            </h1>
            <p className="mt-1 text-sm text-zinc-400">350+ companions waiting · Obsession Unleashed</p>
          </div>
        </div>
      </section>

      <section className="relative z-10 sticky top-20 mt-6 backdrop-blur-3xl bg-[#0a0a0d]/70 border-y border-white/[0.06] py-3">
        <div className="mx-auto max-w-7xl px-4 sm:px-8 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, vibe, tag…"
              className="w-full h-10 pl-9 pr-3 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-white placeholder-zinc-500 focus:border-[#ff2e88]/40 focus:bg-white/[0.06] outline-none transition-all"
            />
          </div>
          <div className="hidden md:flex items-center gap-1.5 flex-wrap max-w-xl">
            {TAG_POOL.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button key={tag} onClick={() => toggleTag(tag)}
                  className={cn('px-3 py-1.5 rounded-full text-[11px] font-medium transition-all',
                    active ? 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white border border-[#ff2e88]/40 shadow-[0_0_12px_rgba(255,46,136,0.4)]'
                           : 'bg-white/[0.04] border border-white/[0.08] text-zinc-400 hover:text-white hover:bg-white/[0.08]')}>
                  {tag}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.08] p-1 text-xs">
            {[
              { key: 'rarity', label: 'Rarity', icon: Star },
              { key: 'hot', label: 'Hot', icon: TrendingUp },
              { key: 'intimacy', label: 'Intimacy', icon: Heart },
              { key: 'new', label: 'New', icon: Sparkles },
            ].map((opt) => {
              const Icon = opt.icon;
              const active = sort === opt.key;
              return (
                <button key={opt.key} onClick={() => setSort(opt.key as SortKey)}
                  className={cn('flex items-center gap-1 px-3 h-7 rounded-full transition-all',
                    active ? 'bg-white text-[#050507] font-semibold' : 'text-zinc-400 hover:text-white')}>
                  <Icon className="h-3 w-3" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative z-10 py-8 px-4 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <GirlfriendCardGrid
            girls={girls}
            onSelectGirl={() => router.push('/chats')}
            onClickGirl={setSelected}
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