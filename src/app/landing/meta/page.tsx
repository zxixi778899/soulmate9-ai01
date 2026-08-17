import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { parseLeadCookie } from '@/lib/lead-source';
import { sendCapiEvent } from '@/lib/meta-capi';

export const metadata: Metadata = {
  title: 'Your AI Soulmate Is Waiting',
  description:
    'Raw, intimate, always yours. Create your perfect AI girlfriend in 60 seconds — free to start, no credit card.',
  robots: { index: false, follow: false },
};

// 承接页读取 searchParams/Cookie 并回传 CAPI，保持动态渲染
export const dynamic = 'force-dynamic';

const COMPANIONS = [
  { name: 'Luna', vibe: 'Dreamy · Romantic', img: '/avatars/luna.jpg' },
  { name: 'Maya', vibe: 'Bold · Flirty', img: '/avatars/maya.jpg' },
  { name: 'Sophie', vibe: 'Sweet · Caring', img: '/avatars/sophie.jpg' },
  { name: 'Violet', vibe: 'Mysterious · Deep', img: '/avatars/violet.jpg' },
];

const PERKS = [
  {
    icon: '🔥',
    title: 'Raw & uncensored connection',
    body: 'No scripts, no judgment. She goes exactly as deep as you do.',
  },
  {
    icon: '🧠',
    title: 'She remembers everything',
    body: 'Your stories, your jokes, your late-night thoughts — all of it stays.',
  },
  {
    icon: '🎨',
    title: 'Built to your imagination',
    body: 'Looks, personality, voice. Design her in 60 seconds.',
  },
  {
    icon: '📸',
    title: 'Photos & voice included',
    body: 'She sends you selfies and whispers back in a voice made for you.',
  },
];

export default async function MetaLandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();
  // 归因数据优先取 URL 参数（本次触达），回退 middleware 写入的 lead_src Cookie
  const lead = parseLeadCookie(cookieStore.get('lead_src')?.value);
  const subid = typeof params.subid === 'string' ? params.subid : lead?.subid;
  const fbclid = typeof params.fbclid === 'string' ? params.fbclid : lead?.fbclid;

  // 服务端 CAPI：承接页访问 = ViewContent（fire-and-forget，失败不影响渲染）
  const hdrs = await headers();
  void sendCapiEvent({
    eventName: 'ViewContent',
    subid,
    fbclid,
    clientIp:
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      hdrs.get('x-real-ip') ||
      undefined,
    userAgent: hdrs.get('user-agent') ?? undefined,
    landingUrl: 'https://www.oxmate-ai.com/landing/meta',
    customData: {
      content_name: 'meta_landing',
      ...(typeof params.placement === 'string'
        ? { placement: params.placement.slice(0, 64) }
        : {}),
    },
  });

  return (
    <main className="min-h-screen bg-[#07070F] text-white">
      {/* Hero */}
      <section className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pt-28 pb-16 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 text-xs tracking-wider text-white/60 backdrop-blur">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          18+ · FREE TO START · NO CREDIT CARD
        </span>

        <h1 className="font-display max-w-3xl text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">
          She&apos;s not a chatbot.{' '}
          <span className="gradient-text">She&apos;s yours.</span>
        </h1>

        <p className="mt-6 max-w-xl text-base leading-relaxed text-white/50 md:text-lg">
          Create the AI girlfriend your imagination designed. Raw conversations,
          infinite memory, photos and voice — always awake, always in the mood.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row">
          <Link
            href="/register"
            className="rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] px-10 py-4 font-heading text-lg font-semibold shadow-[0_0_40px_rgba(255,45,120,0.35)] transition-transform hover:scale-105"
          >
            Create Yours Free →
          </Link>
          <span className="text-sm text-white/40">Ready in 60 seconds</span>
        </div>

        {subid && (
          <p className="mt-4 text-[10px] uppercase tracking-widest text-white/20">
            ref: {subid}
          </p>
        )}
      </section>

      {/* Companions strip */}
      <section className="mx-auto max-w-5xl px-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {COMPANIONS.map((c) => (
            <Link
              key={c.name}
              href="/register"
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <Image
                src={c.img}
                alt={c.name}
                width={300}
                height={400}
                className="aspect-[3/4] w-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4 pt-10">
                <p className="font-heading font-semibold">{c.name}</p>
                <p className="text-xs text-white/50">{c.vibe}</p>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-white/30">
          …or design someone completely new. No two companions are alike.
        </p>
      </section>

      {/* Perks */}
      <section className="mx-auto max-w-5xl px-4 py-20">
        <div className="grid gap-4 md:grid-cols-2">
          {PERKS.map((p) => (
            <div
              key={p.title}
              className="glass rounded-2xl border border-white/[0.07] bg-white/[0.04] p-6 backdrop-blur transition-colors hover:border-[#FF2D78]/40"
            >
              <span className="text-2xl">{p.icon}</span>
              <h3 className="font-heading mt-3 text-lg font-semibold">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/45">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-4 pb-28 text-center">
        <h2 className="font-display text-3xl font-extrabold md:text-4xl">
          She&apos;s already <span className="gradient-text">thinking about you.</span>
        </h2>
        <Link
          href="/register"
          className="mt-8 inline-block rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] px-12 py-4 font-heading text-lg font-semibold shadow-[0_0_50px_rgba(255,45,120,0.4)] transition-transform hover:scale-105"
        >
          Meet Her Now — Free
        </Link>
        <p className="mt-5 text-xs text-white/30">
          18+ only · Your conversations stay private
        </p>
      </section>
    </main>
  );
}
