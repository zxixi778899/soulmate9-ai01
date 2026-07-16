import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const { data: girlfriend, error } = await getSupabaseClient()
    .from('girlfriends')
    .select('*')
    .eq('is_public', true)
    .eq('slug', slug)
    .single();

  if (error || !girlfriend) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  //  OSS key  URLdata:url/
  const gf = girlfriend as Record<string, unknown> & {
    portrait_url?: string | null;
    avatar_url?: string | null;
    card_url?: string | null;
    portrait_video_url?: string | null;
    avatar_video_url?: string | null;
  };
  const raw = gf.portrait_url || gf.avatar_url || gf.card_url || null;
  const image_url = await resolveImageUrl(raw);
  const portrait_video_url = await resolveImageUrl(gf.portrait_video_url || null);
  const avatar_video_url = await resolveImageUrl(gf.avatar_video_url || null);
  const enriched = { ...gf, image_url, portrait_video_url: portrait_video_url || gf.portrait_video_url || '', avatar_video_url: avatar_video_url || gf.avatar_video_url || '' };

  return NextResponse.json({ girlfriend: enriched });
}