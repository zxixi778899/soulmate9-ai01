'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Check, X, Loader2, Clock, SkipForward, ImageIcon, Video } from 'lucide-react';
import type { PipelineStageResult } from '@/lib/character-production-pipeline';

interface Props {
  result: PipelineStageResult;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-slate-600', bg: 'bg-slate-800/50', border: 'border-white/5', label: '等待中' },
  running: { icon: Loader2, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', label: '生成中', spin: true },
  completed: { icon: Check, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', label: '完成' },
  failed: { icon: X, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', label: '失败' },
  skipped: { icon: SkipForward, color: 'text-slate-500', bg: 'bg-slate-700/30', border: 'border-white/5', label: '跳过' },
} as const;

export function PipelineStageCard({ result }: Props) {
  const config = STATUS_CONFIG[result.status];
  const Icon = config.icon;
  const isVideo = result.stageId === 'video';
  const hasOutput = result.imageUrl || result.videoUrl;

  return (
    <div className={cn(
      'rounded-xl border p-3 transition-all',
      config.bg, config.border,
    )}>
      <div className="flex items-center gap-2">
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          result.status === 'running' ? 'bg-violet-500/20' : 'bg-white/[0.06]',
        )}>
          {isVideo ? (
            <Video className="h-4 w-4 text-cyan-400" />
          ) : (
            <ImageIcon className="h-4 w-4 text-violet-400" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-white capitalize">{result.stageId}</span>
            <Badge variant="outline" className={cn('text-[9px] px-1 py-0', config.border, config.color)}>
              {config.label}
            </Badge>
          </div>
          {result.error && (
            <p className="mt-0.5 truncate text-[10px] text-red-400">{result.error}</p>
          )}
        </div>

        <Icon className={cn(
          'h-4 w-4 shrink-0',
          config.color,
          ('spin' in config && config.spin) && 'animate-spin',
        )} />
      </div>

      {/* Output preview */}
      {hasOutput && (
        <div className="mt-2 overflow-hidden rounded-lg border border-white/5">
          {result.videoUrl ? (
            <video
              src={result.videoUrl}
              className="w-full object-cover"
              style={{ maxHeight: 120 }}
              autoPlay
              loop
              muted
              playsInline
            />
          ) : result.imageUrl ? (
            <img
              src={result.imageUrl}
              alt={result.stageId}
              className="w-full object-cover"
              style={{ maxHeight: 120 }}
              loading="lazy"
            />
          ) : null}
        </div>
      )}

      {/* LoRA info */}
      {result.loras && result.loras.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {result.loras.map((l, i) => (
            <span key={i} className="rounded bg-white/[0.06] px-1 py-0.5 text-[8px] text-slate-500">
              {l.name} ×{l.strength_model}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
