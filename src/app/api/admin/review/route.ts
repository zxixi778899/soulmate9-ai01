import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateGirlfriends } from '@/lib/revalidate';

/**
 * GET /api/admin/review — list companions submitted for public review.
 *
 * Product rule: user-created companions stay private until they are submitted
 * here and approved. Approving publishes them into the public library
 * (is_public=true AND review_status='approved').
 */
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { data: pending, error } = await supabase
    .from('girlfriends')
    .select('*')
    .eq('review_status', 'pending')
    .order('submitted_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: resolve submitter display name / email for the review queue.
  const rows = (pending || []) as Array<Record<string, unknown>>;
  const ownerIds = Array.from(
    new Set(rows.map((r) => String(r.user_id || '')).filter(Boolean)),
  );
  const ownerMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email, display_name')
      .in('id', ownerIds);
    for (const p of (profiles || []) as Array<{
      id: string;
      email?: string | null;
      display_name?: string | null;
    }>) {
      ownerMap.set(p.id, p.display_name || p.email || p.id.slice(0, 8));
    }
  }

  const girlfriends = rows.map((r) => ({
    ...r,
    submitted_by: r.user_id ? ownerMap.get(String(r.user_id)) || null : null,
  }));

  return NextResponse.json({ girlfriends });
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const body = await request.json();
  const { id, action } = body; // action: 'approve' | 'reject'

  if (!id || !action) {
    return NextResponse.json({ error: 'id and action required' }, { status: 400 });
  }

  if (action === 'approve') {
    // Keep an existing slug when present; only mint one for companions that
    // never had one (fresh user submissions).
    const { data: existing } = await supabase
      .from('girlfriends')
      .select('slug')
      .eq('id', id)
      .eq('review_status', 'pending')
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Submission not found or already reviewed' }, { status: 404 });
    }
    const slug =
      (existing.slug as string | null) && String(existing.slug).trim()
        ? (existing.slug as string)
        : 'user-' + id?.toString().slice(0, 8);

    const { data, error } = await supabase
      .from('girlfriends')
      .update({
        review_status: 'approved',
        is_public: true,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
        slug,
      })
      .eq('id', id)
      .eq('review_status', 'pending')
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invalidateGirlfriends(data?.slug);
    return NextResponse.json({ girlfriend: data });
  }

  if (action === 'reject') {
    const reason =
      typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;
    const { data, error } = await supabase
      .from('girlfriends')
      .update({
        review_status: 'rejected',
        is_public: false,
        rejection_reason: reason,
      })
      .eq('id', id)
      .eq('review_status', 'pending')
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ girlfriend: data });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
