/**
 * gen-hub runner — single orchestration entry for all generations.
 *
 * Phase 1/2 uses delegation: `runGenerationJob` records an idempotent job
 * row and then forwards the request to the existing route handler unchanged,
 * so the ~780-line generation pipelines are NOT rewritten. The response
 * contract of each legacy endpoint is preserved; only an extra `job_id` is
 * merged into JSON responses when a job row exists.
 *
 * The delegation target is always supplied explicitly by the caller
 * (gateway route or legacy thin-forward), so this module never imports route
 * files and the module graph stays acyclic.
 *
 * Billing is still owned by the delegated routes in this phase — the job row
 * carries cost_tokens once known so phase 2/3 can move billing/refunds here.
 */

import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { hasAnyCapability, parseGenCapabilities } from './capabilities';
import { createGenJob, updateGenJob, updateGenJobStage } from './jobs';
import { GEN_HUB_INTERNAL_HEADER, type GenJobKind, type GenerationJob } from './types';

export type RouteHandler = (request: NextRequest) => Promise<Response>;

export interface GenDelegate {
  path: string;
  handler: RouteHandler;
}

export interface RunGenerationJobInput {
  client: SupabaseClient;
  userId: string;
  /** Raw x-session token to forward for auth inside the delegated route. */
  sessionToken: string;
  kind: GenJobKind;
  idempotencyKey?: string | null;
  girlfriendId?: string | null;
  /** Request body forwarded verbatim to the legacy route. */
  params: Record<string, unknown>;
  nsfwLevel?: number;
  /** Delegation target — always explicit (gateway map or legacy self-wrap). */
  delegate: GenDelegate;
}

export interface RunGenerationJobResult {
  /** null when the generation_jobs table is not available yet. */
  job: GenerationJob | null;
  /** Legacy response, with job_id merged into JSON bodies when possible. */
  response: Response;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const clone = response.clone();
    const body = (await clone.json()) as Record<string, unknown>;
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

/**
 * Record an idempotent job, delegate to the matching legacy pipeline, then
 * mirror the outcome (completed/failed) back onto the job row.
 */
export async function runGenerationJob(
  input: RunGenerationJobInput,
): Promise<RunGenerationJobResult> {
  const route = input.delegate;

  // Normalize enhancement capability flags (control / face_fix / upscale /
  // identity_image) so delegated pipelines see one canonical shape under
  // params.capabilities; invalid entries are dropped with a warning.
  const capabilities = parseGenCapabilities(input.params);
  const params = hasAnyCapability(capabilities)
    ? { ...input.params, capabilities }
    : input.params;
  if (hasAnyCapability(capabilities)) {
    logger.info('[gen-hub] job capabilities', {
      kind: input.kind,
      control: capabilities.control?.type || null,
      face_fix: !!capabilities.face_fix,
      upscale: capabilities.upscale ?? null,
      identity: !!capabilities.identity_image,
    });
  }

  const job = await createGenJob(input.client, {
    user_id: input.userId,
    kind: input.kind,
    girlfriend_id: input.girlfriendId ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    params,
    nsfw_level: input.nsfwLevel ?? 0,
    status: 'queued',
    stage: 'queued',
  });

  // Idempotent replay: an already-finished job short-circuits the pipeline.
  if (job && (job.status === 'completed' || job.status === 'failed')) {
    return {
      job,
      response: NextResponse.json(
        {
          job_id: job.id,
          status: job.status,
          stage: job.stage,
          result: job.result,
          error: job.error,
          idempotent_replay: true,
        },
        { status: job.status === 'completed' ? 200 : 409 },
      ),
    };
  }

  const request = new NextRequest(`http://gen-hub.internal${route.path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-session': input.sessionToken,
      [GEN_HUB_INTERNAL_HEADER]: '1',
    },
    body: JSON.stringify(params),
  });

  let response: Response;
  try {
    await updateGenJobStage(input.client, job?.id || '', 'generating');
    response = await route.handler(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('[gen-hub] delegated pipeline crashed', {
      kind: input.kind,
      jobId: job?.id || null,
      err: message,
    });
    if (job) await updateGenJob(input.client, job.id, { status: 'failed', error: message });
    return {
      job,
      response: NextResponse.json({ error: message || 'Generation failed' }, { status: 500 }),
    };
  }

  // Mirror the result back onto the job row (best-effort, never blocks).
  if (job) {
    const body = await safeJson(response);
    if (response.ok && body?.pending && body?.job_id) {
      // Provider-side async job (RunPod IN_QUEUE): track by provider job id
      // so /api/gen/jobs and the legacy status polls agree on state.
      await updateGenJob(input.client, job.id, {
        status: 'running',
        stage: 'generating',
        provider: 'runpod',
        provider_job_id: String(body.job_id),
      });
    } else if (response.ok) {
      await updateGenJobStage(input.client, job.id, 'done', {
        result: body,
        cost_tokens: Number(body?.cost_tokens ?? body?.credits_used ?? 0) || 0,
      });
    } else {
      await updateGenJob(input.client, job.id, {
        status: 'failed',
        error: body ? String(body.error || body.localized_error || '') : `HTTP ${response.status}`,
      });
    }
  }

  // Merge job_id into JSON responses so clients can poll /api/gen/jobs/[id].
  if (job && response.headers.get('content-type')?.includes('application/json')) {
    const body = await safeJson(response);
    if (body) {
      return {
        job,
        response: NextResponse.json({ ...body, job_id: job.id }, { status: response.status }),
      };
    }
  }

  return { job, response };
}
