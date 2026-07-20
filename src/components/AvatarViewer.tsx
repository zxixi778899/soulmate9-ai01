'use client';

/**
 * Lightweight portrait viewer with drag-to-pan / wheel-zoom.
 * Replaces the previous R3F/Three.js viewer — same UX, far lower JS cost
 * and no React 19 + @react-three/fiber JSX type conflicts.
 */

import { useCallback, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

export default function AvatarViewer({ avatar }: { avatar: string }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(3, Math.max(1, s - e.deltaY * 0.0015)));
  };

  return (
    <div className="w-full h-[520px] bg-black rounded-3xl overflow-hidden border border-[#ff2e88]/30 relative select-none touch-none">
      <div
        className="absolute inset-0 cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt="Avatar"
          draggable={false}
          className="absolute left-1/2 top-1/2 max-w-none w-full h-full object-contain will-change-transform"
          style={{
            transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
        <button
          type="button"
          onClick={() => setScale((s) => Math.min(3, s + 0.25))}
          className="h-9 w-9 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/80"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setScale((s) => Math.max(1, s - 0.25))}
          className="h-9 w-9 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/80"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={reset}
          className="h-9 w-9 rounded-full bg-black/60 border border-white/10 text-white flex items-center justify-center hover:bg-black/80"
          aria-label="Reset view"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
