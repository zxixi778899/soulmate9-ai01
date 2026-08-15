/**
 * GET /api/gen/jobs?limit= — current user's generation job history.
 * Returns an empty list (200) while migration 0039 is not applied yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { listGenJobs, publicJobView } from '@/lib/gen-hub';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  const limit = Number(request.nextUrl.searchParams.get('limit') || 20);
  const jobs = await listGenJobs(client, user.id, limit);

  return NextResponse.json({ jobs: jobs.map(publicJobView), count: jobs.length });
}
