'use client';

// ============ 角色定义 ============
// 注：本页为硬编码营销内容（CHARACTERS 数据不查 DB）。
// 真正的公开女友列表走 /girlfriend/[slug]（已是 SSR + ISR）。
// 当前首页以交互为主（Age / Auth modal / Mobile menu），保持 client。
// 如需 SEO + 首屏加速，最优做法：
//   1. 把 CHARACTERS 静态部分提到 src/data/marketing-characters.ts
//   2. 新建 src/app/_home/StaticHero.tsx 作为 server component 渲染
//   3. 客户端只包 <Sheet> / <AgeVerification> / <HeroAuthButton>
// 留作未来重构；本次修复优先聚焦 P0 安全/合规。

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
  // 随机新角色（测试走马灯 14 张卡的整体效果）
  // 全部使用现有 6 个 scene 之一作卡图
  {
    slug: 'mira',
    name: 'Mira',
    age: 23,
    tagline: 'Lost in Tokyo neon, found in your voice.',
    shortDescription: 'A street photographer chasing midnight glow. Soft heart, sharp lens.',
    traits: ['Creative', 'Curious', 'Dramatic'],
    accent: '#EC4899',
    bgAccent: 'rgba(236,72,153,0.55)',
    sceneSlug: 'infinity-pool-night',
  },
  {
    slug: 'aria',
    name: 'Aria',
    age: 25,
    tagline: 'Music is the language of the soul.',
    shortDescription: 'A jazz pianist who plays until sunrise. Romance in every chord.',
    traits: ['Melodic', 'Romantic', 'Charming'],
    accent: '#8B5CF6',
    bgAccent: 'rgba(139,92,246,0.55)',
    sceneSlug: 'rooftop-lounge',
  },
  {
    slug: 'nova',
    name: 'Nova',
    age: 22,
    tagline: 'Dreams written in starlight.',
    shortDescription: 'An astronomy student by day, dreamer by night. Eyes full of galaxies.',
    traits: ['Mysterious', 'Dreamy', 'Sweet'],
    accent: '#3B82F6',
    bgAccent: 'rgba(59,130,246,0.55)',
    sceneSlug: 'moonlit-bedroom',
  },
  {
    slug: 'kira',
    name: 'Kira',
    age: 26,
    tagline: 'Sword and silk, fire and grace.',
    shortDescription: 'A modern kendo champion. Fierce focus, gentle heart underneath.',
    traits: ['Strong', 'Loyal', 'Disciplined'],
    accent: '#DC2626',
    bgAccent: 'rgba(220,38,38,0.55)',
    sceneSlug: 'onsen-spa',
  },
  {
    slug: 'lyra',
    name: 'Lyra',
    age: 24,
    tagline: 'Strings of fate, woven with melody.',
    shortDescription: 'A concert violinist. Her bow dances on moonlit stages.',
    traits: ['Elegant', 'Sensitive', 'Artistic'],
    accent: '#A855F7',
    bgAccent: 'rgba(168,85,247,0.55)',
    sceneSlug: 'penthouse-window',
  },
  {
    slug: 'sage',
    name: 'Sage',
    age: 27,
    tagline: 'Whisper, and the forest listens.',
    shortDescription: 'A herbalist who talks to plants. Calm, observant, quietly fierce.',
    traits: ['Calm', 'Wise', 'Grounded'],
    accent: '#10B981',
    bgAccent: 'rgba(16,185,129,0.55)',
    sceneSlug: 'boutique-gym',
  },
  {
    slug: 'ember',
    name: 'Ember',
    age: 23,
    tagline: 'Burning bright, loving fierce.',
    shortDescription: 'A stunt double with a heart of gold. Dares everything, fears nothing.',
    traits: ['Bold', 'Adventurous', 'Passionate'],
    accent: '#F97316',
    bgAccent: 'rgba(249,115,22,0.55)',
    sceneSlug: 'rooftop-lounge',
  },
  {
    slug: 'jasmine',
    name: 'Jasmine',
    age: 22,
    tagline: 'Sweet as sugar, sharp as spice.',
    shortDescription: 'A pastry chef who burns everything but croissants. Sweet and clumsy.',
    traits: ['Sweet', 'Clumsy', 'Warm'],
    accent: '#FB7185',
    bgAccent: 'rgba(251,113,133,0.55)',
    sceneSlug: 'moonlit-bedroom',
  },
  {
    slug: 'morgana',
    name: 'Morgana',
    age: 28,
    tagline: 'Mistress of mystery, queen of cards.',
    shortDescription: 'A professional poker player. Reads everyone, reveals nothing.',
    traits: ['Clever', 'Mysterious', 'Confident'],
    accent: '#6366F1',
    bgAccent: 'rgba(99,102,241,0.55)',
    sceneSlug: 'infinity-pool-night',
  },
  {
    slug: 'aria-w',
    name: 'Wren',
    age: 21,
    tagline: 'Tiny bird, mighty song.',
    shortDescription: 'A indie singer-songwriter. Plucks guitar, writes poetry, steals hearts.',
    traits: ['Creative', 'Free', 'Vulnerable'],
    accent: '#F59E0B',
    bgAccent: 'rgba(245,158,11,0.55)',
    sceneSlug: 'penthouse-window',
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
  const heroRef = useRef<HTMLElement | null>(null);
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
                  className="object-cover scale-100"
                  sizes="100vw"
                  unoptimized
                />
              </div>
            </div>
          ))}

          {/* 整体氛围遮罩（减弱 30% 让背景更清晰） */}
          <div
            className="absolute inset-0 z-[2]"
            style={{
              background:
                'linear-gradient(90deg, rgba(7,7,15,0.55) 0%, rgba(7,7,15,0.30) 45%, rgba(7,7,15,0.10) 75%, rgba(7,7,15,0.30) 100%), linear-gradient(180deg, rgba(7,7,15,0.20) 0%, rgba(7,7,15,0.08) 30%, rgba(7,7,15,0.50) 85%, rgba(7,7,15,0.70) 100%)',
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

          {/* ── Layer 3: 人物立绘（主视觉 · 居中偏右 · z=8） ── */}
          <div className="absolute inset-0 z-[8] pointer-events-none">
            {CHARACTERS.map((c, i) => {
              // 鼠标方向产生倾斜（仅激活的）
              const tiltX = i === activeIdx ? (mouse.y - 0.5) * -8 : 0;
              const tiltY = i === activeIdx ? (mouse.x - 0.5) * 8 : 0;
              const px = i === activeIdx ? (mouse.x - 0.5) * 12 : 0;
              const py = i === activeIdx ? (mouse.y - 0.5) * 8 : 0;
              return (
                <div
                  key={c.slug}
                  className="absolute transition-all duration-[1400ms] ease-out w-[547px] h-[702px]"
                  style={{
                    opacity: i === activeIdx ? 1 : 0,
                    top: '50%',
                    left: '60%',
                    // 避免 `calc(... + 0px)` 这种 CSS spec 不接受的表达式
                    // px===0 时直接用 -50%
                    transform: i === activeIdx
                      ? (px === 0 && py === 0
                        ? 'translate(-50%, -50%)'
                        : `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`)
                      : 'translate(-50%, calc(-50% + 40px)) scale(0.94)',
                    filter: i === activeIdx ? 'drop-shadow(0 35px 70px rgba(0,0,0,0.55))' : 'none',
                    transformOrigin: 'center bottom',
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
                      className="font-display text-6xl md:text-7xl lg:text-[112px] font-extrabold italic leading-[0.88] tracking-tight"
                      style={{
                        // 实色白字 + 小幅 accent glow（之前用 bg-clip-text + 透明 fill
                        // 在某些渲染下字形完全消失，只剩模糊光晕）
                        color: '#ffffff',
                        textShadow: `0 0 20px ${active.bgAccent}, 0 4px 16px rgba(0,0,0,0.6)`,
                        WebkitTextFillColor: '#ffffff',
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

          {/* ── Layer 4: 底部女友卡（5 张等比铺满 nav pill 宽，300px 高，可前后拖动） ── */}
          <MarqueeRow
            characters={CHARACTERS}
            activeIdx={activeIdx}
            setActiveIdx={setActiveIdx}
          />

          {/* 鼠标轨迹粒子容器（绝对定位，跟随鼠标生成粒子） */}
          <CursorTrail targetRef={heroRef} accent={active.accent} />
        </section>
      </div>
    </>
  );
}

// ===============================================================
// 女友卡走马灯 — 5 张等比铺满 nav pill 宽（x=80, right=1360, 宽 1280）
// 每张 248px + 4 gap × 8px = 1280（卡宽自适应到 5 张总宽 = nav pill 宽）
// 高度 300px（3:4 比例）
// 默认位置：5 张首尾相接，起点 x=80
// 走马灯：JS setInterval 每帧 scrollX 减少 0.5px，无缝循环（复制 1 份做无限）
// hover 任意卡 → 暂停 + 放大 1.2x + 上移
// 鼠标拖动 → 手动滚动（pointer events）
// 点击 → setActiveIdx（轮转仍继续）
// ===============================================================
function MarqueeRow({
  characters,
  activeIdx,
  setActiveIdx,
}: {
  characters: Character[];
  activeIdx: number;
  setActiveIdx: (i: number) => void;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  // 复制 1 份做无缝循环：5 张 → 10 张
  const totalOriginal = characters.length;
  const totalDoubled = totalOriginal * 2;
  // 5 张等比铺满 nav pill 宽（x=80, right=1360, 总宽 1280）
  // 卡宽 = (1280 - 4*8) / 5 = 247.2（无论总角色数，可见 5 张铺满 nav pill 宽）
  // 14 张角色只有 5 张可见 + 9 张在 marquee 滚动中
  const navPadLeft = 80;
  const navWidth = 1280;
  const VISIBLE_CARDS = 5;
  const cardGap = 8;
  const cardWidth = (navWidth - (VISIBLE_CARDS - 1) * cardGap) / VISIBLE_CARDS;
  const cardHeight = 300; // 固定 300px（用户指定）
  // 走马灯位移状态（hover 时暂停）
  const [scrollX, setScrollX] = useState(0);
  useEffect(() => {
    if (hoverIdx !== null) return;
    const id = setInterval(() => {
      setScrollX((x) => {
        // 一个循环单位 = 5 张总宽（single pass）= cardWidth * 5 + gap * 4
        const singleUnit = cardWidth * totalOriginal + cardGap * (totalOriginal - 1);
        const next = x - 0.5; // 每帧 -0.5px ≈ 30px/s
        if (next <= -singleUnit) return 0;
        return next;
      });
    }, 33);
    return () => clearInterval(id);
  }, [hoverIdx, cardWidth, totalOriginal]);

  // 鼠标拖动（pointer events）
  const dragStartX = useRef(0);
  const dragStartScrollX = useRef(0);
  const isDragging = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartScrollX.current = scrollX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    let next = dragStartScrollX.current + dx;
    // wrap
    const singleUnit = cardWidth * totalOriginal + cardGap * (totalOriginal - 1);
    while (next > 0) next -= singleUnit;
    while (next <= -singleUnit) next += singleUnit;
    setScrollX(next);
  };
  const onPointerUp = () => { isDragging.current = false; };

  return (
    <div
      className="absolute bottom-0 left-0 right-0 z-[9] pointer-events-none"
      style={{ height: cardHeight + 24 }}
    >
      <div
        className="pointer-events-auto relative w-full overflow-visible select-none"
        style={{ height: cardHeight + 24, cursor: isDragging.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <div
          ref={trackRef}
          className="absolute bottom-0 flex"
          style={{
            gap: cardGap,
            paddingLeft: navPadLeft,
            width: trackRef.current?.offsetWidth || navWidth + 200,
            transform: `translateX(${scrollX}px)`,
          }}
        >
          {[...characters, ...characters].map((c, i) => {
            const slotIdx = i % totalOriginal;
            const isHovered = hoverIdx === i;
            const isActive = activeIdx === slotIdx;
            return (
              <div
                key={`${c.slug}-${i}`}
                className="flex-shrink-0"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  transform: isHovered
                    ? `scale(1.2) translateY(-16px)`
                    : isActive
                      ? `scale(1.04)`
                      : 'scale(1)',
                  transformOrigin: 'center bottom',
                  transition: 'transform 0.35s cubic-bezier(0.22, 0.61, 0.36, 1)',
                  zIndex: isHovered ? 50 : isActive ? 10 : 1,
                }}
                onMouseEnter={() => setHoverIdx(i)}
              >
                <CharacterCard
                  c={c}
                  active={isActive}
                  onClick={() => setActiveIdx(slotIdx)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===============================================================
// 角色卡（走马灯用）— 用 characters/{slug}.png（透明立绘 PNG）
// ===============================================================
function CharacterCard({
  c,
  active,
  onClick,
}: {
  c: Character;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative w-full h-full origin-bottom"
      style={{
        '--card-accent': c.accent,
        '--card-glow': `${c.accent}66`,
        boxShadow: active
          ? `0 0 0 2px ${c.accent}, 0 12px 32px ${c.accent}55`
          : '0 6px 18px rgba(0,0,0,0.4)',
      } as React.CSSProperties}
    >
      {/* 卡图：cards/{slug}.png（RunPod 生成的有背景实景图，与背景 scenes 图分开） */}
      <div className="absolute inset-0">
        <Image
          src={`${SUPABASE_BASE}/cards/${c.slug}.png`}
          alt={c.name}
          fill
          className="object-cover"
          sizes="248px"
          unoptimized
          onError={(e) => {
            // 卡图未生成时回退到 scenes 图
            const target = e.target as HTMLImageElement;
            if (!target.dataset.fallback) {
              target.dataset.fallback = '1';
              target.src = `${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''}/storage/v1/object/public/portraits/scenes/${c.sceneSlug}.png`;
            }
          }}
        />
      </div>

      {/* 底部名字条 */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/55 to-transparent pt-8 pb-2 px-2">
        <div className="text-white text-[14px] font-bold tracking-tight leading-none text-center">
          {c.name}
        </div>
        <div className="text-[9px] text-white/65 font-mono-pretty mt-0.5 text-center tracking-wider">
          {c.age} · {c.traits[0]}
        </div>
      </div>

      {/* Live 角标 */}
      <div className="absolute top-2 left-2 inline-flex items-center gap-0.5 bg-black/60 backdrop-blur-sm border border-white/20 rounded-full px-1.5 py-0.5 text-[8px] font-mono-pretty text-white tracking-wider uppercase">
        <span
          className="w-1 h-1 rounded-full animate-pulse"
          style={{ background: c.accent }}
        />
        Live
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
  targetRef: React.RefObject<HTMLElement | null>;
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