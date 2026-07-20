'use client';

import { Heart, Lock, Star, MessageCircle, ShoppingBag, Gift, Zap, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntimacyUnlockProps {
  currentLevel: number;
  progressPercent: number;
  intimacyScore: number;
  nextLevelName?: string;
  unlockedFeatures: string[];
  className?: string;
}

const FEATURE_ICONS: Record<string, typeof Heart> = {
  nsfw_chat: Zap,
  wardrobe_access: ShoppingBag,
  character_depth: Star,
  advanced_memories: MessageCircle,
  exclusive_outfits: Crown,
  voice_messages: Crown,
  send_gifts: Gift,
};

const FEATURE_LABELS: Record<string, string> = {
  basic_chat: 'Basic Chat',
  view_profile: 'View Profile',
  personalized_greetings: 'Personalized Greetings',
  send_gifts: 'Send Gifts',
  nsfw_chat: 'NSFW Chat',
  advanced_memories: 'Advanced Memories',
  wardrobe_access: 'Wardrobe Access',
  character_depth: 'Character Depth',
  exclusive_outfits: 'Exclusive Outfits',
  deep_roleplay: 'Deep Roleplay',
  voice_messages: 'Voice Messages',
  custom_stories: 'Custom Stories',
  special_title: 'Special Title',
};

const LEVEL_LABELS = ['', 'Stranger', 'Friend', 'Close', 'Intimate', 'Lover', 'Soulmate'];

export function IntimacyProgress({
  currentLevel,
  progressPercent,
  intimacyScore,
  nextLevelName,
  unlockedFeatures,
  className,
}: IntimacyUnlockProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {/* Level badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-pink-500" />
          <span className="text-sm font-semibold text-white">
            {LEVEL_LABELS[currentLevel] || 'Unknown'}
          </span>
          <span className="text-xs text-[#8B8BA3]">Lv.{currentLevel}</span>
        </div>
        <span className="text-xs text-[#8B8BA3]">{intimacyScore} pts</span>
      </div>

      {/* Progress to next level */}
      {currentLevel < 6 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-[#8B8BA3]/60">
            <span>Next: {nextLevelName || LEVEL_LABELS[currentLevel + 1]}</span>
            <span>{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#FF2D78] to-[#ff6ba6] rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Unlocked features */}
      {unlockedFeatures.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#8B8BA3]/50">
            Unlocked at this level
          </span>
          <div className="flex flex-wrap gap-1.5">
            {unlockedFeatures.map((feature) => {
              const Icon = FEATURE_ICONS[feature] || Star;
              return (
                <span
                  key={feature}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-accent/10 text-accent border border-accent/20"
                >
                  <Icon className="h-3 w-3" />
                  {FEATURE_LABELS[feature] || feature}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Locked features preview */}
      {currentLevel < 6 && (
        <div className="space-y-1.5">
          <span className="text-[10px] uppercase tracking-wider text-[#8B8BA3]/50">
            Coming next
          </span>
          <div className="flex flex-wrap gap-1.5 opacity-40">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/[0.04] text-[#8B8BA3] border border-white/[0.06]">
              <Lock className="h-3 w-3" />
              Lv.{currentLevel + 1} unlocks
            </span>
          </div>
        </div>
      )}
    </div>
  );
}