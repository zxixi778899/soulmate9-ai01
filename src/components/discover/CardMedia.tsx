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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            objectPosition,
            imgClassName,
            mountVideo && wantPlay ? 'opacity-0' : 'opacity-100',
            'transition-opacity duration-300',
          )}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-4xl font-black">
          {alt.charAt(0) || '?'}
        </div>
      )}

      {hasVideo && mountVideo && (
        <video
          ref={videoRef}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            objectPosition,
            imgClassName,
            wantPlay ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-300',
          )}
          // Only set src when mounted for play — avoids eager network fetch
          src={video}
          poster={poster || undefined}
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
