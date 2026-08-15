/**
 * GET /api/gen/jobs/[id] — poll a single generation job (owner-scoped).
 * Powers useGenJob client polling and 断点续查 (reconnect by job_id).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { estimateGenJobEtaSeconds, getGenJobForUser, publicJobView } from '@/lib/gen-hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: 'Job id is required' }, { status: 400 });
  }

  const job = await getGenJobForUser(client, id, user.id);
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // ETA only matters while the job is still running.
  let etaSeconds: number | null = null;
  if (job.status !== 'completed' && job.status !== 'failed' && job.status !== 'cancelled') {
    etaSeconds = await estimateGenJobEtaSeconds(client, user.id, job.kind);
  }

  return NextResponse.json({ job: publicJobView(job), eta_seconds: etaSeconds });
}
