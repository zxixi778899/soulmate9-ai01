'use client';

/**
 * Card Pool — gacha / card-game style companion library
 */

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Search, TrendingUp, Sparkles, Heart, Star, Loader2, Filter } from 'lucide-react';
import { CompanionDetailModal } from '@/components/discover/CompanionDetailModal';
import { CardMedia } from '@/components/discover/CardMedia';
import { GIRLS, type DemoGirl, RARITY_COLORS } from '@/lib/demo-data';
import { fetchCompanionCatalog } from '@/lib/companions';
import { openCompanionChat } from '@/lib/ensure-companion';
import {
  GameShell, GamePrimaryButton, RarityBadge,
} from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';
import { LockedPortraitOverlay, lockedImageClass } from '@/components/game/LockedPortrait';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { authedFetch } from '@/lib/supabase';

type SortKey = 'rarity' | 'hot' | 'intimacy' | 'new';
const TAG_POOL = ['mysterious', 'romantic', 'playful', 'sweet', 'creative', 'flirty', 'bold', 'confident', 'passionate', 'gentle', 'wise', 'caring'];

export default function ExplorePage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<SortKey>('rarity');
  const [selected, setSelected] = useState<DemoGirl | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [catalog, setCatalog] = useState<DemoGirl[]>(GIRLS);
  const [source, setSource] = useState<'api' | 'demo'>('demo');
  const [loading, setLoading] = useState(true);
  const [rarityFilter, setRarityFilter] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const result = await fetchCompanionCatalog(60);
      if (!cancelled) {
        setCatalog(result.girls);
        setSource(result.source);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const girls = useMemo(() => {
    let arr = [...catalog];
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter((g) => g.name.toLowerCase().includes(q) || g.tagline.toLowerCase().includes(q));
    }
    if (selectedTags.length) {
      arr = arr.filter((g) => selectedTags.every((t) => (Array.isArray(g.tags) ? g.tags : []).includes(t)));
    }
    if (rarityFilter) arr = arr.filter((g) => g.rarity === rarityFilter);
    if (sort === 'hot' || sort === 'intimacy') arr.sort((a, b) => b.intimacy - a.intimacy);
    if (sort === 'new') arr = arr.reverse();
    if (sort === 'rarity') {
      const order: Record<string, number> = { SSR: 4, SR: 3, R: 2, N: 1 };
      arr.sort((a, b) => (order[b.rarity] || 0) - (order[a.rarity] || 0));
    }
    return arr;
  }, [catalog, search, selectedTags, sort, rarityFilter]);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSelect = async (girl: DemoGirl) => {
    setSelecting(true);
    try {
      if (girl.locked) {
        try {
          const res = await authedFetch('/api/girlfriends/unlock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ girlfriend_id: girl.id }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error((data as { error?: string }).error || 'Unlock failed');
            setSelected(girl);
            return;
          }
          toast.success('Unlocked');
          girl = { ...girl, locked: false, is_unlocked: true };
          setCatalog((prev) =>
            prev.map((g) => (g.id === girl.id ? { ...g, locked: false, is_unlocked: true } : g)),
          );
        } catch {
          toast.error('Unlock failed — please log in');
          return;
        }
      }
      try {
        const ok = await openCompanionChat(girl, router);
        if (!ok) {
          toast.error('Could not open chat — please log in');
          router.push('/login');
        }
      } catch (err) {
        const e = err as Error & { code?: string };
        if (e.code === 'SEAT_LIMIT') {
          toast.error('Friend seats full', {
            description: 'Upgrade membership or buy permanent seats',
            action: { label: 'Buy seats', onClick: () => router.push('/shop?tab=seats') },
          });
          return;
        }
        toast.error(e.message || 'Failed to add friend');
      }
    } finally {
      setSelecting(false);
    }
  };


  return (
    <GameShell className="pb-6 md:pb-12 min-h-[100dvh]">
      <PageHeader
        eyebrow="CARD POOL"
        title="Card Pool"
        subtitle={
          loading
            ? '加载卡牌中…'
            : `${girls.length} 张 · ${source === 'api' ? '在线卡池' : '展示卡包'}`
        }
        backHref="/"
        sticky={false}
        actions={
          <GamePrimaryButton onClick={() => router.push('/create')} className="!h-10 !px-3 sm:!px-4 text-xs touch-manipulation">Create</GamePrimaryButton>
        }
      />

      {/* Filters bar */}
      <section className="sticky top-0 z-20 border-y border-[#ff2e88]/12 bg-[#08040e]/85 backdrop-blur-2xl">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-2.5 sm:py-3 space-y-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[min(100%,140px)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#ff6ba6]/50" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name…"
                className="glass-input w-full h-11 pl-9 pr-3 text-[16px] sm:text-sm"
              />
            </div>
            <div className="flex items-center gap-0.5 sm:gap-1 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1 overflow-x-auto scrollbar-hide max-w-full">
              {(['SSR', 'SR', 'R', 'N'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRarityFilter(rarityFilter === r ? null : r)}
                  className={cn(
                    'px-2.5 h-9 min-w-[2.5rem] rounded-lg text-[10px] font-black tracking-wider transition-all touch-manipulation active:scale-95',
                    rarityFilter === r ? 'bg-white text-black' : 'text-white/50',
                  )}
                  style={rarityFilter === r ? undefined : { color: RARITY_COLORS[r].color }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] border border-white/[0.08] p-1 text-xs">
              {[
                { key: 'rarity', label: '稀有', icon: Star },
                { key: 'hot', label: '热门', icon: TrendingUp },
                { key: 'intimacy', label: '亲密度', icon: Heart },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = sort === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key as SortKey)}
                    className={cn(
                      'flex items-center gap-1 px-2.5 h-8 rounded-lg transition-all',
                      active ? 'bg-white text-black font-semibold' : 'text-white/45 hover:text-white',
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    <span className="hidden sm:inline">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-white/30" />
            {TAG_POOL.map((tag) => {
              const active = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-3 py-1 rounded-full text-[11px] font-medium transition-all',
                    active
                      ? 'bg-gradient-to-r from-[#ff2e88] to-[#c026d3] text-white'
                      : 'bg-white/[0.04] border border-white/[0.08] text-white/45 hover:text-white',
                  )}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Card grid — gacha style */}
      <section className="px-4 sm:px-6 py-6">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
            {girls.map((girl) => (
              <button
                key={girl.id}
                type="button"
                onClick={() => setSelected(girl)}
                className={cn(
                  'game-card-frame text-left group content-visibility-auto',
                  `game-rarity-${girl.rarity.toLowerCase()}`,
                  'transition-transform duration-200 active:scale-[0.98] hover:-translate-y-1',
                )}
              >
                <div className="relative aspect-[3/4]">
                  <CardMedia
                    src={girl.portrait || girl.avatar}
                    videoSrc={girl.video || girl.avatar_video}
                    alt={girl.name}
                    hoverPlay
                    forcePlay={false}
                    showBadge={!!(girl.video || girl.avatar_video)}
                    imgClassName={cn(
                      'transition-transform duration-300 group-hover:scale-[1.03]',
                      lockedImageClass(girl.locked),
                    )}
                  />
                  {girl.locked && <LockedPortraitOverlay price={girl.unlock_price_tokens} />}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20 z-[1]" />
                  <div className="absolute top-2 left-2 z-[2]">
                    <RarityBadge rarity={girl.rarity} />
                  </div>
                  <div className="absolute top-2 right-2 z-[2] text-[9px] font-mono text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                    {girl.element}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3 z-[2]">
                    <div className="font-bold text-base sm:text-lg leading-tight">{girl.name}</div>
                    <div className="text-[10px] text-white/55 line-clamp-1 mt-0.5">{girl.tagline}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <div className="flex-1 h-1 rounded-full bg-white/15 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#ff2e88] to-[#ffd700]"
                          style={{ width: `${girl.intimacy}%` }}
                        />
                      </div>
                      <span className="text-[9px] font-mono text-[#ffd700]">{girl.intimacy}</span>
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(girl);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          handleSelect(girl);
                        }
                      }}
                      className="mt-2 w-full h-8 rounded-lg text-[10px] font-black tracking-[0.15em] bg-gradient-to-r from-[#ff2e88] to-[#c026d3] flex items-center justify-center active:scale-95"
                    >
                      {girl.locked ? 'UNLOCK' : 'SELECT'}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {girls.length === 0 && !loading && (
            <div className="py-20 text-center text-white/40 text-sm">
              没有匹配的卡牌。
              <button
                onClick={() => {
                  setSearch('');
                  setSelectedTags([]);
                  setRarityFilter(null);
                }}
                className="ml-2 text-[#ff2e88] hover:underline"
              >
                清空筛选
              </button>
            </div>
          )}
        </div>
      </section>

      {selected && (
        <CompanionDetailModal
          busy={selecting}
          girl={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          onSelect={() => handleSelect(selected)}
        />
      )}
    </GameShell>
  );
}
