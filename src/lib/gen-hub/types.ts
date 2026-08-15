/**
 * gen-hub shared types for the unified generation job queue.
 */

export type GenJobKind = 'image' | 'video' | 'portrait' | 'tryon' | 'chat_image';

/**
 * Loop-guard header: gen-hub sets it when delegating into a legacy route so
 * the legacy route's thin-forward wrapper skips re-entering gen-hub.
 */
export const GEN_HUB_INTERNAL_HEADER = 'x-gen-hub-internal';

export type GenJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** Client-visible progress stage (drives GenJobProgress UI). */
export type GenJobStage = 'queued' | 'generating' | 'uploading' | 'done';

export interface GenerationJob {
  id: string;
  idempotency_key: string | null;
  user_id: string;
  girlfriend_id: string | null;
  kind: GenJobKind;
  status: GenJobStatus;
  stage: GenJobStage;
  provider: string | null;
  provider_job_id: string | null;
  params: Record<string, unknown>;
  nsfw_level: number;
  cost_tokens: number;
  refunded: boolean;
  error: string | null;
  result: Record<string, unknown> | null;
  attempts: unknown[];
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Defensive row → GenerationJob mapping (missing columns degrade gracefully). */
export function jobFromRow(row: unknown): GenerationJob | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!r.id) return null;
  return {
    id: String(r.id),
    idempotency_key: r.idempotency_key != null ? String(r.idempotency_key) : null,
    user_id: String(r.user_id || ''),
    girlfriend_id: r.girlfriend_id != null ? String(r.girlfriend_id) : null,
    kind: (String(r.kind || 'image') as GenJobKind),
    status: (String(r.status || 'pending') as GenJobStatus),
    stage: (String(r.stage || 'queued') as GenJobStage),
    provider: r.provider != null ? String(r.provider) : null,
    provider_job_id: r.provider_job_id != null ? String(r.provider_job_id) : null,
    params: r.params && typeof r.params === 'object' ? (r.params as Record<string, unknown>) : {},
    nsfw_level: Number(r.nsfw_level || 0),
    cost_tokens: Number(r.cost_tokens || 0),
    refunded: Boolean(r.refunded),
    error: r.error != null ? String(r.error) : null,
    result: r.result && typeof r.result === 'object' ? (r.result as Record<string, unknown>) : null,
    attempts: Array.isArray(r.attempts) ? r.attempts : [],
    created_at: String(r.created_at || ''),
    updated_at: String(r.updated_at || ''),
    completed_at: r.completed_at != null ? String(r.completed_at) : null,
  };
}

/** True when an error means the generation_jobs table does not exist yet. */
export function isMissingJobTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  const msg = String(e?.message || e || '').toLowerCase();
  return (
    e?.code === '42P01' ||
    (msg.includes('generation_jobs') && (msg.includes('does not exist') || msg.includes('could not find')))
  );
}

/** Public (client-safe) job shape — strips internal params/attempts detail. */
export function publicJobView(job: GenerationJob) {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    stage: job.stage,
    provider: job.provider,
    provider_job_id: job.provider_job_id,
    girlfriend_id: job.girlfriend_id,
    nsfw_level: job.nsfw_level,
    cost_tokens: job.cost_tokens,
    refunded: job.refunded,
    error: job.error,
    result: job.result,
    created_at: job.created_at,
    completed_at: job.completed_at,
  };
}
