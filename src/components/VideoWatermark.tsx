'use client';

/**
 * Global brand watermark for video playback.
 *
 * Pixel-level video stamping needs ffmpeg, which cannot run inside Vercel
 * serverless functions, so every <video> on the site gets a translucent
 * "oxmate-ai" tag overlaid in its bottom-left corner instead. Elements inside
 * a `[data-no-watermark]` container (gift FX bursts etc.) are skipped.
 */
import { useEffect } from 'react';

const TAG_ATTR = 'data-oxmate-watermark';

function decorate(video: HTMLVideoElement): void {
  if (video.closest('[data-no-watermark]')) return;
  const parent = video.parentElement;
  if (!parent || parent.querySelector(`[${TAG_ATTR}]`)) return;

  const style = window.getComputedStyle(parent);
  if (style.position === 'static') parent.style.position = 'relative';

  const tag = document.createElement('span');
  tag.setAttribute(TAG_ATTR, 'true');
  tag.textContent = 'oxmate-ai';
  tag.style.cssText =
    'position:absolute;left:8px;bottom:8px;z-index:40;pointer-events:none;user-select:none;' +
    'font:600 11px/1 ui-sans-serif,system-ui,sans-serif;letter-spacing:0.08em;' +
    'color:rgba(255,255,255,0.65);text-shadow:0 1px 3px rgba(0,0,0,0.7);';
  parent.appendChild(tag);
}

function scan(root: ParentNode): void {
  root.querySelectorAll('video').forEach((v) => decorate(v));
}

export default function VideoWatermark() {
  useEffect(() => {
    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node instanceof HTMLVideoElement) decorate(node);
          else scan(node);
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
