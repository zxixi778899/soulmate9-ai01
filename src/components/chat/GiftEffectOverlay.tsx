'use client';

/**
 * Douyin-style live-room gift stage (portaled to document.body so chat overflow never clips it).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChatGift, GiftEffectType } from '@/lib/gifts/catalog';
import { isSvgaUrl } from '@/lib/gifts/catalog';
import { cn } from '@/lib/utils';
import { SvgaPlayer } from '@/components/chat/SvgaPlayer';

export type GiftBurstState = {
  gift: ChatGift;
  combo: number;
  key: number;
  senderName?: string;
};

type Particle = {
  id: number;
  left: number;
  delay: number;
  duration: number;
  size: number;
  emoji: string;
  color: string;
  dx: number;
  dy: number;
};

function buildParticles(
  type: GiftEffectType,
  emoji: string,
  colors: string[],
  intensity: number,
  countHint?: number,
): Particle[] {
  const base =
    countHint ??
    (type === 'castle' || type === 'fireworks' || type === 'float_emoji'
      ? 40
      : type === 'heart_rain' || type === 'rose_petals' || type === 'gold_shower'
        ? 36
        : 28);
  const n = Math.round(base * Math.min(1.4, Math.max(0.5, intensity)));
  const palette = colors.length ? colors : ['#ff2e88', '#c026d3', '#fbbf24'];
  const emojis =
    type === 'heart_rain'
      ? ['💕', '💖', '💗', '❤️']
      : type === 'rose_petals'
        ? ['🌹', '🌸', '🌺']
        : type === 'gold_shower'
          ? ['✨', '⭐', '💫', '🪙']
          : type === 'confetti'
            ? ['🎊', '✨', '🎉', '★']
            : type === 'fireworks'
              ? ['💥', '✨', '🌟']
              : [emoji, '✨', emoji, '💖'];

  return Array.from({ length: n }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    duration: 1.2 + Math.random() * 1.6,
    size: 16 + Math.random() * 20 * intensity,
    emoji: emojis[i % emojis.length],
    color: palette[i % palette.length],
    dx: (Math.random() - 0.5) * 120,
    dy: -40 - Math.random() * 100,
  }));
}

export function GiftEffectOverlay({
  burst,
  onDone,
}: {
  burst: GiftBurstState | null;
  onDone?: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [svgaFailed, setSvgaFailed] = useState(false);
  const [svgaReady, setSvgaReady] = useState(false);
  const [bannerIn, setBannerIn] = useState(false);
  const onDoneRef = useRef(onDone);
  const finishedKeyRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const gift = burst?.gift;
  const combo = burst?.combo || 1;
  const burstKey = burst?.key ?? 0;
  const duration =
    gift?.effect_config?.duration_ms ?? (isSvgaUrl(gift?.effect_asset_url) ? 4200 : 2800);
  const intensity = gift?.effect_config?.intensity ?? 0.85;
  const colors = gift?.effect_config?.colors || ['#ff2e88', '#c026d3', '#fbbf24'];
  const type: GiftEffectType = gift?.effect_type || 'float_emoji';
  const emoji = gift?.emoji || '🎁';
  const asset = gift?.effect_asset_url || null;
  const wantsSvga = Boolean(asset && isSvgaUrl(asset));
  const useSvga = wantsSvga && !svgaFailed;
  const useRasterAsset = Boolean(
    asset && !isSvgaUrl(asset) && /\.(gif|webp|png|jpg|jpeg|webm|mp4)(\?|$)/i.test(asset),
  );

  // SVGA needs a longer hard ceiling — complex Douyin gifts are 6–15s of animation.
  // For non-SVGA effects the original short ceiling is fine (CSS particles complete in ~3s).
  const fallbackFinishMs = useSvga
    ? Math.max(duration, 8000) + 800
    : Math.max(duration, 2200) + 400;

  // Always build CSS particles as instant feedback; keep under SVGA while it loads
  const particles = useMemo(() => {
    if (!burst) return [];
    // Mobile gets a denser stage — the effect should feel full-screen immersive
    const mobileStage = typeof window !== 'undefined' && window.innerWidth < 640;
    return buildParticles(
      type === 'svga' ? 'combo_burst' : type,
      emoji,
      colors,
      intensity * (1 + Math.min(combo, 8) * 0.08) * (mobileStage ? 1.3 : 1),
      gift?.effect_config?.particle_count,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);

  const finish = useCallback(() => {
    if (finishedKeyRef.current === burstKey) return;
    finishedKeyRef.current = burstKey;
    setBannerIn(false);
    onDoneRef.current?.();
  }, [burstKey]);

  useEffect(() => {
    if (!burst) {
      setSvgaFailed(false);
      setSvgaReady(false);
      setBannerIn(false);
      return;
    }
    finishedKeyRef.current = null;
    setSvgaFailed(false);
    setSvgaReady(false);
    const b = window.setTimeout(() => setBannerIn(true), 20);
    // Hard ceiling — only used as fallback if SVGA never fires onReady/onFinished/onError
    // (e.g. parser hung). For non-SVGA this is the primary close timer.
    const t = window.setTimeout(() => finish(), fallbackFinishMs);
    return () => {
      window.clearTimeout(b);
      window.clearTimeout(t);
    };
  }, [burstKey, fallbackFinishMs, finish, burst]);

  if (!mounted || !burst || !gift || typeof document === 'undefined') return null;

  const sender = burst.senderName || 'You';
  // Instant CSS stage always (or after SVGA fail); under SVGA until ready we still show CSS
  const showCssStage = !useSvga || !svgaReady || svgaFailed;

  const node = (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: 99999 }}
      aria-hidden
    >
      {/* light dim only — never a heavy modal that feels like "waiting" */}
      <div
        className="absolute inset-0 animate-in fade-in duration-150"
        style={{
          background:
            'radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.28) 100%)',
        }}
      />
      {/* Mobile: deeper dim → full-screen takeover feel */}
      <div className="absolute inset-0 bg-black/45 sm:hidden animate-in fade-in duration-150" />

      {/* Douyin left banner */}
      <div
        className={cn(
          'absolute left-2 sm:left-4 top-[12%] sm:top-[16%] z-20 w-[min(92vw,320px)] transition-all duration-300 ease-out',
          bannerIn ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-full',
        )}
      >
        <div
          className="flex items-center gap-2 rounded-full pr-3 pl-1 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.5)] border border-white/20"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,45,120,0.95) 0%, rgba(192,38,211,0.9) 55%, rgba(124,58,237,0.82) 100%)',
          }}
        >
          <div className="h-11 w-11 shrink-0 rounded-full overflow-hidden bg-black/30 ring-2 ring-white/35 flex items-center justify-center text-2xl">
            {gift.icon_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gift.icon_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{emoji}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 py-0.5">
            <div className="text-[12px] font-bold text-white truncate drop-shadow">{sender}</div>
            <div className="text-[11px] text-white/95 truncate">
              sent <span className="font-semibold">{gift.name}</span>
            </div>
          </div>
          <div
            key={`c-${combo}-${burstKey}`}
            className="gift-combo-pop shrink-0 text-2xl font-black italic text-[#ffe566] leading-none pl-1"
            style={{ textShadow: '0 0 12px rgba(255,229,102,0.9), 0 2px 0 #9f1239' }}
          >
            x{combo}
          </div>
        </div>
      </div>

      {/* Center stage — CSS particles fire instantly; SVGA layers on top when ready */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        {showCssStage && (
          <>
            {particles.map((p) => (
              <span
                key={p.id}
                className="absolute select-none will-change-transform"
                style={{
                  left: `${p.left}%`,
                  top:
                    type === 'fireworks' || type === 'sparkle'
                      ? `${18 + (p.id % 55)}%`
                      : '-8%',
                  fontSize: p.size,
                  color: p.color,
                  animation:
                    type === 'fireworks' || type === 'sparkle' || type === 'float_emoji' || type === 'svga'
                      ? `giftFxBurst ${p.duration}s cubic-bezier(0.2,0.8,0.2,1) ${p.delay}s forwards`
                      : `giftFxFall ${p.duration}s linear ${p.delay}s forwards`,
                  ['--dx' as string]: `${p.dx}px`,
                  ['--dy' as string]: `${p.dy}px`,
                }}
              >
                {p.emoji}
              </span>
            ))}

            {type === 'laser' && (
              <div
                className="absolute top-[30%] left-0 h-2 w-[40%] gift-fx-laser"
                style={{
                  background: `linear-gradient(90deg, transparent, ${colors[0]}, #fff, ${colors[0]}, transparent)`,
                  boxShadow: `0 0 24px ${colors[0]}`,
                }}
              />
            )}

            {type === 'rocket' ? (
              <div
                className="absolute left-1/2 bottom-0 text-8xl"
                style={{ animation: 'giftFxRocket 2.4s cubic-bezier(0.2,0.7,0.2,1) forwards' }}
              >
                {emoji}
              </div>
            ) : (
              <div
                className="text-center z-20"
                style={{ animation: 'giftFxFloat 2.2s ease-out forwards' }}
              >
                <div className="text-[8.5rem] sm:text-[6.5rem] leading-none drop-shadow-[0_0_36px_rgba(255,45,120,0.85)]">
                  {gift.icon_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={gift.icon_url}
                      alt=""
                      className="mx-auto h-44 w-44 sm:h-32 sm:w-32 object-contain"
                    />
                  ) : type === 'crown' ? (
                    '👑'
                  ) : (
                    emoji
                  )}
                </div>
                <div className="mt-2 text-sm font-bold text-white/95 drop-shadow">
                  {gift.name}
                </div>
              </div>
            )}
          </>
        )}

        {useRasterAsset && asset && !useSvga && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset}
            alt=""
            className="absolute max-h-[82dvh] max-w-[94vw] sm:max-h-[70vh] sm:max-w-[85vw] object-contain drop-shadow-[0_0_40px_rgba(255,45,120,0.5)] z-30"
            style={{ animation: 'giftFxFloat 2.4s ease-out forwards' }}
          />
        )}

        {useSvga && asset && (
          <div
            className="absolute z-40 h-full w-full sm:h-[min(88vh,720px)] sm:w-[min(96vw,560px)]"
            style={{ opacity: svgaReady ? 1 : 0, transition: 'opacity 0.15s ease' }}
          >
            <SvgaPlayer
              key={burstKey}
              src={asset}
              loops={gift.effect_config?.svga_loops ?? 1}
              className="h-full w-full"
              onFinished={finish}
              onReady={() => setSvgaReady(true)}
              onError={() => setSvgaFailed(true)}
            />
          </div>
        )}
      </div>

      {/* Big combo */}
      <div className="absolute right-4 bottom-32 sm:bottom-40 z-30 text-right">
        <div
          key={`big-${combo}-${burstKey}`}
          className="gift-combo-pop font-black italic leading-none"
          style={{
            fontSize: combo >= 10 ? '4.5rem' : '3.75rem',
            color: '#ffe566',
            textShadow:
              '0 0 22px rgba(255,45,120,0.95), 0 3px 0 #be123c, 0 0 40px rgba(255,229,102,0.55)',
          }}
        >
          x{combo}
        </div>
        <div className="text-[11px] font-bold tracking-wider text-white/85 uppercase">combo</div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
