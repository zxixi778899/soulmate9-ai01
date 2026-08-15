'use client';

/**
 * GenJobProgress — four-stage progress bar for unified generation jobs.
 *
 * Replaces black-box spinners with: queued → generating → uploading → done
 * stages, a remaining-time estimate (server ETA from recent latencies) and a
 * clear failure state with the automatic-refund notice.
 */

import { CheckCircle2, CircleDashed, CloudUpload, Loader2, Sparkles, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/context';
import { useGenJob, type GenJobStage } from '@/hooks/useGenJob';

const STAGE_ORDER: readonly GenJobStage[] = ['queued', 'generating', 'uploading', 'done'];
const STAGE_ICON: Record<GenJobStage, React.ElementType> = {
  queued: CircleDashed,
  generating: Sparkles,
  uploading: CloudUpload,
  done: CheckCircle2,
};

export function GenJobProgress(props: {
  jobId: string | null | undefined;
  /** Compact single-line mode (chat bubbles). */
  compact?: boolean;
  className?: string;
  pollMs?: number;
}) {
  const { jobId, compact = false, className, pollMs } = props;
  const { t, locale } = useTranslation();
  const isZh = String(locale || '').toLowerCase().startsWith('zh');
  const { job, etaSeconds, loading } = useGenJob(jobId || null, { pollMs });

  if (!jobId) return null;

  // First poll in flight — generic waiting line.
  if (!job && loading) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-white/60', className)}>
        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#ff6ba6]" />
        {t('gen.stageQueued') || (isZh ? '排队中' : 'Queued')}
      </div>
    );
  }
  if (!job) return null;

  const stageLabel = (stage: GenJobStage): string => {
    if (stage === 'queued') return t('gen.stageQueued') || (isZh ? '排队中' : 'Queued');
    if (stage === 'generating') return t('gen.stageGenerating') || (isZh ? '生成中' : 'Generating');
    if (stage === 'uploading') return t('gen.stageUploading') || (isZh ? '上传中' : 'Uploading');
    return t('gen.stageDone') || (isZh ? '完成' : 'Done');
  };

  // ── Failure state: reason + automatic refund notice ──
  if (job.status === 'failed' || job.status === 'cancelled') {
    return (
      <div className={cn('flex items-start gap-2 text-xs', className)}>
        <XCircle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-red-300 font-medium">
            {t('gen.failed') || (isZh ? '生成失败' : 'Generation failed')}
          </p>
          {job.error && <p className="text-white/45 break-all">{job.error}</p>}
          {job.refunded && (
            <p className="text-emerald-300/90">
              {t('chat.creditsRefunded') || (isZh ? '积分已自动退回' : 'Credits have been refunded automatically')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Active / completed state: four-stage bar ──
  const stageIndex = Math.max(0, STAGE_ORDER.indexOf(job.stage === 'done' || job.status === 'completed' ? 'done' : job.stage));
  const progress = job.status === 'completed' ? 100 : Math.min(96, ((stageIndex + 1) / STAGE_ORDER.length) * 100);
  const etaText =
    job.status === 'completed'
      ? null
      : etaSeconds != null
        ? (t('gen.etaRemaining') || (isZh ? '预计还需 {s} 秒' : 'About {s}s left')).replace('{s}', String(etaSeconds))
        : null;

  if (compact) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-white/70 min-w-0', className)}>
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#ff6ba6]" />
        <span className="truncate">
          {stageLabel(job.status === 'completed' ? 'done' : job.stage)}
          {etaText ? ` · ${etaText}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {STAGE_ORDER.map((stage, i) => {
            const Icon = STAGE_ICON[stage];
            const reached = i <= stageIndex;
            const active = i === stageIndex && job.status !== 'completed';
            return (
              <span
                key={stage}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] transition-colors',
                  reached ? 'text-[#ff9ec4]' : 'text-white/30',
                )}
                title={stageLabel(stage)}
              >
                <Icon className={cn('h-3.5 w-3.5', active && 'animate-pulse')} />
                <span className="hidden sm:inline">{stageLabel(stage)}</span>
              </span>
            );
          })}
        </div>
        {etaText && <span className="text-[10px] tabular-nums text-white/45">{etaText}</span>}
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #FF2D78, #C026D3)',
          }}
        />
      </div>
    </div>
  );
}
