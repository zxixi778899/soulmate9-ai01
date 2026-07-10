'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Gift, Shirt, Image as ImageIcon, Brain, Sparkles, Loader2 } from 'lucide-react';

export function AttachmentsSheet(props: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onGift: () => void;
  onWardrobe: () => void;
  onSelfie: () => void;
  onMemories: () => void;
  onPresets: () => void;
  isGenerating: boolean;
}) {
  const { open, onOpenChange, onGift, onWardrobe, onSelfie, onMemories, onPresets, isGenerating } = props;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl bg-[#0E0E1A]/95 backdrop-blur-2xl border-t border-white/[0.10] max-h-[60vh]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-lg text-center">Add to chat</SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-4 gap-3 mt-4 pb-4">
          {[
            { icon: <Gift className="h-6 w-6" />, label: 'Gift', onClick: onGift, color: '#FF2D78' },
            { icon: <Shirt className="h-6 w-6" />, label: 'Outfit', onClick: onWardrobe, color: '#C026D3' },
            {
              icon: isGenerating ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImageIcon className="h-6 w-6" />,
              label: 'Selfie', onClick: onSelfie, color: '#FF6BA6',
            },
            { icon: <Brain className="h-6 w-6" />, label: 'Memories', onClick: onMemories, color: '#FF2D78' },
            { icon: <Sparkles className="h-6 w-6" />, label: 'Presets', onClick: onPresets, color: '#C026D3' },
          ].map((it) => (
            <button
              key={it.label}
              onClick={it.onClick}
              disabled={it.label === 'Selfie' && isGenerating}
              className="flex flex-col items-center gap-1.5 active:scale-95 disabled:opacity-50 transition-all"
            >
              <span
                className="h-14 w-14 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/[0.10]"
                style={{
                  background: `linear-gradient(135deg, ${it.color}22, ${it.color}10)`,
                  color: it.color,
                }}
              >
                {it.icon}
              </span>
              <span className="text-[11px] font-medium text-[#F0F0F5]">{it.label}</span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
