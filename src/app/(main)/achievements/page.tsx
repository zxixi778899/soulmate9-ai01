'use client';

import { useTranslation } from '@/lib/i18n/context';
import { authedFetch } from '@/lib/supabase';
import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Star, Lock, Sparkles, MessageCircle, Image, Gift, Heart, ShoppingBag } from 'lucide-react';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';

interface Achievement {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  reward_tokens: number;
  reward_title: string;
  condition_type: string;
  condition_value: number;
  rarity: string;
  is_hidden: boolean;
  user_progress?: { progress_value: number; unlocked: boolean; reward_claimed: boolean };
}

type Category = 'all' | 'interaction' | 'consumption' | 'collection' | 'intimacy';

const RARITY_CONFIG: Record<string, { color: string; bg: string; icon: typeof Trophy }> = {
  common: { color: 'text-slate-400', bg: 'bg-slate-500/10', icon: Medal },
  rare: { color: 'text-blue-400', bg: 'bg-blue-500/10', icon: Star },
  epic: { color: 'text-purple-400', bg: 'bg-purple-500/10', icon: Trophy },
  legendary: { color: 'text-amber-400', bg: 'bg-amber-500/10', icon: Sparkles },
};

const CATEGORY_ICONS: Record<string, typeof MessageCircle> = {
  interaction: MessageCircle,
  consumption: Gift,
  collection: ShoppingBag,
  intimacy: Heart,
};

export default function AchievementsPage() {
  const { t } = useTranslation();
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [category, setCategory] = useState<Category>('all');
  const [totalUnlocked, setTotalUnlocked] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAchievements();
  }, []);

  const loadAchievements = async () => {
    try {
      const res = await authedFetch('/api/v2/user/achievements');
      if (res.ok) {
        const data = await res.json();
        setAchievements(data.achievements || []);
        setTotalUnlocked(data.total_unlocked || 0);
      }
    } catch (err) {
      logger.error('Failed to load achievements:', { data: err });
    }
    setLoading(false);
  };

  const filtered = category === 'all'
    ? achievements
    : achievements.filter(a => a.category === category);

  const unlockedCount = achievements.filter(a => a.user_progress?.unlocked).length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-4 sm:px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold italic gradient-text">Achievements</h1>
            <p className="text-sm text-[#8B8BA3]">
              {unlockedCount} / {achievements.length} unlocked
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-amber-400 font-semibold">{totalUnlocked}</span>
            <span className="text-xs text-[#8B8BA3]">claimed</span>
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
          {(['all', 'interaction', 'consumption', 'collection', 'intimacy'] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors',
                category === cat
                  ? 'bg-white/[0.12] text-white'
                  : 'bg-white/[0.04] text-[#8B8BA3] hover:bg-white/[0.08]',
              )}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Achievements Grid */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filtered.map((ach) => {
              const { unlocked, progress_value } = ach.user_progress || { unlocked: false, progress_value: 0 };
              const rarity = RARITY_CONFIG[ach.rarity] || RARITY_CONFIG.common;
              const CatIcon = CATEGORY_ICONS[ach.category] || MessageCircle;
              const progressPercent = Math.min(100, Math.round((progress_value / ach.condition_value) * 100));

              return (
                <Card
                  key={ach.id}
                  className={cn(
                    'border-white/[0.06] overflow-hidden transition-all duration-200',
                    unlocked
                      ? 'bg-white/[0.06] hover:bg-white/[0.08]'
                      : 'bg-white/[0.02] opacity-60 hover:opacity-80',
                  )}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',
                        rarity.bg,
                      )}>
                        {unlocked ? (
                          <rarity.icon className={cn('h-5 w-5', rarity.color)} />
                        ) : (
                          <Lock className="h-5 w-5 text-[#8B8BA3]/40" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CatIcon className="h-3 w-3 text-[#8B8BA3]/50" />
                          <span className="text-xs text-[#8B8BA3]/50 capitalize">{ach.category}</span>
                        </div>
                        <h3 className={cn(
                          'text-sm font-semibold',
                          unlocked ? 'text-white' : 'text-[#8B8BA3]',
                        )}>
                          {ach.name}
                          {ach.rarity !== 'common' && (
                            <Badge
                              variant="secondary"
                              className={cn('ml-1.5 text-[10px]', rarity.color, rarity.bg)}
                            >
                              {ach.rarity}
                            </Badge>
                          )}
                        </h3>
                        <p className="text-xs text-[#8B8BA3] mt-0.5 line-clamp-2">{ach.description}</p>

                        {/* Progress bar */}
                        {!unlocked && (
                          <div className="mt-2 space-y-1">
                            <div className="flex justify-between text-[10px] text-[#8B8BA3]/50">
                              <span>{progress_value}/{ach.condition_value}</span>
                              <span>{progressPercent}%</span>
                            </div>
                            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-accent/60 to-accent rounded-full transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Reward */}
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <Badge variant="outline" className={cn('h-5 text-[10px]', unlocked ? 'border-amber-500/30 text-amber-400' : '')}>
                            {unlocked ? '✅' : '🔒'} +{ach.reward_tokens} tokens
                          </Badge>
                          {ach.reward_title && unlocked && (
                            <Badge variant="secondary" className="h-5 text-[10px] bg-accent/10 text-accent">
                              {ach.reward_title}
                            </Badge>
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
    </div>
  );
}