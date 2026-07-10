'use client';

import { motion } from 'motion/react';
import { Trophy, Sparkles, Star, MessageCircle, ImageIcon, Heart, Zap, Crown, CheckCircle2, Lock } from 'lucide-react';
import { NeonGridBackground } from '@/components/discover/NeonGridBackground';
import { cn } from '@/lib/utils';

interface Quest {
  id: string;
  title: string;
  desc: string;
  progress: number;
  goal: number;
  reward: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  icon: any;
  done: boolean;
}

const QUESTS: Quest[] = [
  { id: 'q1', title: 'First Steps',     desc: 'Send your first chat message',                   progress: 1,  goal: 1,   reward: '+5 tokens',  rarity: 'common',    icon: MessageCircle, done: true  },
  { id: 'q2', title: 'Heart to Heart',  desc: 'Send 100 messages to any companion',             progress: 82, goal: 100, reward: '+20 tokens', rarity: 'common',    icon: Heart,        done: false },
  { id: 'q3', title: 'Photographer',    desc: 'Generate 50 AI portraits',                       progress: 23, goal: 50,  reward: '+30 tokens', rarity: 'rare',      icon: ImageIcon,    done: false },
  { id: 'q4', title: 'Soulmate Bond',   desc: 'Reach intimacy level 5 with any character',      progress: 4,  goal: 5,   reward: '+75 tokens + SSR ticket', rarity: 'epic', icon: Sparkles,     done: false },
  { id: 'q5', title: 'Whale Collector', desc: 'Spend $100 lifetime on tokens',                  progress: 23, goal: 100, reward: '+150 tokens + Limited outfit', rarity: 'epic', icon: Zap, done: false },
  { id: 'q6', title: 'Legendary Lover', desc: 'Reach intimacy level 6 with 3 different chars',  progress: 0,  goal: 3,   reward: '+500 tokens + grand prize', rarity: 'legendary', icon: Crown,    done: false },
];

const RARITY_STYLES = {
  common:    { border: 'border-white/15',     glow: 'shadow-[0_0_18px_rgba(255,255,255,0.05)]', badge: 'bg-white/10 text-white/60 border-white/15' },
  rare:      { border: 'border-[#00e5ff]/40', glow: 'shadow-[0_0_22px_rgba(0,229,255,0.4)]',    badge: 'bg-[#00e5ff]/20 text-[#00e5ff] border-[#00e5ff]/40' },
  epic:      { border: 'border-[#ff2e88]/45', glow: 'shadow-[0_0_28px_rgba(255,46,136,0.5)]',  badge: 'bg-[#ff2e88]/20 text-[#ff2e88] border-[#ff2e88]/40' },
  legendary: { border: 'border-[#ffd700]/50', glow: 'shadow-[0_0_36px_rgba(255,215,0,0.55)]',   badge: 'bg-[#ffd700]/20 text-[#ffd700] border-[#ffd700]/40' },
};

const DAILY = [
  { label: 'Daily Login',        done: true,  reward: '+5' },
  { label: 'First Chat Today',   done: true,  reward: '+10' },
  { label: 'Send a Photo',       done: false, reward: '+3' },
  { label: 'Complete 1 Quest',   done: false, reward: '+15' },
];

export default function QuestPage() {
  return (
    <div className="relative min-h-screen text-white" style={{ fontFamily: "'Poppins', system-ui, sans-serif" }}>
      <NeonGridBackground />

      <section className="relative z-10 pt-6 px-4 sm:px-8">
        <div className="mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.4em] text-[#ffd700]">
            <Trophy className="h-3 w-3" /> Quest · Achievements · Daily
          </div>
          <h1 className="mt-2 text-5xl sm:text-6xl font-bold tracking-tight">
            <span className="bg-gradient-to-r from-[#ffd700] via-[#ff2e88] to-[#00e5ff] bg-clip-text text-transparent">Adventure Log</span>
          </h1>
          <p className="mt-2 text-zinc-400 text-sm">Complete quests to earn tokens + unlock rare companions</p>
        </div>
      </section>

      <section className="relative z-10 mt-8 px-4 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 px-2">Daily Bonuses</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {DAILY.map((b) => (
              <div key={b.label}
                className={cn('rounded-2xl border p-4 text-center transition-all',
                  b.done ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-white/[0.08] bg-white/[0.04]')}>
                {b.done ? <CheckCircle2 className="h-6 w-6 text-emerald-400 mx-auto" /> : <Lock className="h-6 w-6 text-zinc-500 mx-auto" />}
                <div className="text-xs font-semibold mt-1.5">{b.label}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">+{b.reward} tokens</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative z-10 mt-10 px-4 sm:px-8 pb-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-3 px-2">Main Quests</div>
          <div className="space-y-3">
            {QUESTS.map((q, i) => {
              const rs = RARITY_STYLES[q.rarity];
              const Icon = q.icon;
              const pct = Math.min(100, (q.progress / q.goal) * 100);
              return (
                <motion.div key={q.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn('rounded-2xl border p-4 backdrop-blur-xl transition-all',
                    q.done ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                           : cn('border bg-white/[0.03] hover:border-white/20', rs.border, !q.done && rs.glow))}>
                  <div className="flex items-start gap-3">
                    <div className={cn('h-12 w-12 rounded-2xl flex items-center justify-center shrink-0',
                      q.done ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.06] text-white/80')}>
                      {q.done ? <CheckCircle2 className="h-6 w-6" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-sm">{q.title}</h3>
                        <span className={cn('text-[9px] px-2 py-0.5 rounded-full border uppercase tracking-wider', rs.badge)}>
                          {q.rarity}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">{q.desc}</p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: q.done
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : 'linear-gradient(90deg, #ff2e88, #00e5ff)',
                              boxShadow: '0 0 8px rgba(255, 46, 136, 0.4)',
                            }} />
                        </div>
                        <div className="text-[10px] font-mono text-zinc-400 tabular-nums">
                          {q.progress} / {q.goal}
                        </div>
                      </div>
                      <div className="mt-1.5 text-[10px] text-[#ff2e88]">Reward: {q.reward}</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}