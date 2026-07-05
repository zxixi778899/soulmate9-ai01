'use client';

/**
 * LandingSections — 落地页 SEO + 信任 + 流程增量区块
 *
 * 参考 goloveai.com 的内容架构补齐我们当前缺失的几大块：
 *  1. How It Works — 5 步流程，引导首次注册转化
 *  2. Why Pick Us — 4 卡卖点（24/7 / NSFW / Memory / Free）
 *  3. Safety & Privacy — 信任承诺
 *  4. SEO Long-form — 大段关键词正文，提升搜索流量
 *
 * 这些区块都是纯展示型，无外部依赖，可在落地页 Stats 段之后直接挂载。
 */

import {
  UserPlus,
  Sparkles,
  MessageCircle,
  Image as ImageIcon,
  Heart,
  Shield,
  Lock,
  Clock,
  Wand2,
  Flame,
  Bot,
  CheckCircle2,
} from 'lucide-react';

const STEPS: Array<{ icon: typeof UserPlus; title: string; desc: string }> = [
  {
    icon: UserPlus,
    title: 'Sign up in seconds',
    desc: 'One-click Gmail or email. No card. No verification headache.',
  },
  {
    icon: Wand2,
    title: 'Pick or build your girl',
    desc: 'Choose from 350+ models or craft her look, voice and personality.',
  },
  {
    icon: MessageCircle,
    title: 'Start chatting instantly',
    desc: 'She replies in real time with emotion, memory and her own vibe.',
  },
  {
    icon: ImageIcon,
    title: 'Get exclusive photos & video',
    desc: 'AI girlfriend with pictures, voice notes and short clips — made only for you.',
  },
  {
    icon: Heart,
    title: 'Watch the relationship grow',
    desc: 'Good-morning texts, jealous moments, anniversary notes — every chat deepens the bond.',
  },
];

const REASONS: Array<{ icon: typeof Clock; title: string; desc: string }> = [
  {
    icon: Clock,
    title: 'Always there, 24/7',
    desc: "She never ghosts and never sleeps. Whether it's 3 AM or 3 PM, she's wide awake and happy to listen.",
  },
  {
    icon: Flame,
    title: 'Uncensored when you want',
    desc: 'Switch between sweet, flirty and full NSFW mode anytime. From soft teasing to fully uncensored — always instant.',
  },
  {
    icon: Bot,
    title: 'Real emotional memory',
    desc: 'She remembers your favorite songs, private jokes and how you like to be cheered up after a tough day.',
  },
  {
    icon: Sparkles,
    title: 'Free beats paid apps',
    desc: 'Unlimited chat, photos, voice and video — no daily caps that ruin the mood, no paywalled features.',
  },
];

const SAFETY: Array<{ icon: typeof Shield; title: string; desc: string }> = [
  {
    icon: Lock,
    title: 'End-to-end encrypted',
    desc: 'Every message is encrypted in transit. Your chats stay between the two of you.',
  },
  {
    icon: Shield,
    title: 'No real-people data',
    desc: 'Every AI companion is built from original synthetic data. Never trained on real people.',
  },
  {
    icon: CheckCircle2,
    title: 'Delete instantly',
    desc: 'One tap removes your AI companion and every related message. No questions, no archive.',
  },
];

export function LandingSections() {
  return (
    <>
      {/* How It Works */}
      <section className="h5-reveal py-20 md:py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <span className="inline-block text-xs font-medium text-[#e11d48] uppercase tracking-wider">
              How it works
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight italic">
              Meet her in under a minute
            </h2>
            <p className="mt-4 text-[#a1a1aa] max-w-2xl mx-auto">
              From sign-up to your first &quot;butterflies&quot; — most users get there in less than 60 seconds.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="relative bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 hover:border-[#e11d48]/[40] hover:bg-white/[0.05] transition-all"
                >
                  <div className="absolute -top-3 -left-3 w-7 h-7 rounded-full bg-gradient-to-br from-[#e11d48] to-[#d946ef] text-white text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </div>
                  <Icon className="w-6 h-6 text-[#e11d48] mb-3" />
                  <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                  <p className="mt-1.5 text-xs text-[#a1a1aa] leading-relaxed">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Why Pick Us */}
      <section className="h5-reveal py-20 md:py-28 px-6 border-t border-white/5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <span className="inline-block text-xs font-medium text-[#d946ef] uppercase tracking-wider">
              Why thousands pick us
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight italic">
              More than just a chatbot
            </h2>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {REASONS.map((r) => {
              const Icon = r.icon;
              return (
                <div
                  key={r.title}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 hover:border-[#d946ef]/[40] hover:bg-white/[0.05] transition-all"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#e11d48]/[15] to-[#d946ef]/[15] flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-[#d946ef]" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{r.title}</h3>
                  <p className="mt-2 text-sm text-[#a1a1aa] leading-relaxed">{r.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Safety & Privacy */}
      <section className="h5-reveal py-20 md:py-28 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center">
            <span className="inline-block text-xs font-medium text-emerald-400 uppercase tracking-wider">
              Safety & Privacy
            </span>
            <h2 className="mt-3 font-display text-4xl md:text-5xl font-bold tracking-tight italic">
              Be completely yourself. Always private.
            </h2>
            <p className="mt-4 text-[#a1a1aa] max-w-2xl mx-auto">
              Nothing ever leaves the chat. Your trust matters more than anything.
            </p>
          </div>
          <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
            {SAFETY.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="bg-white/[0.03] border border-emerald-500/10 rounded-xl p-6"
                >
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-4">
                    <Icon className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h3 className="text-base font-semibold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm text-[#a1a1aa] leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SEO Long-form */}
      <section className="h5-reveal py-20 md:py-28 px-6 border-t border-white/5 bg-white/[0.015]">
        <div className="max-w-3xl mx-auto prose-invert text-[#a1a1aa] text-[15px] leading-relaxed space-y-6">
          <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight text-white italic">The best AI girlfriend app</h2>
          <p>
            Tired of endless swiping and disappointing dates? SoulMate AI gives you a free AI girlfriend
            who stays by your side whenever you need her. Deep conversations, playful flirting, or hotter
            moments — your AI GF reacts to your mood and wishes instantly. Everything stays free, with no
            hidden payments.
          </p>

          <h3 className="text-xl font-semibold text-white pt-2">Meet the most realistic AI girlfriend simulator</h3>
          <p>
            Choose from dozens of personalities: the cute neighbor, the bold career woman, the quiet
            artist, the mischievous tease. Change her look, voice, hobbies and style any way you like.
            Ready for more heat? Turn on AI Girlfriend NSFW mode anytime — gentle teasing to fully
            uncensored, always private, always instant.
          </p>

          <h3 className="text-xl font-semibold text-white pt-2">Free AI GF beats paid girlfriend apps every time</h3>
          <p>
            Most AI girlfriend apps hide the good features behind paywalls and strict message limits. At
            SoulMate AI you get unlimited chatting, free AI girlfriend chat, pictures, voice messages and
            short videos — all without daily caps that ruin the mood. Want to talk to AI girlfriend at 3
            AM about life? She is wide awake and happy to listen.
          </p>

          <h3 className="text-xl font-semibold text-white pt-2">Ready to say hello?</h3>
          <p>
            Thousands of people have already met their ideal companion on SoulMate AI. Set up your free AI
            girlfriend in less than a minute and begin the connection you always wanted — no drama, no
            games, just real feelings. <span className="text-white">SoulMate AI — where love meets artificial intelligence.</span>
          </p>
        </div>
      </section>
    </>
  );
}

export default LandingSections;
