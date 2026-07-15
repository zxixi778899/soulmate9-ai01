import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateHomepage, invalidateGirlfriends } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const { data, error } = await supabase
      .from('featured_girlfriends')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      return NextResponse.json({ items: [], warning: error.message });
    }
    return NextResponse.json({ items: data || [] });
  } catch (e) {
    return NextResponse.json({ items: [], error: String(e) });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const body = await request.json();
    const {
      name, subtitle, personality_tags, avatar_url, description,
      greeting_message, sort_order, is_active, quick_chat_enabled, base_girlfriend_id,
    } = body;

    if (!name || !avatar_url) {
      return NextResponse.json({ error: 'name and avatar_url required' }, { status: 400 });
    }

    const tags = Array.isArray(personality_tags)
      ? personality_tags
      : String(personality_tags || '')
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean);

    const { data, error } = await supabase
      .from('featured_girlfriends')
      .insert({
        name,
        subtitle: subtitle || null,
        personality_tags: tags,
        avatar_url,
        description: description || null,
        greeting_message: greeting_message || null,
        sort_order: Number(sort_order || 0),
        is_active: is_active !== false,
        quick_chat_enabled: quick_chat_enabled !== false,
        base_girlfriend_id: base_girlfriend_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    invalidateHomepage();
    invalidateGirlfriends();
    return NextResponse.json({ item: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Create failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const body = await request.json();
    const { id, personality_tags, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: Record<string, unknown> = { ...rest };
    if (personality_tags !== undefined) {
      updates.personality_tags = Array.isArray(personality_tags)
        ? personality_tags
        : String(personality_tags)
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean);
    }
    delete updates.id;

    const { error } = await supabase.from('featured_girlfriends').update(updates).eq('id', id);
    if (error) throw error;
    invalidateHomepage();
    invalidateGirlfriends();
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Update failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase } = admin;

  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('featured_girlfriends').delete().eq('id', id);
    if (error) throw error;
    invalidateHomepage();
    invalidateGirlfriends();
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Delete failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
