/**
 * Global cap on concurrent HTMLVideoElement.play() calls.
 * Prevents home/explore grids from decoding many streams at once.
 */

const playing = new Set<HTMLVideoElement>();
const MAX_CONCURRENT = 1; // only one looping card/hero video at a time

export function requestVideoPlay(el: HTMLVideoElement): void {
  if (playing.has(el)) {
    void el.play().catch(() => undefined);
    return;
  }
  // Evict oldest if at capacity
  if (playing.size >= MAX_CONCURRENT) {
    for (const other of playing) {
      if (other === el) continue;
      try {
        other.pause();
      } catch {
        /* ignore */
      }
      playing.delete(other);
      if (playing.size < MAX_CONCURRENT) break;
    }
  }
  playing.add(el);
  void el.play().catch(() => {
    playing.delete(el);
  });
}

export function releaseVideoPlay(el: HTMLVideoElement): void {
  playing.delete(el);
  try {
    el.pause();
  } catch {
    /* ignore */
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Coarse pointer / no hover → treat as mobile-like for effects */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(hover: none), (pointer: coarse)').matches;
}
