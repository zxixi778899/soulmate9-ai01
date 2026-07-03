'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/constants';
import Link from 'next/link';
import {
  Heart,
  Sparkles,
  MessageCircle,
  Menu,
  X,
  ChevronRight,
  Plus,
  Wand2,
  Star,
} from 'lucide-react';
import { AgeVerification } from '@/components/AgeVerification';
import { useAuth } from '@/components/AuthProvider';
import { useTranslation } from '@/lib/i18n/context';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

// ============ 角色定义 ============
type Character = {
  slug: string;
  name: string;
  age: number;
  tagline: string;
  shortDescription: string;
  traits: string[];
  accent: string;
  bgAccent: string;
  sceneSlug: string;
};

const CHARACTERS: Character[] = [
  {
    slug: 'luna',
    name: 'Luna',
    age: 24,
    tagline: 'Moonlit conversations, soft as silk.',
    shortDescription:
      'A bookish romantic who reads your soul between the lines. Wakes at midnight; thinks in poetry.',
    traits: ['Poetic', 'Tender', 'Soft-spoken'],
    accent: '#A78BFA',
    bgAccent: 'rgba(167,139,250,0.55)',
    sceneSlug: 'moonlit-bedroom',
  },
  {
    slug: 'ruby',
    name: 'Ruby',
    age: 22,
    tagline: 'Tokyo neon never sleeps. Neither do I.',
    shortDescription:
      'A city-rave DJ with violet eyes and a sharp tongue. Flirts in three languages, lives in two time zones.',
    traits: ['Playful', 'Spicy', 'Polyglot'],
    accent: '#FF2D78',
    bgAccent: 'rgba(255,45,120,0.55)',
    sceneSlug: 'infinity-pool-night',
  },
  {
    slug: 'summer',
    name: 'Summer',
    age: 25,
    tagline: 'Golden hour, all day, every day.',
    shortDescription:
      'A surf-instructor turned photographer. Sun on her shoulders, salt in her laugh.',
    traits: ['Sunny', 'Athletic', 'Adventurous'],
    accent: '#F59E0B',
    bgAccent: 'rgba(245,158,11,0.55)',
    sceneSlug: 'boutique-gym',
  },
  {
    slug: 'scarlet',
    name: 'Scarlet',
    age: 23,
    tagline: 'Tradition wears a crimson dress.',
    shortDescription:
      'A calligrapher from Suzhou. Tea ceremony master, classical guzheng player, speaks softly and means deeply.',
    traits: ['Elegant', 'Mysterious', 'Cultured'],
    accent: '#EF4444',
    bgAccent: 'rgba(239,68,68,0.55)',
    sceneSlug: 'onsen-spa',
  },
];

const SCENES = [
  'moonlit-bedroom',
  'infinity-pool-night',
  'boutique-gym',
  'rooftop-lounge',
  'onsen-spa',
  'penthouse-window',
];

const SUPABASE_BASE =
  'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits';

