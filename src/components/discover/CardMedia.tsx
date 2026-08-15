'use client';

/**
 * Card portrait media — performance-first.
 * - Still image by default
 * - Video element only mounted when actually playing (hover / hero)
 * - Global max 1 concurrent video (video-playback coordinator)
 * - preload=none until play requested
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Film } from 'lucide-react';
import { toPreviewUrl, type PreviewSize } from '@/lib/image-preview';
import {
  isCoarsePointer,
  prefersReducedMotion,
  releaseVideoPlay,
  requestVideoPlay,
} from '@/lib/video-playback';

export interface CardMediaProps {
  src?: string | null;
  videoSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  /** Hero: play when in view (still only 1 global slot) */
  forcePlay?: boolean;
  /** Desktop: play on hover only (recommended for grids) */
  hoverPlay?: boolean;
  showBadge?: boolean;
  objectPosition?: string;
  /**
   * 主视觉高清完整展示：contain 不裁剪画面，同源模糊背景填充两侧避免留黑。
   * 卡片网格默认 cover 居中铺满。
   */
  fit?: 'cover' | 'contain';
  /** contain 时是否叠加同源模糊背景填充（热门卡设 false：零遮罩纯完整展示） */
  blurFill?: boolean;
  /** 预览压缩档位：hero 主视觉用 detail 高清，网格用 card */
  previewSize?: PreviewSize;
}

function isVideoUrl(url: string): boolean {
  const u = url.toLowerCase().split('?')[0];
  return (
    u.endsWith('.mp4') ||
    u.endsWith('.webm') ||
    u.endsWith('.mov') ||
    u.endsWith('.m4v') ||
    u.includes('/video') ||
    u.includes('video/')
  );
}

function CardMediaInner({
  src,
  videoSrc,
  alt,
  className,
  imgClassName,
  forcePlay = false,
  hoverPlay = true,
  showBadge = true,
  objectPosition = 'object-top',
  fit = 'cover',
  blurFill = true,
  previewSize = 'card',
}: CardMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [coarse, setCoarse] = useState(false);
  /** Defer mounting <video> until first play intent */
  const [mountVideo, setMountVideo] = useState(false);

  const poster = (src || '').trim();
  // 预览压缩：卡片网格 512px 宽（约 1.5–2× CSS 尺寸），hero 主视觉用 detail 高清档；
  // 变换失败时回退原图，预览永不白屏。
  const [posterFailed, setPosterFailed] = useState(false);
  const posterPreview = posterFailed ? poster : toPreviewUrl(poster, previewSize);
  const video = (videoSrc || '').trim();
  // Only treat real video URLs as video. Never treat arbitrary HTTPS (image CDN) as video.
  const hasVideo =
    !!video &&
    !videoFailed &&
    !reduceMotion &&
    isVideoUrl(video);

  useEffect(() => {
    setReduceMotion(prefersReducedMotion());
    setCoarse(isCoarsePointer());
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !hasVideo) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.35);
      },
      { threshold: [0, 0.35, 0.6], rootMargin: '40px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasVideo]);

  // Grids: hover only on fine pointer. Mobile: no auto multi-play (only forcePlay hero).
  const wantPlay =
    hasVideo &&
    inView &&
    (forcePlay || (hoverPlay && hovered && !coarse));

  useEffect(() => {
    if (wantPlay) setMountVideo(true);
  }, [wantPlay]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !mountVideo) return;
    if (wantPlay) {
      requestVideoPlay(v);
    } else {
      releaseVideoPlay(v);
      try {
        v.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    return () => {
      releaseVideoPlay(v);
    };
  }, [wantPlay, mountVideo, video]);

  const onEnter = useCallback(() => setHovered(true), []);
  const onLeave = useCallback(() => setHovered(false), []);

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute inset-0 overflow-hidden bg-zinc-900',
        // Isolate paint for smoother scroll
        'contain-paint',
        className,
      )}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {/* Always paint poster first — zero decode cost until video mounts */}
      {poster ? (
        <>
          {fit === 'contain' && blurFill && (
            // eslint-disable-next-line @next/next/no-img-element -- 同源模糊背景填充：contain 完整展示时两侧不留黑边
            <img
              src={posterPreview}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover object-center scale-110 blur-xl opacity-60"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={posterPreview}
            alt={alt}
            className={cn(
              // 立绘展示：默认等比例中心放大铺满（零遮罩）；hero 主视觉 contain 高清完整展示
              'absolute inset-0 h-full w-full object-center',
              fit === 'contain' ? 'object-contain' : 'object-cover',
              imgClassName,
              mountVideo && wantPlay ? 'opacity-0' : 'opacity-100',
              'transition-opacity duration-300',
            )}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => {
              if (!posterFailed) setPosterFailed(true);
            }}
          />
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-4xl font-black">
          {alt.charAt(0) || '?'}
        </div>
      )}

      {hasVideo && mountVideo && (
        <video
          ref={videoRef}
          className={cn(
            'absolute inset-0 h-full w-full object-center',
            fit === 'contain' ? 'object-contain' : 'object-cover',
            objectPosition,
            imgClassName,
            wantPlay ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-300',
          )}
          // Only set src when mounted for play — avoids eager network fetch
          src={video}
          poster={posterPreview || undefined}
          muted
          loop
          playsInline
          preload="none"
          disableRemotePlayback
          onError={() => {
            setVideoFailed(true);
            setMountVideo(false);
          }}
        />
      )}

      {hasVideo && showBadge && (
        <span className="pointer-events-none absolute bottom-2 right-2 z-[2] flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/90">
          <Film className="h-3 w-3 text-[#ff6ba6]" />
          VIDEO
        </span>
      )}
    </div>
  );
}

export const CardMedia = memo(CardMediaInner);
