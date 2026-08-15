/**
 * gen-monitor — server-side aggregation over generation_jobs for the admin
 * Generation Control Center (provider health / job monitoring tabs).
 *
 * Also hosts the global NSFW kill-switch read (site_settings key
 * `nsfw_enabled`, defaults to enabled) with a short in-process cache so hot
 * generation paths pay at most one query per cache window.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingJobTableError } from '@/lib/gen-hub';
import { logger } from '@/lib/logger';

export interface GenKindStat {
  kind: string;
  total: number;
  completed: number;
  failed: number;
  avg_latency_ms: number | null;
}

export interface GenProviderStat {
  provider: string;
  total: number;
  completed: number;
  failed: number;
  avg_latency_ms: number | null;
}

export interface GenRecentJob {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  provider: string | null;
  cost_tokens: number;
  refunded: boolean;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface GenJobStats {
  window_hours: number;
  total: number;
  completed: number;
  failed: number;
  refunded: number;
  success_rate: number | null;
  by_kind: GenKindStat[];
  by_provider: GenProviderStat[];
  top_errors: Array<{ error: string; count: number }>;
  recent: GenRecentJob[];
}

const EMPTY_STATS: GenJobStats = {
  window_hours: 24,
  total: 0,
  completed: 0,
  failed: 0,
  refunded: 0,
  success_rate: null,
  by_kind: [],
  by_provider: [],
  top_errors: [],
  recent: [],
};

interface JobRow {
  id: string;
  user_id: string;
  kind: string;
  status: string;
  provider: string | null;
  cost_tokens: number;
  refunded: boolean;
  error: string | null;
  result: { latency_ms?: number } | null;
  created_at: string;
  completed_at: string | null;
}

/**
 * Aggregate the last `hours` of generation jobs in JS (Supabase has no
 * GROUP BY). Bounded to the most recent 3000 rows to keep the payload small.
 * Returns empty stats (never throws) while the migration is rolling out.
 */
export async function collectGenJobStats(
  client: SupabaseClient,
  hours = 24,
): Promise<GenJobStats> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from('generation_jobs')
    .select('id, user_id, kind, status, provider, cost_tokens, refunded, error, result, created_at, completed_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(3000);

  if (error) {
    if (isMissingJobTableError(error)) return { ...EMPTY_STATS, window_hours: hours };
    logger.error('[gen-monitor] stats query failed', { error: error.message });
    return { ...EMPTY_STATS, window_hours: hours };
  }

  const rows = (data || []) as unknown as JobRow[];
  if (!rows.length) return { ...EMPTY_STATS, window_hours: hours };

  const kindMap = new Map<string, { total: number; completed: number; failed: number; latency: number[] }>();
  const providerMap = new Map<string, { total: number; completed: number; failed: number; latency: number[] }>();
  const errorMap = new Map<string, number>();
  let completed = 0;
  let failed = 0;
  let refunded = 0;

  const bump = (
    map: Map<string, { total: number; completed: number; failed: number; latency: number[] }>,
    key: string,
    row: JobRow,
  ) => {
    const entry = map.get(key) || { total: 0, completed: 0, failed: 0, latency: [] };
    entry.total += 1;
    if (row.status === 'completed') {
      entry.completed += 1;
      const latency = Number(row.result?.latency_ms);
      if (Number.isFinite(latency) && latency > 0) entry.latency.push(latency);
    }
    if (row.status === 'failed') entry.failed += 1;
    map.set(key, entry);
  };

  for (const row of rows) {
    bump(kindMap, row.kind || 'unknown', row);
    bump(providerMap, row.provider || 'unknown', row);
    if (row.status === 'completed') completed += 1;
    if (row.status === 'failed') {
      failed += 1;
      const key = String(row.error || 'unknown error').slice(0, 120);
      errorMap.set(key, (errorMap.get(key) || 0) + 1);
    }
    if (row.refunded) refunded += 1;
  }

  const toStat = (
    map: Map<string, { total: number; completed: number; failed: number; latency: number[] }>,
  ) =>
    [...map.entries()]
      .map(([key, v]) => ({
        key,
        total: v.total,
        completed: v.completed,
        failed: v.failed,
        avg_latency_ms: v.latency.length
          ? Math.round(v.latency.reduce((a, b) => a + b, 0) / v.latency.length)
          : null,
      }))
      .sort((a, b) => b.total - a.total);

  const finished = completed + failed;
  return {
    window_hours: hours,
    total: rows.length,
    completed,
    failed,
    refunded,
    success_rate: finished > 0 ? Math.round((completed / finished) * 1000) / 10 : null,
    by_kind: toStat(kindMap).map(({ key, ...rest }) => ({ kind: key, ...rest })),
    by_provider: toStat(providerMap).map(({ key, ...rest }) => ({ provider: key, ...rest })),
    top_errors: [...errorMap.entries()]
      .map(([errorKey, count]) => ({ error: errorKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8),
    recent: rows.slice(0, 20).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      kind: row.kind,
      status: row.status,
      provider: row.provider,
      cost_tokens: row.cost_tokens,
      refunded: row.refunded,
      error: row.error,
      created_at: row.created_at,
      completed_at: row.completed_at,
    })),
  };
}

// ─── Global NSFW kill switch (site_settings.nsfw_enabled) ────

let nsfwSettingCache: { value: boolean; at: number } | null = null;
const NSFW_SETTING_TTL_MS = 15_000;

function parseBoolSetting(value: unknown, fallback: boolean): boolean {
  if (value === true || value === 'true' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0) return false;
  return fallback;
}

/**
 * Site-wide NSFW kill switch. Defaults to enabled; any lookup failure keeps
 * the current behavior (fail-open) so a missing table never blocks SFW or
 * adult flows that already passed the intimacy gate.
 */
export async function getGlobalNsfwEnabled(client: SupabaseClient): Promise<boolean> {
  if (nsfwSettingCache && Date.now() - nsfwSettingCache.at < NSFW_SETTING_TTL_MS) {
    return nsfwSettingCache.value;
  }
  try {
    const { data, error } = await client
      .from('site_settings')
      .select('value')
      .eq('key', 'nsfw_enabled')
      .maybeSingle();
    if (error) {
      nsfwSettingCache = { value: true, at: Date.now() };
      return true;
    }
    const value = parseBoolSetting((data as { value?: unknown } | null)?.value, true);
    nsfwSettingCache = { value, at: Date.now() };
    return value;
  } catch {
    return true;
  }
}

/** Admin writes bypass the read cache immediately. */
export function invalidateGlobalNsfwCache(): void {
  nsfwSettingCache = null;
}
