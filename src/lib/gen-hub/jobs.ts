/**
 * gen-hub job persistence — idempotent creation, stage updates, queries.
 *
 * Every function degrades gracefully while migration 0039 is not yet applied:
 * a missing `generation_jobs` table yields `null` instead of throwing, so the
 * unified gateway keeps working before/after the DDL is rolled out.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  isMissingJobTableError,
  jobFromRow,
  type GenJobKind,
  type GenJobStage,
  type GenJobStatus,
  type GenerationJob,
} from './types';

export interface CreateGenJobInput {
  user_id: string;
  kind: GenJobKind;
  girlfriend_id?: string | null;
  idempotency_key?: string | null;
  provider?: string | null;
  provider_job_id?: string | null;
  params?: Record<string, unknown>;
  nsfw_level?: number;
  cost_tokens?: number;
  status?: GenJobStatus;
  stage?: GenJobStage;
}

function describeError(err: unknown): string {
  const e = err as { message?: string; code?: string } | null;
  return e?.message || e?.code || String(err || 'unknown');
}

/**
 * Idempotent job creation: when the same (user_id, idempotency_key) pair is
 * submitted again, the existing job is returned instead of a duplicate —
 * this is what prevents double charging on client retries.
 */
export async function createGenJob(
  client: SupabaseClient,
  input: CreateGenJobInput,
): Promise<GenerationJob | null> {
  if (input.idempotency_key) {
    const existing = await findGenJobByIdempotencyKey(
      client,
      input.user_id,
      input.idempotency_key,
    );
    if (existing) return existing;
  }

  const row = {
    user_id: input.user_id,
    kind: input.kind,
    girlfriend_id: input.girlfriend_id ?? null,
    idempotency_key: input.idempotency_key || null,
    provider: input.provider ?? null,
    provider_job_id: input.provider_job_id ?? null,
    params: input.params ?? {},
    nsfw_level: input.nsfw_level ?? 0,
    cost_tokens: input.cost_tokens ?? 0,
    status: input.status || 'queued',
    stage: input.stage || 'queued',
  };

  const { data, error } = await client
    .from('generation_jobs')
    .insert(row)
    .select('*')
    .maybeSingle();

  if (error) {
    // Unique-violation race on the idempotency index → re-fetch the winner.
    const code = (error as { code?: string }).code;
    if (
      input.idempotency_key &&
      (code === '23505' || /duplicate|unique/i.test(error.message || ''))
    ) {
      return findGenJobByIdempotencyKey(client, input.user_id, input.idempotency_key);
    }
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] createGenJob failed', { err: describeError(error) });
    }
    return null;
  }
  return jobFromRow(data);
}

export async function findGenJobByIdempotencyKey(
  client: SupabaseClient,
  userId: string,
  idempotencyKey: string,
): Promise<GenerationJob | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] idempotency lookup failed', { err: describeError(error) });
    }
    return null;
  }
  return jobFromRow(data);
}

/** Partial update of a job row (status/stage/provider/result/error/…). */
export async function updateGenJob(
  client: SupabaseClient,
  jobId: string,
  patch: Record<string, unknown>,
): Promise<GenerationJob | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .select('*')
    .maybeSingle();
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] updateGenJob failed', {
        jobId,
        err: describeError(error),
      });
    }
    return null;
  }
  return jobFromRow(data);
}

/** Convenience stage reporter — also bumps status to match the stage. */
export async function updateGenJobStage(
  client: SupabaseClient,
  jobId: string,
  stage: GenJobStage,
  extra?: Record<string, unknown>,
): Promise<GenerationJob | null> {
  const statusForStage: Record<GenJobStage, GenJobStatus> = {
    queued: 'queued',
    generating: 'running',
    uploading: 'uploading',
    done: 'completed',
  };
  return updateGenJob(client, jobId, {
    stage,
    status: statusForStage[stage],
    ...(stage === 'done' ? { completed_at: new Date().toISOString() } : {}),
    ...(extra || {}),
  });
}

/** Fetch one job scoped to its owner (never leaks another user's job). */
export async function getGenJobForUser(
  client: SupabaseClient,
  jobId: string,
  userId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] getGenJobForUser failed', { err: describeError(error) });
    }
    return null;
  }
  return jobFromRow(data);
}

/**
 * Look up a job by its provider-side job id (e.g. RunPod job id) for one
 * user. Used by the unified status endpoints to answer legacy polls from
 * the job table.
 */
export async function findGenJobByProviderJobId(
  client: SupabaseClient,
  userId: string,
  providerJobId: string,
): Promise<GenerationJob | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('provider_job_id', providerJobId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] provider-job lookup failed', { err: describeError(error) });
    }
    return null;
  }
  return jobFromRow(data);
}

/**
 * ETA estimate: sliding average of the last completed jobs' latency for the
 * same kind (result.latency_ms). Null when there is no history yet.
 */
export async function estimateGenJobEtaSeconds(
  client: SupabaseClient,
  userId: string,
  kind: GenJobKind,
): Promise<number | null> {
  const { data, error } = await client
    .from('generation_jobs')
    .select('result')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(10);
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] eta aggregation failed', { err: describeError(error) });
    }
    return null;
  }
  const latencies = ((data as Array<{ result?: unknown }>) || [])
    .map((row) => Number((row.result as { latency_ms?: unknown } | null)?.latency_ms))
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  if (!latencies.length) return null;
  const avgMs = latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length;
  return Math.max(1, Math.round(avgMs / 1000));
}

/** Recent job history for one user (newest first). */
export async function listGenJobs(
  client: SupabaseClient,
  userId: string,
  limit = 20,
): Promise<GenerationJob[]> {
  const safeLimit = Math.min(100, Math.max(1, Math.round(limit) || 20));
  const { data, error } = await client
    .from('generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) {
    if (!isMissingJobTableError(error)) {
      logger.warn('[gen-hub] listGenJobs failed', { err: describeError(error) });
    }
    return [];
  }
  return ((data as unknown[]) || [])
    .map(jobFromRow)
    .filter((job): job is GenerationJob => job !== null);
}