export default function SingleViewportHero() {
  const router = useRouter();
  const { user } = useAuth();

  const [activeIdx, setActiveIdx] = useState(0);
  const [sceneIdx, setSceneIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // 鼠标位置（用于全局视差 + 光斑）
  const [mouse, setMouse] = useState({ x: 0.5, y: 0.5 });
  const heroRef = useRef<HTMLElement>(null);
  const cursorTrailRef = useRef<HTMLDivElement>(null);

  // 视差更新（节流到 rAF）
  useEffect(() => {
    let raf = 0;
    let lastX = 0.5, lastY = 0.5;
    const onMove = (e: MouseEvent) => {
      if (!heroRef.current) return;
      const rect = heroRef.current.getBoundingClientRect();
      lastX = (e.clientX - rect.left) / rect.width;
      lastY = (e.clientY - rect.top) / rect.height;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          setMouse({ x: lastX, y: lastY });
          raf = 0;
        });
      }
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // 自动轮转场景
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setSceneIdx((i) => (i + 1) % SCENES.length), 8000);
    return () => clearInterval(id);
  }, [paused]);

  // 文字打字机效果 key
  const active = CHARACTERS[activeIdx];

  const handleGetStarted = () => (user ? router.push('/gallery') : router.push('/register'));
  const handleCardClick = (slug: string) => router.push(`/girlfriend/${slug}`);
  const handleCreate = () => router.push('/create');

  // 视差 transform helper
  const parallax = (depth: number) => {
    // depth: 0-1, 越大移动越多
    const dx = (mouse.x - 0.5) * depth * 40;
    const dy = (mouse.y - 0.5) * depth * 40;
    return { transform: `translate3d(${dx}px, ${dy}px, 0)` };
  };

  return (
    <>
      <AgeVerification />
      <div className="min-h-screen text-[#F0F0F5] bg-[#07070F] overflow-x-hidden">
        <NewTopNav user={user} onGetStarted={handleGetStarted} />

        <section
          ref={heroRef}
          className="relative w-full h-screen min-h-[640px] overflow-hidden cursor-crosshair"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {/* ── Layer 1: 全屏场景底图（视差移动 + 轮转） ── */}
          {SCENES.map((slug, i) => (
            <div
              key={slug}
              className="absolute inset-0 transition-opacity duration-[2000ms] ease-in-out"
              style={{ opacity: i === sceneIdx ? 1 : 0, zIndex: 1 }}
            >
              <div className="absolute inset-0" style={parallax(0.04)}>
                <Image
                  src={`${SUPABASE_BASE}/scenes/${slug}.png`}
                  alt={slug}
                  fill
                  priority={i === 0}
                  className="object-cover scale-110 animate-[heroZoom_22s_ease-in-out_infinite_alternate]"
                  sizes="100vw"
                  unoptimized
                />
              </div>
            </div>
          ))}

          {/* 整体氛围遮罩 */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background:
                'linear-gradient(90deg, rgba(7,7,15,0.78) 0%, rgba(7,7,15,0.45) 45%, rgba(7,7,15,0.15) 75%, rgba(7,7,15,0.40) 100%), linear-gradient(180deg, rgba(7,7,15,0.30) 0%, rgba(7,7,15,0.10) 30%, rgba(7,7,15,0.65) 85%, rgba(7,7,15,0.95) 100%)',
            }}
          />

          {/* 鼠标光斑（跟随移动的彩色光晕） */}
          <div
            className="absolute z-[3] pointer-events-none transition-[opacity,transform] duration-300"
            style={{
              left: `${mouse.x * 100}%`,
              top: `${mouse.y * 100}%`,
              width: 700,
              height: 700,
              transform: 'translate(-50%, -50%)',
              background: `radial-gradient(circle, ${active.bgAccent.replace('0.55', '0.30')} 0%, transparent 50%)`,
              filter: 'blur(40px)',
              mixBlendMode: 'screen',
            }}
          />

          {/* 角色 accent 氛围光 */}
          <div
            key={`glow-${active.slug}`}
            className="absolute inset-0 z-[3] animate-[ambientShift_1800ms_ease-out] pointer-events-none"
            style={{
              background: `radial-gradient(ellipse 70% 50% at 65% 55%, ${active.bgAccent} 0%, transparent 60%)`,
            }}
          />

          {/* 顶部 LIVE 状态条 */}
          <div className="absolute top-24 left-0 right-0 z-10 flex justify-center pointer-events-none">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-black/40 border border-white/[0.14] backdrop-blur-md text-[11px] font-mono-pretty tracking-[0.2em] text-[#FF6BA6] uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-[#FF2D78] animate-pulse" />
              Live · 18+ Only
            </div>
          </div>

          {/* ── Layer 3: 人物立绘（视差 + 鼠标 3D tilt） ── */}
          <div className="absolute inset-0 z-[4] pointer-events-none">
            {CHARACTERS.map((c, i) => {
              // 鼠标方向产生倾斜（仅激活的）
              const tiltX = i === activeIdx ? (mouse.y - 0.5) * -8 : 0;
              const tiltY = i === activeIdx ? (mouse.x - 0.5) * 8 : 0;
              const px = i === activeIdx ? (mouse.x - 0.5) * 12 : 0;
              const py = i === activeIdx ? (mouse.y - 0.5) * 8 : 0;
              return (
                <div
                  key={c.slug}
                  className="absolute portrait-breathe transition-all duration-[1400ms] ease-out"
                  style={{
                    opacity: i === activeIdx ? 1 : 0,
                    right: '6%',
                    bottom: '0',
                    transform: i === activeIdx
                      ? `translate3d(${px}px, ${py}px, 0) perspective(1200px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`
                      : 'translate3d(0, 40px, 0) scale(0.94)',
                    width: 'min(580px, 44vw)',
                    height: 'min(800px, 84vh)',
                    filter: i === activeIdx ? 'drop-shadow(0 35px 70px rgba(0,0,0,0.55))' : 'none',
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <Image
                    src={`${SUPABASE_BASE}/characters/${c.slug}.png`}
                    alt={c.name}
                    fill
                    priority={i === 0}
                    className="object-contain object-bottom"
                    sizes="44vw"
                    unoptimized
                  />
                  {/* 立绘底部 accent 投影 */}
                  <div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-10 blur-3xl rounded-full pointer-events-none"
                    style={{ background: c.accent, opacity: 0.45 }}
                  />
                  {/* 鼠标位置 accent 环 — 立绘胸口位置的标记 */}
                  {i === activeIdx && (
                    <div
                      className="absolute w-3 h-3 rounded-full pointer-events-none"
                      style={{
                        left: '50%',
                        top: '42%',
                        background: c.accent,
                        boxShadow: `0 0 18px ${c.accent}, 0 0 36px ${c.accent}66`,
                        animation: 'ping 2.4s cubic-bezier(0,0,0.2,1) infinite',
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Layer 2: 文字中景（视差 + 字符错位弹跳） ── */}
          <div
            className="absolute inset-0 z-[5] flex items-center pointer-events-none"
            style={parallax(0.015)}
          >
            <div className="w-full max-w-7xl mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
              <div className="md:col-span-7 lg:col-span-6 pointer-events-auto">
                <div className="max-w-[560px]">
                  {/* 角色名 — 字符错位弹跳 */}
                  <div key={`name-${active.slug}`} className="animate-[nameStomp_900ms_cubic-bezier(0.34,1.56,0.64,1)_both]">
                    <h1
                      className="font-display text-6xl md:text-7xl lg:text-[112px] font-bold italic leading-[0.88] tracking-tight"
                      style={{
                        background: `linear-gradient(180deg, #fff 0%, ${active.accent} 100%)`,
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        textShadow: `0 0 40px ${active.bgAccent}`,
                      }}
                    >
                      {active.name.split('').map((ch, i) => (
                        <span
                          key={`${active.slug}-${i}`}
                          className="inline-block"
                          style={{
                            animation: 'charBounce 600ms cubic-bezier(0.34,1.56,0.64,1) both',
                            animationDelay: `${i * 70}ms`,
                            transform: i % 2 === 0 ? 'translateY(-2px)' : 'translateY(2px)',
                          }}
                        >
                          {ch}
                        </span>
                      ))}
                    </h1>
                    <div className="mt-4 h-[2px] w-32 bg-gradient-to-r from-transparent via-[#FF2D78] to-transparent animate-[lineExpand_1100ms_ease-out]" />
                  </div>

                  {/* 标语 — 打字机 */}
                  <div
                    key={`tag-${active.slug}`}
                    className="mt-5 font-heading text-lg md:text-xl text-white/85 italic tracking-wide overflow-hidden whitespace-nowrap animate-[typeIn_1200ms_steps(40)_both]"
                    style={{ borderRight: '2px solid rgba(255,45,120,0.6)' }}
                  >
                    "{active.tagline}"
                  </div>

                  {/* 简介 — 渐显 */}
                  <p
                    key={`desc-${active.slug}`}
                    className="mt-4 font-sans text-sm md:text-[15px] text-white/65 leading-relaxed max-w-[480px] animate-[textFade_1100ms_ease-out_400ms_both]"
                  >
                    {active.shortDescription}
                  </p>

                  {/* 特质 chip */}
                  <div className="mt-5 flex flex-wrap gap-2">
                    {active.traits.map((t, i) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.06] border border-white/[0.10] backdrop-blur-md text-[11px] font-heading tracking-wider text-white/80 uppercase hover:bg-white/[0.12] transition-all cursor-default"
                        style={{
                          animation: 'chipPop 500ms cubic-bezier(0.34,1.56,0.64,1) both',
                          animationDelay: `${i * 100 + 800}ms`,
                        }}
                      >
                        <Star className="w-3 h-3" style={{ color: active.accent }} />
                        {t}
                      </span>
                    ))}
                  </div>

                  {/* CTA + 创建专属 */}
                  <div className="mt-7 flex flex-wrap items-center gap-3 pointer-events-auto">
                    <Button
                      onClick={() => handleCardClick(active.slug)}
                      size="xl"
                      className="font-heading uppercase tracking-wider shadow-[0_0_30px_rgba(255,45,120,0.4)] hover:shadow-[0_0_50px_rgba(255,45,120,0.7)] hover:scale-105 transition-all duration-300"
                      style={{ background: `linear-gradient(135deg, ${active.accent} 0%, #d946ef 100%)` }}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" />
                      Chat with {active.name}
                    </Button>
                    <Button
                      onClick={handleCreate}
                      size="xl"
                      variant="outline"
                      className="font-heading uppercase tracking-wider border-2 border-white/30 text-white hover:border-[#FF2D78] hover:bg-[#FF2D78]/10 hover:scale-105 transition-all duration-300 backdrop-blur-md group"
                    >
                      <Wand2 className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" />
                      Create Yours
                    </Button>
                  </div>

                  {/* 鼠标坐标调试指示 */}
                  <div className="mt-6 text-[10px] font-mono-pretty text-white/25 tracking-wider uppercase">
                    cursor · {Math.round(mouse.x * 100)}, {Math.round(mouse.y * 100)}
                  </div>
                </div>
              </div>

              <div className="hidden md:block md:col-span-5 lg:col-span-6" />
            </div>
          </div>

          {/* 左侧轮转指示器 */}
          <div className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-[6] flex flex-col gap-3">
            {CHARACTERS.map((c, i) => (
              <button
                key={c.slug}
                onClick={() => setActiveIdx(i)}
                className="group flex items-center gap-2 cursor-pointer"
                aria-label={c.name}
              >
                <span
                  className="block transition-all duration-500 rounded-full"
                  style={{
                    width: i === activeIdx ? 32 : 14,
                    height: 2,
                    background: i === activeIdx ? c.accent : 'rgba(255,255,255,0.25)',
                    boxShadow: i === activeIdx ? `0 0 14px ${c.accent}` : 'none',
                  }}
                />
                <span
                  className="text-[10px] font-heading tracking-[0.2em] transition-all duration-500"
                  style={{
                    color: i === activeIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                    opacity: i === activeIdx ? 1 : 0,
                    transform: i === activeIdx ? 'translateX(0)' : 'translateX(-8px)',
                  }}
                >
                  {c.name.toUpperCase()}
                </span>
              </button>
            ))}
          </div>

          {/* ── Layer 4: 底部轮转女友卡（hover scale 1.5 + 3D tilt） ── */}
          <div className="absolute bottom-6 md:bottom-8 left-0 right-0 z-[7] flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex items-end gap-3 md:gap-5 px-6 max-w-[100vw] overflow-x-auto scrollbar-none pb-2">
              {CHARACTERS.map((c, i) => (
                <CharacterCard
                  key={c.slug}
                  c={c}
                  active={i === activeIdx}
                  onClick={() => setActiveIdx(i)}
                  mouse={mouse}
                />
              ))}
            </div>
          </div>

          {/* 右侧场景轮转指示器 */}
          <div className="absolute right-6 bottom-32 z-[6] hidden lg:flex flex-col gap-2">
            {SCENES.map((slug, i) => (
              <span
                key={slug}
                className="block rounded-full transition-all duration-500"
                style={{
                  width: 3,
                  height: i === sceneIdx ? 18 : 6,
                  background: i === sceneIdx ? active.accent : 'rgba(255,255,255,0.25)',
                  boxShadow: i === sceneIdx ? `0 0 8px ${active.accent}` : 'none',
                }}
              />
            ))}
          </div>

          {/* 鼠标轨迹粒子容器（绝对定位，跟随鼠标生成粒子） */}
          <CursorTrail targetRef={heroRef} accent={active.accent} />
        </section>
      </div>
    </>
  );
}

// ===============================================================
// 角色卡 — 鼠标 3D tilt + hover scale 1.5
// ===============================================================
function CharacterCard({
  c,
  active,
  onClick,
  mouse,
}: {
  c: Character;
  active: boolean;
  onClick: () => void;
  mouse: { x: number; y: number };
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [local, setLocal] = useState({ x: 0, y: 0 });

  const onMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setLocal({
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    });
  };

  const tiltX = (local.y - 0.5) * -16;
  const tiltY = (local.x - 0.5) * 16;
  const glowX = local.x * 100;
  const glowY = local.y * 100;

  return (
    <button
      ref={ref}
      onClick={onClick}
      onMouseMove={onMove}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setLocal({ x: 0.5, y: 0.5 });
      }}
      className="card-zoom group relative origin-bottom"
      style={{
        width: 'min(140px, 22vw)',
        aspectRatio: '3 / 4',
        '--card-accent': c.accent,
        '--card-glow': `${c.accent}66`,
        transform: hover
          ? `scale(1.5) perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`
          : active
            ? 'scale(1.08) perspective(900px) rotateX(0deg) rotateY(0deg)'
            : 'scale(1) perspective(900px) rotateX(0deg) rotateY(0deg)',
        transformStyle: 'preserve-3d',
        transition: 'transform 0.55s cubic-bezier(0.22, 0.61, 0.36, 1)',
        zIndex: hover ? 40 : active ? 5 : 1,
      } as React.CSSProperties}
    >
      <div
        className={`relative w-full h-full rounded-2xl overflow-hidden border ${
          active ? 'card-glow-active border-white/40' : 'border-white/[0.10]'
        }`}
        style={{
          background: `linear-gradient(160deg, ${c.accent} 0%, ${c.accent}88 50%, #1a1a2e 100%)`,
        }}
      >
        <Image
          src={`${SUPABASE_BASE}/characters/${c.slug}.png`}
          alt={c.name}
          fill
          className="object-contain object-bottom"
          sizes="140px"
          unoptimized
        />

        {/* 鼠标光斑 */}
        {hover && (
          <div
            className="absolute inset-0 pointer-events-none mix-blend-screen"
            style={{
              background: `radial-gradient(circle 80px at ${glowX}% ${glowY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`,
            }}
          />
        )}

        <div className="absolute top-2 left-2 inline-flex items-center gap-1 bg-black/50 backdrop-blur-md border border-white/20 rounded-full px-1.5 py-0.5 text-[8px] font-mono-pretty text-white tracking-wider uppercase">
          <span
            className="w-1 h-1 rounded-full animate-pulse"
            style={{ background: c.accent }}
          />
          Live
        </div>

        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronRight className="w-3.5 h-3.5 text-white" />
        </div>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent pt-10 pb-2 px-2">
          <div className="font-display text-base font-bold italic text-white tracking-tight leading-none">
            {c.name}
          </div>
          <div className="text-[8px] text-white/60 font-mono-pretty mt-0.5 tracking-wider">
            {c.age} · {c.traits[0]}
          </div>
        </div>
      </div>
    </button>
  );
}

// ===============================================================
// 鼠标轨迹粒子 — 每 ~80ms 在鼠标位置放一个发光点，自动 fade
// ===============================================================
function CursorTrail({
  targetRef,
  accent,
}: {
  targetRef: React.RefObject<HTMLElement>;
  accent: string;
}) {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; t: number; c: string }[]>([]);
  const lastSpawn = useRef(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!targetRef.current) return;
      const r = targetRef.current.getBoundingClientRect();
      // 只在 hero 区域内生成
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      const now = Date.now();
      if (now - lastSpawn.current < 60) return;
      lastSpawn.current = now;
      const id = now + Math.random();
      setParticles((prev) => [
        ...prev.slice(-12),
        {
          id,
          x: e.clientX - r.left,
          y: e.clientY - r.top,
          t: now,
          c: accent,
        },
      ]);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [targetRef, accent]);

  // 清理旧粒子
  useEffect(() => {
    const id = setInterval(() => {
      const cutoff = Date.now() - 900;
      setParticles((prev) => prev.filter((p) => p.t > cutoff));
    }, 200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none">
      {particles.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: p.x,
            top: p.y,
            width: 8,
            height: 8,
            background: p.c,
            boxShadow: `0 0 12px ${p.c}, 0 0 24px ${p.c}66`,
            animation: 'particleFade 900ms ease-out forwards',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
    </div>
  );
}

// ===============================================================
// 全新导航 — 顶部毛玻璃 pill
// ===============================================================
function NewTopNav({
  user,
  onGetStarted,
}: {
  user: any;
  onGetStarted: () => void;
}) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <div className="mx-auto max-w-7xl px-4 md:px-6 mt-4">
        <div className="flex items-center justify-between h-14 px-4 md:px-6 rounded-2xl bg-[#0c0c18]/70 backdrop-blur-2xl border border-white/[0.08] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#FF2D78] via-[#d946ef] to-[#8b5cf6] flex items-center justify-center shadow-[0_0_18px_rgba(255,45,120,0.45)] animate-[heartbeat_3s_ease-in-out_infinite]">
              <Heart className="w-4 h-4 text-white fill-white" />
            </div>
            <span className="font-display text-base font-bold tracking-tight text-white">
              {APP_NAME}
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {[
              { href: '/', label: 'Home', active: true },
              { href: '/gallery', label: 'Companions' },
              { href: '/pricing', label: 'Pricing' },
              { href: '/explore', label: 'Explore' },
            ].map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={
                  'px-3.5 py-1.5 text-[13px] font-heading tracking-wide rounded-full transition-all ' +
                  (it.active
                    ? 'text-white bg-white/[0.08] border border-white/[0.10]'
                    : 'text-white/55 hover:text-white hover:bg-white/[0.04]')
                }
              >
                {it.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="hidden sm:inline-flex items-center gap-1 text-[13px] font-heading text-white/65 hover:text-white px-3 py-1.5 hover:bg-white/[0.06] rounded-full transition-all"
            >
              <Wand2 className="w-3.5 h-3.5" />
              Create
            </Link>
            <Link
              href="/login"
              className="hidden sm:inline-flex text-[13px] font-heading text-white/65 hover:text-white px-3 py-1.5"
            >
              Sign In
            </Link>
            <Button
              onClick={onGetStarted}
              size="sm"
              className="font-heading text-[13px] tracking-wide h-9 px-4 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#d946ef] shadow-[0_0_20px_rgba(255,45,120,0.4)] hover:shadow-[0_0_30px_rgba(255,45,120,0.6)] hover:scale-105 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Get Started
            </Button>

            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <button className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/70">
                    <Menu className="w-4 h-4" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] bg-[#0c0c18]/95 backdrop-blur-2xl border-l border-white/[0.08]">
                  <div className="flex items-center justify-between mt-4 mb-8">
                    <span className="font-display text-base font-bold">{APP_NAME}</span>
                    <X className="w-5 h-5 text-white/60" />
                  </div>
                  <div className="flex flex-col gap-1">
                    {[
                      { href: '/', label: 'Home' },
                      { href: '/gallery', label: 'Companions' },
                      { href: '/pricing', label: 'Pricing' },
                      { href: '/explore', label: 'Explore' },
                      { href: '/create', label: 'Create Yours' },
                    ].map((it) => (
                      <Link
                        key={it.href}
                        href={it.href}
                        className="px-4 py-3 text-sm rounded-xl text-white/75 hover:bg-white/[0.06]"
                      >
                        {it.label}
                      </Link>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}