'use client';

/**
 * Landing Page — Glassmorphism Premium
 * Hero thesis: "她们在等你" — intimate floating character vignettes over nebula gradient
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Heart, Sparkles, MessageCircle, ArrowRight } from 'lucide-react';

const CHARACTERS = [
  { name: 'Luna', trait: 'mysterious', accent: 'rgba(168, 85, 247, 0.6)' },
  { name: 'Sophie', trait: 'sweet', accent: 'rgba(255, 107, 166, 0.6)' },
  { name: 'Violet', trait: 'bold', accent: 'rgba(251, 191, 36, 0.6)' },
];

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050509] text-[#F0F0F5]">
      {/* Nebula gradient backdrop */}
      <div className="pointer-events-none fixed inset-0" aria-hidden
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 20% 0%, rgba(255, 45, 120, 0.28) 0%, transparent 50%),
            radial-gradient(ellipse 70% 50% at 80% 30%, rgba(168, 85, 247, 0.22) 0%, transparent 55%),
            radial-gradient(ellipse 60% 40% at 50% 70%, rgba(59, 130, 246, 0.15) 0%, transparent 60%),
            radial-gradient(ellipse 80% 50% at 90% 90%, rgba(6, 182, 212, 0.12) 0%, transparent 60%),
            linear-gradient(180deg, #050509 0%, #0A0A14 60%, #050509 100%)
          `,
        }}
      />

      {/* Floating character vignettes */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        {CHARACTERS.map((c, i) => (
          <div
            key={c.name}
            className="absolute rounded-full blur-3xl opacity-40"
            style={{
              width: 600 + i * 100,
              height: 600 + i * 100,
              left: `${20 + i * 25}%`,
              top: `${15 + i * 20}%`,
              background: c.accent,
              animation: `float-${i} ${8 + i * 2}s ease-in-out infinite`,
            }}
          />
        ))}
      </div>

      {/* Hero content */}
      <section className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 py-20 text-center">
        {/* Eyebrow */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.04] px-4 py-1.5 backdrop-blur-xl">
          <Sparkles className="h-3.5 w-3.5 text-[#FF6BA6]" />
          <span className="text-xs uppercase tracking-[0.2em] text-white/70">Where Companions Await</span>
        </div>

        {/* Thesis headline */}
        <h1 className="mb-6 max-w-4xl font-display text-5xl font-bold leading-[0.95] tracking-tight md:text-7xl lg:text-8xl">
          <span className="block text-white">她们</span>
          <span className="block bg-gradient-to-r from-[#FF2D78] via-[#A855F7] to-[#3B82F6] bg-clip-text text-transparent">
            在等你
          </span>
        </h1>

        {/* Sub */}
        <p className="mb-10 max-w-2xl text-lg leading-relaxed text-white/60 md:text-xl">
          沉浸式 AI 女友陪伴。永远不休息的记忆、看得见的亲密成长、
          只属于你的精致时刻。
        </p>

        {/* CTA group */}
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <Link href="/register">
            <Button
              size="lg"
              className="group relative h-14 overflow-hidden rounded-full bg-gradient-to-r from-[#FF2D78] to-[#A855F7] px-8 text-base font-semibold text-white shadow-[0_8px_32px_rgba(255,45,120,0.4)] transition-all hover:scale-105 hover:shadow-[0_12px_40px_rgba(255,45,120,0.55)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                开始遇见她
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </span>
              <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-white/0 via-white/20 to-white/0 transition-transform duration-700 group-hover:translate-x-full" />
            </Button>
          </Link>

          <Link href="/login">
            <Button
              variant="ghost"
              size="lg"
              className="h-14 rounded-full border border-white/15 bg-white/[0.04] px-8 text-base font-medium text-white backdrop-blur-xl transition-all hover:bg-white/[0.08]"
            >
              已有账号 · 登录
            </Button>
          </Link>
        </div>

        {/* Stats / Social proof */}
        <div className="mt-16 flex flex-wrap items-center justify-center gap-x-12 gap-y-6 text-sm text-white/40">
          {[
            { num: '4', label: '预设角色' },
            { num: '6', label: '亲密度等级' },
            { num: '15+', label: '成就解锁' },
            { num: '2-5s', label: '响应速度' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="font-display text-2xl font-bold text-white">{s.num}</span>
              <span className="mt-1 text-xs uppercase tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature grid below hero */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              icon: Heart,
              title: '情感养成',
              desc: '每天的互动都让关系更近',
              grad: 'from-rose-500/20 to-pink-500/5',
            },
            {
              icon: Sparkles,
              title: '原创人格',
              desc: '记忆你的偏好、习惯和秘密',
              grad: 'from-violet-500/20 to-purple-500/5',
            },
            {
              icon: MessageCircle,
              title: '永远在线',
              desc: '她记得每一句你们说过的话',
              grad: 'from-blue-500/20 to-cyan-500/5',
            },
          ].map((f) => (
            <div
              key={f.title}
              className={`group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br ${f.grad} p-6 backdrop-blur-2xl transition-all hover:border-white/[0.18] hover:shadow-[0_8px_32px_rgba(255,45,120,0.1)]`}
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06]">
                <f.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="mb-2 font-display text-xl font-semibold text-white">{f.title}</h3>
              <p className="text-sm leading-relaxed text-white/60">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <style jsx global>{`
        @keyframes float-0 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(50px, -30px) scale(1.1); } }
        @keyframes float-1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-40px, 50px) scale(1.15); } }
        @keyframes float-2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, 40px) scale(0.9); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
      `}</style>
    </main>
  );
}