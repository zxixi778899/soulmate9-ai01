/**
 * Admin review queue for companion-album publish submissions.
 *
 * GET   /api/admin/gen-publish?status=pending|approved|rejected — list jobs
 * PATCH /api/admin/gen-publish { job_id, action: 'approve' | 'reject' }
 *       approve → publish_status='approved' (public); reject → 'none'.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEW_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 };
const ALLOWED_STATUS = ['pending', 'approved', 'rejected'] as const;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const status = String(request.nextUrl.searchParams.get('status') || 'pending');
  if (!(ALLOWED_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'status must be pending|approved|rejected' }, { status: 400 });
  }
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') || 40)));

  try {
    const { data, error } = await admin.supabase
      .from('generation_jobs')
      .select('id, user_id, girlfriend_id, kind, status, result, publish_status, publish_requested_at, created_at')
      .eq('publish_status', status)
      .order('publish_requested_at', { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw new Error(error.message);

    return NextResponse.json({ jobs: data || [], count: (data || []).length });
  } catch (e) {
    logger.warn('[admin/gen-publish] list failed', { err: String(e) });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'List failed' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const rl = await checkRateLimitAsync(`admin-gen-publish:${admin.user!.id}`, REVIEW_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many review requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, REVIEW_LIMIT) },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    job_id?: unknown;
    action?: unknown;
  };
  const jobId = typeof body.job_id === 'string' ? body.job_id.trim() : '';
  const action = String(body.action || '');
  if (!jobId) return NextResponse.json({ error: 'job_id is required' }, { status: 400 });
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  try {
    const patch =
      action === 'approve'
        ? { publish_status: 'approved', publish_reviewed_at: new Date().toISOString() }
        : { publish_status: 'none', publish_reviewed_at: new Date().toISOString() };
    const { data, error } = await admin.supabase
      .from('generation_jobs')
      .update(patch)
      .eq('id', jobId)
      .eq('publish_status', 'pending')
      .select('id, publish_status')
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: 'Submission not found or no longer pending' }, { status: 404 });
    }

    logger.info('[admin/gen-publish] reviewed', {
      adminId: admin.user!.id,
      jobId,
      action,
    });
    return NextResponse.json({ success: true, publish_status: data.publish_status });
  } catch (e) {
    logger.warn('[admin/gen-publish] review failed', { err: String(e), jobId });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Review failed' },
      { status: 500 },
    );
  }
}
