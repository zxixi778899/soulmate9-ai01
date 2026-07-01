'use client';

import { useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Heart, Download, Share2, X, Sparkles } from 'lucide-react';

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
    if (!cardRef.current) return;

    try {
      // Use canvas to capture the card as PNG
      const canvas = document.createElement('canvas');
      const card = cardRef.current;
      const width = 600;
      const height = 800;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#0a0a0f');
      gradient.addColorStop(0.5, '#1a0a14');
      gradient.addColorStop(1, '#0a0a0f');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Decorative border glow
      ctx.shadowColor = 'rgba(225, 29, 72, 0.3)';
      ctx.shadowBlur = 40;
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.4)';
      ctx.lineWidth = 2;
      ctx.roundRect(20, 20, width - 40, height - 40, 24);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Top gradient bar
      const topGrad = ctx.createLinearGradient(0, 0, width, 0);
      topGrad.addColorStop(0, '#e11d48');
      topGrad.addColorStop(1, '#d946ef');
      ctx.fillStyle = topGrad;
      ctx.beginPath();
      ctx.roundRect(20, 20, width - 40, 6, 3);
      ctx.fill();

      // Avatar circle
      const centerX = width / 2;
      const avatarY = 140;
      const radius = 80;

      ctx.shadowColor = 'rgba(225, 29, 72, 0.4)';
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(centerX, avatarY, radius + 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(225, 29, 72, 0.2)';
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(centerX, avatarY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1a0a14';
      ctx.fill();
      ctx.strokeStyle = 'rgba(225, 29, 72, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Heart icon in avatar
      ctx.fillStyle = '#e11d48';
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', centerX, avatarY + 4);

      // Try to draw portrait if available
      if (girlfriend.portrait_url) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          const imgLoaded = new Promise<void>((resolve) => {
            img.onload = () => {
              ctx.save();
              ctx.beginPath();
              ctx.arc(centerX, avatarY, radius, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(img, centerX - radius, avatarY - radius, radius * 2, radius * 2);
              ctx.restore();
              resolve();
            };
            img.onerror = () => resolve();
          });
          img.src = girlfriend.portrait_url;
          await imgLoaded;
        } catch {}
      }

      // Name
      ctx.fillStyle = '#fafafa';
      ctx.font = 'bold 40px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${girlfriend.name}${girlfriend.age ? `, ${girlfriend.age}` : ''}`, centerX, 280);

      // Online indicator
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(centerX - 70, 280, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.font = '18px Inter, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Online Now', centerX - 58, 280);

      // Tags
      if (girlfriend.tags && girlfriend.tags.length > 0) {
        const tagY = 330;
        const tags = girlfriend.tags.slice(0, 4);
        let tagX = centerX - ((tags.length * 80 + (tags.length - 1) * 8) / 2);

        ctx.font = '14px Inter, sans-serif';
        for (const tag of tags) {
          const metrics = ctx.measureText(tag);
          const tagWidth = metrics.width + 24;
          const tagHeight = 30;

          ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
          ctx.beginPath();
          ctx.roundRect(tagX, tagY - tagHeight / 2, tagWidth, tagHeight, 15);
          ctx.fill();

          ctx.fillStyle = '#a1a1aa';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, tagX + tagWidth / 2, tagY);

          tagX += tagWidth + 8;
        }
      }

      // Description
      const desc = girlfriend.short_description || 'A unique AI companion waiting to meet you.';
      ctx.fillStyle = '#a1a1aa';
      ctx.font = '16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Word wrap
      const maxWidth = 480;
      const words = desc.split(' ');
      let lines: string[] = [];
      let currentLine = '';
      for (const word of words) {
        const test = currentLine + word + ' ';
        if (ctx.measureText(test).width > maxWidth && currentLine) {
          lines.push(currentLine.trim());
          currentLine = word + ' ';
        } else {
          currentLine = test;
        }
      }
      if (currentLine.trim()) lines.push(currentLine.trim());
      lines = lines.slice(0, 3);

      const descY = 400;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], centerX, descY + i * 28);
      }

      // Bottom bar - intimacy glow
      ctx.fillStyle = 'rgba(225, 29, 72, 0.15)';
      ctx.beginPath();
      ctx.roundRect(centerX - 200, height - 160, 400, 100, 16);
      ctx.fill();

      ctx.fillStyle = 'rgba(225, 29, 72, 0.5)';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✨ AI Companion · Made with SoulMate', centerX, height - 80);

      // Personality trait
      if (girlfriend.personality) {
        ctx.fillStyle = '#fafafa';
        ctx.font = '18px Inter, sans-serif';
        ctx.fillText(personalityIcon(girlfriend.personality), centerX, height - 115);
      }

      // Brand
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('SoulMate AI', width - 50, height - 50);

      // Convert to blob and download
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
      console.error('Failed to generate share card:', err);
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
      } catch {}
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

        {/* Card Preview */}
        <div className="px-6 pb-4">
          <div
            ref={cardRef}
            className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden border border-white/10"
            style={{
              background: 'linear-gradient(180deg, #0a0a0f 0%, #1a0a14 50%, #0a0a0f 100%)',
            }}
          >
            {/* Decorative glow */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-[#e11d48]/10 blur-3xl rounded-full" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-[#d946ef]/10 blur-3xl rounded-full" />

            {/* Top border glow */}
            <div className="absolute top-3 left-3 right-3 h-1.5 rounded-full bg-gradient-to-r from-[#e11d48] to-[#d946ef]" />

            {/* Avatar */}
            <div className="flex flex-col items-center pt-12">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#e11d48]/20 to-[#d946ef]/20 flex items-center justify-center border-2 border-[#e11d48]/40 shadow-lg shadow-[#e11d48]/20">
                {girlfriend.portrait_url ? (
                  <img
                    src={girlfriend.portrait_url}
                    alt={girlfriend.name}
                    className="w-full h-full rounded-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <Heart className="w-10 h-10 text-[#e11d48] fill-[#e11d48]/30" />
                )}
              </div>

              {/* Name */}
              <h2 className="mt-4 text-2xl font-bold text-[#fafafa]">
                {girlfriend.name}
                {girlfriend.age ? <span className="text-[#a1a1aa] font-normal">, {girlfriend.age}</span> : null}
              </h2>

              {/* Online */}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-green-400 text-sm">Online Now</span>
              </div>

              {/* Tags */}
              {girlfriend.tags && girlfriend.tags.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2 mt-4 px-6">
                  {girlfriend.tags.slice(0, 4).map((tag) => (
                    <span
                      key={tag}
                      className="text-xs text-[#a1a1aa] bg-white/[0.06] px-3 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              <p className="mt-4 text-sm text-[#a1a1aa] text-center px-8 leading-relaxed line-clamp-3">
                {girlfriend.short_description || 'A unique AI companion waiting to meet you.'}
              </p>

              {/* Personality */}
              {girlfriend.personality && (
                <div className="mt-4 flex items-center gap-2 text-sm text-[#fafafa] bg-white/[0.04] px-4 py-2 rounded-full">
                  <Sparkles className="w-3.5 h-3.5 text-[#d946ef]" />
                  {personalityLabel(girlfriend.personality)}
                </div>
              )}
            </div>

            {/* Bottom branding */}
            <div className="absolute bottom-6 left-0 right-0 text-center">
              <div className="inline-block bg-white/[0.04] backdrop-blur-sm px-6 py-2 rounded-full border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-xs text-[#a1a1aa]">
                  <Heart className="w-3 h-3 text-[#e11d48] fill-[#e11d48]" />
                  Made with SoulMate AI
                </div>
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

function personalityIcon(personality: string): string {
  const p = personality.toLowerCase();
  if (p.includes('warm') || p.includes('caring')) return '💕';
  if (p.includes('playful') || p.includes('fun')) return '😊';
  if (p.includes('mysterious') || p.includes('quiet')) return '🌙';
  if (p.includes('passionate') || p.includes('intense')) return '🔥';
  if (p.includes('sweet') || p.includes('gentle')) return '🌸';
  if (p.includes('smart') || p.includes('witty')) return '🧠';
  return '✨';
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