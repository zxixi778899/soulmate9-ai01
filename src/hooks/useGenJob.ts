/**
 * useGenJob — client polling for a unified generation job.
 *
 * Polls GET /api/gen/jobs/[id] until the job reaches a terminal status
 * (completed / failed / cancelled). The server also returns eta_seconds
 * (sliding average of recent latencies for the same kind) so the UI can
 * show a realistic remaining-time estimate.
 */

import { useCallback, useEffect, useState } from 'react';
import { authedFetch } from '@/lib/supabase';

export type GenJobStage = 'queued' | 'generating' | 'uploading' | 'done';

export type GenJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenJobSnapshot {
  id: string;
  kind: string;
  status: GenJobStatus;
  stage: GenJobStage;
  provider: string | null;
  provider_job_id: string | null;
  girlfriend_id: string | null;
  nsfw_level: number;
  cost_tokens: number;
  refunded: boolean;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface UseGenJobResult {
  job: GenJobSnapshot | null;
  etaSeconds: number | null;
  loading: boolean;
  error: string | null;
  isTerminal: boolean;
  /** Force an immediate re-poll (e.g. after a manual retry). */
  refresh: () => void;
}

const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

export function isGenJobTerminal(status: string | null | undefined): boolean {
  return Boolean(status && TERMINAL_STATUSES.has(status));
}

export function useGenJob(
  jobId: string | null | undefined,
  options?: { pollMs?: number },
): UseGenJobResult {
  const pollMs = Math.max(1000, options?.pollMs ?? 2500);
  const [job, setJob] = useState<GenJobSnapshot | null>(null);
  const [etaSeconds, setEtaSeconds] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!jobId) {
      setJob(null);
      setEtaSeconds(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setLoading(true);
    setError(null);

    const poll = async () => {
      try {
        const res = await authedFetch(`/api/gen/jobs/${encodeURIComponent(jobId)}`);
        if (!res.ok) {
          if (!cancelled) {
            // 404 while the migration is rolling out: degrade silently.
            if (res.status !== 404) setError(`job poll failed (${res.status})`);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as {
          job?: GenJobSnapshot;
          eta_seconds?: number | null;
        };
        if (cancelled) return;
        if (data.job) {
          setJob(data.job);
          setEtaSeconds(typeof data.eta_seconds === 'number' ? data.eta_seconds : null);
          if (!isGenJobTerminal(data.job.status)) {
            timer = setTimeout(() => void poll(), pollMs);
          }
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          // Network hiccup — keep trying instead of surfacing a hard error.
          timer = setTimeout(() => void poll(), pollMs);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, pollMs, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    job,
    etaSeconds,
    loading,
    error,
    isTerminal: isGenJobTerminal(job?.status),
    refresh,
  };
}
