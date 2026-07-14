'use client';

import { useEffect, useId, useRef } from 'react';
import { logger } from '@/lib/logger';

type SvgaPlayerProps = {
  src: string;
  /** Play loops; 0 = infinite until unmount */
  loops?: number;
  className?: string;
  onFinished?: () => void;
  onError?: (err: string) => void;
  /** Called once animation has started (frames playing) */
  onReady?: () => void;
};

type SvgaNs = {
  Player: new (el: string | HTMLCanvasElement | HTMLDivElement) => {
    loops: number;
    clearsAfterStop: boolean;
    setVideoItem: (item: unknown) => void;
    setContentMode?: (mode: string) => void;
    startAnimation: () => void;
    stopAnimation?: (clear?: boolean) => void;
    clear?: () => void;
    onFinished: (cb: () => void) => void;
  };
  Parser: new () => {
    load: (
      url: string,
      success: (videoItem: unknown) => void,
      failure?: (err: Error) => void,
    ) => void;
  };
};

async function loadSvgaNamespace(): Promise<SvgaNs> {
  // UMD package: module.exports = SVGA | window.SVGA
  const mod = await import('svgaplayerweb');
  const anyMod = mod as Record<string, unknown>;
  const candidates = [
    anyMod.default,
    anyMod.SVGA,
    anyMod,
    typeof window !== 'undefined' ? (window as unknown as { SVGA?: unknown }).SVGA : null,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'object') {
      const o = c as Partial<SvgaNs>;
      if (typeof o.Player === 'function' && typeof o.Parser === 'function') {
        return o as SvgaNs;
      }
    }
  }
  throw new Error('svgaplayerweb: Player/Parser not found in module exports');
}

/**
 * Plays .svga full-screen gift animations (Douyin live gift format).
 * Dynamically loads svgaplayerweb — client only.
 */
export function SvgaPlayer({
  src,
  loops = 1,
  className,
  onFinished,
  onError,
  onReady,
}: SvgaPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const uid = useId().replace(/:/g, '');
  const finishedRef = useRef(false);
  const onFinishedRef = useRef(onFinished);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    if (!src || typeof window === 'undefined') return;
    let cancelled = false;
    finishedRef.current = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let player: any = null;
    const loadTimeout = window.setTimeout(() => {
      if (!cancelled && !finishedRef.current) {
        logger.warn('[SvgaPlayer] load timeout', { src: src.slice(0, 100) });
        onErrorRef.current?.('SVGA load timeout');
      }
    }, 8000);

    const run = async () => {
      try {
        const S = await loadSvgaNamespace();
        if (cancelled) return;

        const canvas = canvasRef.current;
        const host = hostRef.current;
        if (!canvas && !host) {
          throw new Error('SVGA mount node missing');
        }

        // Critical: canvas must have real pixel size or frames draw as 0×0
        if (canvas) {
          const rect = (host || canvas).getBoundingClientRect();
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const w = Math.max(280, Math.floor((rect.width || window.innerWidth * 0.9) * dpr));
          const h = Math.max(360, Math.floor((rect.height || window.innerHeight * 0.7) * dpr));
          canvas.width = w;
          canvas.height = h;
          canvas.style.width = '100%';
          canvas.style.height = '100%';
        }

        player = canvas ? new S.Player(canvas) : new S.Player(`#svga-host-${uid}`);
        const parser = new S.Parser();

        player.loops = loops <= 0 ? 0 : Math.max(1, Math.floor(loops));
        player.clearsAfterStop = true;
        try {
          player.setContentMode?.('AspectFit');
        } catch {
          /* older builds */
        }

        player.onFinished(() => {
          if (finishedRef.current || cancelled) return;
          finishedRef.current = true;
          window.clearTimeout(loadTimeout);
          onFinishedRef.current?.();
        });

        const absoluteSrc = (() => {
          try {
            return new URL(src, window.location.origin).href;
          } catch {
            return src;
          }
        })();

        await new Promise<void>((resolve, reject) => {
          parser.load(
            absoluteSrc,
            (videoItem: unknown) => {
              if (cancelled) {
                resolve();
                return;
              }
              try {
                player.setVideoItem(videoItem);
                player.startAnimation();
                window.clearTimeout(loadTimeout);
                onReadyRef.current?.();
                resolve();
              } catch (e) {
                reject(e);
              }
            },
            (err: Error) => {
              reject(err instanceof Error ? err : new Error(String(err)));
            },
          );
        });
      } catch (e) {
        window.clearTimeout(loadTimeout);
        const msg = e instanceof Error ? e.message : String(e);
        logger.warn('[SvgaPlayer] failed', { src: src.slice(0, 100), err: msg });
        if (!cancelled) onErrorRef.current?.(msg);
      }
    };

    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimeout);
      try {
        player?.stopAnimation?.(true);
        player?.clear?.();
      } catch {
        /* ignore */
      }
    };
  }, [src, loops, uid]);

  return (
    <div
      ref={hostRef}
      id={`svga-host-${uid}`}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        minHeight: 280,
        pointerEvents: 'none',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
