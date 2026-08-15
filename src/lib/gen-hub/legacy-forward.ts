/**
 * Phase-2 thin-forward helper for legacy generation routes.
 *
 * Each legacy route calls `forwardLegacyGeneration` right after auth:
 *   - External requests are wrapped by gen-hub (idempotent job row + outcome
 *     mirroring) and delegated back into the SAME route handler with the
 *     internal loop-guard header.
 *   - Internal calls (header present) return null so the route simply runs
 *     its original pipeline untouched — response contract fully preserved.
 *   - Any wrapper failure also returns null: the legacy pipeline remains the
 *     source of truth and never breaks because of job-tracking issues.
 */

import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { detectRequestedNsfwLevel } from '@/lib/content-rating';
import { runGenerationJob } from './runner';
import { GEN_HUB_INTERNAL_HEADER, type GenJobKind } from './types';

export function isGenHubInternalCall(request: NextRequest): boolean {
  return request.headers.get(GEN_HUB_INTERNAL_HEADER) === '1';
}

export interface LegacyForwardOptions {
  request: NextRequest;
  kind: GenJobKind;
  client: SupabaseClient;
  userId: string;
  /** The route's own POST handler — delegation target (loop-safe). */
  handler: (request: NextRequest) => Promise<Response>;
  /** Canonical path of the legacy route (logging only). */
  routePath: string;
}

/**
 * Wrap a legacy generation call with gen-hub job tracking.
 * Returns the wrapped response, or null when the caller should continue with
 * its original inline pipeline (internal call or wrapper failure).
 */
export async function forwardLegacyGeneration(
  opts: LegacyForwardOptions,
): Promise<Response | null> {
  if (isGenHubInternalCall(opts.request)) return null;

  let params: Record<string, unknown> = {};
  try {
    // Clone so the original body stays readable for the inline pipeline.
    const parsed = (await opts.request.clone().json()) as unknown;
    if (parsed && typeof parsed === 'object') params = parsed as Record<string, unknown>;
  } catch {
    /* non-JSON body: track with empty params */
  }

  const rawKey = params.idempotency_key;
  const text = String(params.user_request || params.prompt || params.message || '');

  try {
    const { response } = await runGenerationJob({
      client: opts.client,
      userId: opts.userId,
      sessionToken: opts.request.headers.get('x-session') || '',
      kind: opts.kind,
      idempotencyKey: typeof rawKey === 'string' && rawKey.trim() ? rawKey.trim().slice(0, 128) : null,
      girlfriendId: typeof params.girlfriend_id === 'string' ? params.girlfriend_id : null,
      params,
      nsfwLevel: detectRequestedNsfwLevel(text),
      delegate: { path: opts.routePath, handler: opts.handler },
    });
    return response;
  } catch (err) {
    logger.warn('[gen-hub] legacy forward failed, continuing inline pipeline', {
      route: opts.routePath,
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
