'use client';

/**
 * Card portrait media: image poster + optional looping muted video.
 * - Plays when visible (IntersectionObserver) or when forcePlay / hoverPlay
 * - Falls back to still image on error / missing video
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Film } from 'lucide-react';

export interface CardMediaProps {
  src?: string | null;
  videoSrc?: string | null;
  alt: string;
  className?: string;
  imgClassName?: string;
  /** Always try to play when mounted (hero) */
  forcePlay?: boolean;
  /** Play only while hovered (desktop cards) */
  hoverPlay?: boolean;
  /** Show a small VIDEO badge when video is available */
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

export function CardMedia({
  src,
  videoSrc,
  alt,
  className,
  imgClassName,
  forcePlay = false,
  hoverPlay = false,
  showBadge = true,
  objectPosition = 'object-top',
}: CardMediaProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);

  const poster = (src || '').trim();
  const video = (videoSrc || '').trim();
  const hasVideo = !!video && !videoFailed && (isVideoUrl(video) || video.startsWith('http'));

  // Visibility for autoplay without draining battery off-screen
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const shouldPlay =
    hasVideo &&
    (forcePlay ? inView : hoverPlay ? hovered && inView : inView);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasVideo) return;
    if (shouldPlay) {
      v.play().catch(() => {
        /* autoplay blocked — keep poster */
      });
    } else {
      v.pause();
      if (!forcePlay) {
        try {
          v.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }
  }, [shouldPlay, hasVideo, forcePlay, video]);

  return (
    <div
      ref={rootRef}
      className={cn('absolute inset-0 overflow-hidden bg-zinc-900', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {hasVideo ? (
        <video
          ref={videoRef}
          key={video}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            objectPosition,
            imgClassName,
          )}
          src={video}
          poster={poster || undefined}
          muted
          loop
          playsInline
          preload={forcePlay ? 'auto' : 'metadata'}
          onError={() => setVideoFailed(true)}
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full object-cover',
            objectPosition,
            imgClassName,
          )}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/20 text-4xl font-black">
          {alt.charAt(0) || '?'}
        </div>
      )}

      {hasVideo && showBadge && (
        <span className="pointer-events-none absolute bottom-2 right-2 z-[2] flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white/90 backdrop-blur-sm">
          <Film className="h-3 w-3 text-[#ff6ba6]" />
          VIDEO
        </span>
      )}
    </div>
  );
}
