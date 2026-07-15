import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateGirlfriends } from '@/lib/revalidate';

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

  return NextResponse.json({ girlfriends: pending || [] });
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
    const { data, error } = await supabase
      .from('girlfriends')
      .update({
        review_status: 'approved',
        is_public: true,
        slug: 'user-' + id?.toString().slice(0, 8),
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
    const { data, error } = await supabase
      .from('girlfriends')
      .update({
        review_status: 'rejected',
        is_public: false,
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