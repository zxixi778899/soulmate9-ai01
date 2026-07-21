'use client';

import { useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Heart, Download, Share2, X, Sparkles } from 'lucide-react';
import { logger } from '@/lib/logger';

interface GirlfriendData {
  name: string;
  age?: number;
  tags?: string[];
  short_description?: string;
  personality?: string;
  portrait_url?: string | null;
}

interface ShareCardProps {
  girlfriend: GirlfriendData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareCard({ girlfriend, open, onOpenChange }: ShareCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(async () => {
    try {
      const canvas = document.createElement('canvas');
      const width = 600;
      const height = 800;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);

      // Draw full portrait (cover fit, top aligned)
      if (girlfriend.portrait_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const imgLoaded = new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = girlfriend.portrait_url!;
          });
          await imgLoaded;

          if (img.naturalWidth > 0) {
            const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
            const drawW = img.naturalWidth * scale;
            const drawH = img.naturalHeight * scale;
            const dx = (width - drawW) / 2;
            const dy = 0; // top aligned to show face
            ctx.drawImage(img, dx, dy, drawW, drawH);
          }
        } catch { /* fallback to gradient bg */ }
      } else {
        // Decorative gradient when no image
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#0a0a0f');
        gradient.addColorStop(0.5, '#1a0a14');
        gradient.addColorStop(1, '#0a0a0f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        // Heart in center
        ctx.fillStyle = 'rgba(225, 29, 72, 0.3)';
        ctx.font = '120px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u2665', width / 2, height / 2 - 80);
      }

