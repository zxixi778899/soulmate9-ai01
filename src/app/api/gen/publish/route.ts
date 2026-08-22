/**
 * POST   /api/gen/publish  { job_id } — submit a completed image job from the
 *                           companion album for review (publish_status=pending).
 * DELETE  /api/gen/publish?job_id= — withdraw a pending submission (→ none).
 * Works stay private until an admin approves them (see /api/admin/gen-publish).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLISH_LIMIT = { maxRequests: 20, windowMs: 60 * 60 * 1000 };

async function findOwnJob(
  client: NonNullable<Awaited<ReturnType<typeof getAuthUser>>['client']>,
  userId: string,
  jobId: string,
) {
  const { data, error } = await client
    .from('generation_jobs')
    .select('id, status, kind, result, publish_status')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    status: string;
    kind: string;
    result: Record<string, unknown> | null;
    publish_status: string | null;
  } | null;
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const rl = await checkRateLimitAsync(`gen-publish:${user.id}`, PUBLISH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many publish requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, PUBLISH_LIMIT) },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { job_id?: unknown };
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
  }

  try {
    const job = await findOwnJob(client, user.id, jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.status !== 'completed') {
      return NextResponse.json({ error: 'Only completed works can be published' }, { status: 400 });
    }
    if (job.kind === 'video') {
      return NextResponse.json({ error: 'Only images can be published' }, { status: 400 });
    }
    const hasImage =
      typeof job.result?.image_url === 'string' ||
      (Array.isArray(job.result?.candidates) && (job.result?.candidates as unknown[]).length > 0);
    if (!hasImage) {
      return NextResponse.json({ error: 'This work has no image to publish' }, { status: 400 });
    }
    if (job.publish_status === 'approved') {
      return NextResponse.json({ error: 'Already published' }, { status: 400 });
    }

    const { error: upError } = await client
      .from('generation_jobs')
      .update({ publish_status: 'pending', publish_requested_at: new Date().toISOString() })
      .eq('id', jobId)
      .eq('user_id', user.id);
    if (upError) throw new Error(upError.message);

    logger.info('[gen-publish] submitted for review', { userId: user.id, jobId });
    return NextResponse.json({ success: true, publish_status: 'pending' });
  } catch (e) {
    logger.warn('[gen-publish] submit failed', { err: String(e), jobId });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Publish failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const jobId = String(request.nextUrl.searchParams.get('job_id') || '').trim();
  if (!jobId) {
    return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
  }

  try {
    const job = await findOwnJob(client, user.id, jobId);
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    if (job.publish_status !== 'pending') {
      return NextResponse.json({ error: 'Only pending submissions can be withdrawn' }, { status: 400 });
    }

    const { error: upError } = await client
      .from('generation_jobs')
      .update({ publish_status: 'none', publish_requested_at: null })
      .eq('id', jobId)
      .eq('user_id', user.id);
    if (upError) throw new Error(upError.message);

    logger.info('[gen-publish] withdrawn', { userId: user.id, jobId });
    return NextResponse.json({ success: true, publish_status: 'none' });
  } catch (e) {
    logger.warn('[gen-publish] withdraw failed', { err: String(e), jobId });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Withdraw failed' },
      { status: 500 },
    );
  }
}
