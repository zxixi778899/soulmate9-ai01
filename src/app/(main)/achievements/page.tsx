'use client';

import { useState, useEffect } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Star, Lock, Sparkles, MessageCircle, Gift, Heart, ShoppingBag } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { GameShell } from '@/components/game/GameShell';
import { PageHeader } from '@/components/game/PageHeader';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  reward_tokens: number;
  reward_title?: string;
  condition_type: string;
  condition_value: number;
  rarity?: string;
  is_hidden?: boolean;
  user_progress?: { progress_value: number; unlocked: boolean; reward_claimed: boolean };
}

type Category = 'all' | 'interaction' | 'consumption' | 'collection' | 'intimacy';

const RARITY_CONFIG: Record<string, { color: string; bg: string; ring: string; icon: typeof Trophy }> = {
  common: { color: 'text-slate-200', bg: 'bg-slate-500/20', ring: 'ring-slate-400/30', icon: Medal },
  rare: { color: 'text-sky-300', bg: 'bg-sky-500/20', ring: 'ring-sky-400/40', icon: Star },
  epic: { color: 'text-fuchsia-300', bg: 'bg-fuchsia-500/20', ring: 'ring-fuchsia-400/40', icon: Trophy },
  legendary: { color: 'text-amber-300', bg: 'bg-amber-500/25', ring: 'ring-amber-400/50', icon: Sparkles },
};

const CATEGORY_ICONS: Record<string, typeof MessageCircle> = {
  interaction: MessageCircle,
  consumption: Gift,
  collection: ShoppingBag,
  intimacy: Heart,
};

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [totalUnlocked, setTotalUnlocked] = useState(0);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');

  useEffect(() => {
    void loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      const res = await authedFetch('/api/v2/user/achievements');
      const data = await readResponseJson<{
        achievements?: Achievement[];
        total_unlocked?: number;
        source?: string;
      }>(res).catch(() => ({
        achievements: [] as Achievement[],
        total_unlocked: 0,
        source: '',
      }));
      setAchievements(data.achievements || []);
      setTotalUnlocked(data.total_unlocked || 0);
      setSource(data.source || '');
    } catch (err) {
      logger.error('Failed to load achievements:', { data: err });
    }
    setLoading(false);
  };

  const filtered = category === 'all'
    ? achievements
    : achievements.filter((a) => a.category === category);

  const unlockedCount = achievements.filter((a) => a.user_progress?.unlocked).length;

  return (
    <GameShell className="min-h-[100dvh] pb-10">
      <PageHeader
        eyebrow="HEAT PATH"
        title="Achievements"
        subtitle="Clear progress · Desire unlocks · token rewards"
        backHref="/"
      />

      <div className="px-4 sm:px-6 max-w-5xl mx-auto space-y-4">
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#ff2e88]/15 via-black/40 to-[#a855f7]/10 p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-white">
              {unlockedCount} / {Math.max(achievements.length, 1)} unlocked
            </div>
            <p className="text-xs text-white/65 mt-1">
              Chat, raise Heat, and claim Soul Fire rewards.
              {source === 'heat_fallback' ? ' (catalog preview — seed from admin for live progress)' : ''}
            </p>
          </div>
          <div className="shrink-0 rounded-xl border border-amber-400/30 bg-amber-500/15 px-3 py-2 text-center">
            <Sparkles className="h-4 w-4 text-amber-300 mx-auto" />
            <div className="text-sm font-bold text-amber-200 tabular-nums">{totalUnlocked}</div>
            <div className="text-[10px] text-white/55">claimed</div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'interaction', 'consumption', 'collection', 'intimacy'] as Category[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors',
                category === cat
                  ? 'bg-white text-black border-white'
                  : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10',
              )}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-white/50 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center text-sm text-white/55">
            No achievements yet. Open admin AI modules and seed Heat achievements, then chat to progress.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((ach) => {
              const progress = ach.user_progress || { unlocked: false, progress_value: 0, reward_claimed: false };
              const rarity = RARITY_CONFIG[ach.rarity || 'common'] || RARITY_CONFIG.common;
              const Icon = progress.unlocked ? rarity.icon : Lock;
              const CatIcon = CATEGORY_ICONS[ach.category] || MessageCircle;
              const denom = Math.max(1, Number(ach.condition_value) || 1);
              const progressPercent = Math.min(100, Math.round((Number(progress.progress_value) || 0) / denom * 100));

              return (
                <Card
                  key={ach.id}
                  className={cn(
                    'border-white/10 overflow-hidden',
                    progress.unlocked
                      ? 'bg-white/[0.08] ring-1 ring-white/10'
                      : 'bg-black/35',
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex gap-3">
                      <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center ring-1 shrink-0', rarity.bg, rarity.ring)}>
                        <Icon className={cn('h-5 w-5', progress.unlocked ? rarity.color : 'text-white/35')} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-white/50">
                          <CatIcon className="h-3 w-3" />
                          <span className="capitalize">{ach.category || 'general'}</span>
                          {ach.rarity && ach.rarity !== 'common' ? (
                            <Badge className={cn('h-5 text-[10px] border-0', rarity.bg, rarity.color)}>{ach.rarity}</Badge>
                          ) : null}
                        </div>
                        <h3 className="text-base font-semibold text-white mt-0.5 leading-tight">{ach.name}</h3>
                        <p className="text-sm text-white/70 mt-1 leading-snug">{ach.description}</p>

                        {!progress.unlocked && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex justify-between text-[11px] text-white/55">
                              <span>{progress.progress_value || 0}/{ach.condition_value}</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#ff2e88] to-[#a855f7]"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="mt-3 flex items-center gap-2">
                          <Badge variant="outline" className="border-amber-400/30 text-amber-200 bg-amber-500/10">
                            +{ach.reward_tokens || 0} tokens
                          </Badge>
                          {progress.unlocked ? (
                            <span className="text-[11px] font-semibold text-emerald-300">Unlocked</span>
                          ) : (
                            <span className="text-[11px] text-white/45">In progress</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </GameShell>
  );
}