      // Bottom gradient overlay (transparent -> dark)
      const overlayH = 320;
      const grad = ctx.createLinearGradient(0, height - overlayH, 0, height);
      grad.addColorStop(0, 'rgba(5, 5, 10, 0)');
      grad.addColorStop(0.4, 'rgba(5, 5, 10, 0.55)');
      grad.addColorStop(1, 'rgba(5, 5, 10, 0.92)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, height - overlayH, width, overlayH);

      const centerX = width / 2;
      let y = height - 240;

      // Name + age
      ctx.fillStyle = '#fafafa';
      ctx.font = 'bold 42px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 8;
      ctx.fillText(`${girlfriend.name}${girlfriend.age ? `, ${girlfriend.age}` : ''}`, centerX, y);
      ctx.shadowBlur = 0;
      y += 40;

      // Online status
      ctx.fillStyle = '#4ade80';
      ctx.beginPath();
      ctx.arc(centerX - 52, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '16px Inter, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Online Now', centerX - 40, y);
      ctx.textAlign = 'center';
      y += 38;

      // Tags
      if (girlfriend.tags && girlfriend.tags.length > 0) {
        const tags = girlfriend.tags.slice(0, 4);
        ctx.font = '14px Inter, system-ui, sans-serif';
        const tagWidths = tags.map((t) => ctx.measureText(t).width + 28);
        const totalW = tagWidths.reduce((a, b) => a + b, 0) + (tags.length - 1) * 10;
        let tx = centerX - totalW / 2;

        for (let i = 0; i < tags.length; i++) {
          const tw = tagWidths[i];
          ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
          ctx.beginPath();
          ctx.roundRect(tx, y - 15, tw, 30, 15);
          ctx.fill();
          ctx.fillStyle = '#e4e4e7';
          ctx.textAlign = 'center';
          ctx.fillText(tags[i], tx + tw / 2, y + 1);
          tx += tw + 10;
        }
        y += 40;
      }

      // Personality
      if (girlfriend.personality) {
        ctx.fillStyle = 'rgba(217, 70, 239, 0.9)';
        ctx.font = '15px Inter, system-ui, sans-serif';
        ctx.fillText(`\u2726 ${personalityLabel(girlfriend.personality)}`, centerX, y);
        y += 36;
      }

      // Branding pill
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      const pillW = 220;
      ctx.beginPath();
      ctx.roundRect(centerX - pillW / 2, height - 64, pillW, 36, 18);
      ctx.fill();
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '13px Inter, system-ui, sans-serif';
      ctx.fillText('\u2665 Made with SoulMate AI', centerX, height - 45);

      // Download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${girlfriend.name.replace(/\s+/g, '_')}_SoulMate_Card.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    } catch (err) {
      logger.error('Failed to generate share card:', { data: err });
    }
  }, [girlfriend]);

  const handleNativeShare = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${girlfriend.name} - SoulMate AI`,
          text: `Meet ${girlfriend.name}${girlfriend.age ? `, ${girlfriend.age}` : ''}! ${girlfriend.short_description || ''}`,
          url: window.location.href,
        });
      } catch { /* user cancelled */ }
    }
  }, [girlfriend]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-white/10 bg-[#0a0a0f] p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0 flex-row items-center justify-between">
          <DialogTitle className="text-sm font-medium text-[#fafafa] flex items-center gap-2">
            <Share2 className="w-4 h-4 text-[#e11d48]" />
            Share {girlfriend.name}
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleNativeShare}
            >
              <Share2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Card Preview — full portrait with floating bottom info */}
        <div className="px-6 pb-4">
          <div
            ref={cardRef}
            className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/10"
          >
            {/* Full portrait */}
            {girlfriend.portrait_url ? (
              <img
                src={girlfriend.portrait_url}
                alt={girlfriend.name}
                className="absolute inset-0 w-full h-full object-cover object-top"
                crossOrigin="anonymous"
              />
            ) : (
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(180deg, #0a0a0f 0%, #1a0a14 50%, #0a0a0f 100%)' }}
              >
                <Heart className="w-20 h-20 text-[#e11d48]/30 fill-[#e11d48]/20" />
              </div>
            )}

            {/* Bottom gradient overlay */}
            <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/90 via-black/50 to-transparent pointer-events-none" />

            {/* Floating info at bottom */}
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-5 px-6">
              {/* Name + age */}
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                {girlfriend.name}
                {girlfriend.age ? <span className="text-white/60 font-normal">, {girlfriend.age}</span> : null}
              </h2>

              {/* Online */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-sm drop-shadow">Online Now</span>
              </div>

              {/* Tags */}
              {girlfriend.tags && girlfriend.tags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-3">
                  {girlfriend.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-zinc-200 bg-white/10 backdrop-blur-sm px-3 py-1 rounded-full border border-white/10"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Personality */}
              {girlfriend.personality && (
                <div className="mt-2.5 flex items-center gap-1.5 text-sm text-fuchsia-300/90 drop-shadow">
                  <Sparkles className="w-3.5 h-3.5" />
                  {personalityLabel(girlfriend.personality)}
                </div>
              )}

              {/* Branding */}
              <div className="mt-3 inline-flex items-center gap-1.5 bg-white/[0.06] backdrop-blur-md px-5 py-1.5 rounded-full border border-white/10">
                <Heart className="w-3 h-3 text-[#e11d48] fill-[#e11d48]" />
                <span className="text-xs text-zinc-400">Made with SoulMate AI</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 space-y-2">
          <Button
            onClick={handleDownload}
            className="w-full py-5 rounded-xl bg-gradient-to-r from-[#e11d48] to-[#d946ef] text-white font-semibold hover:opacity-90 text-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Card
          </Button>
          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="w-full py-5 rounded-xl border-white/[0.12] text-[#fafafa] font-medium hover:bg-white/[0.04] text-sm"
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share via...
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function personalityLabel(personality: string): string {
  const p = personality.toLowerCase();
  if (p.includes('warm')) return 'Warm & Caring';
  if (p.includes('playful')) return 'Playful & Fun';
  if (p.includes('mysterious')) return 'Mysterious';
  if (p.includes('passionate')) return 'Passionate';
  if (p.includes('sweet')) return 'Sweet & Gentle';
  if (p.includes('smart')) return 'Smart & Witty';
  return personality.split(',')[0].trim() || 'Unique';
}
