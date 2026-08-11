import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { getArchetypeForPersonality } from '@/lib/voice-personality';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const { data: girlfriend, error } = await getSupabaseClient()
    .from('girlfriends')
    .select('*')
    .eq('is_public', true)
    .eq('review_status', 'approved')
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
    personality?: string | null;
    occupation?: string | null;
    voice_promo_url?: string | null;
  };
  const raw = gf.portrait_url || gf.avatar_url || gf.card_url || null;
  const image_url = await resolveImageUrl(raw);
  const portrait_video_url = await resolveImageUrl(gf.portrait_video_url || null);
  const avatar_video_url = await resolveImageUrl(gf.avatar_video_url || null);

  // Voice profile metadata: derive the deterministic archetype from the
  // companion's personality/occupation so the frontend can label the voice
  // and play the self-introduction promo (voice_promo_url) with consistent timbre.
  let voice_info: Record<string, unknown> | null = null;
  try {
    const archetype = getArchetypeForPersonality(
      gf.personality || '',
      gf.backstory as string | undefined,
      gf.occupation || '',
    );
    const lang: 'en' | 'zh' =
      (gf.language as string) === 'zh' ? 'zh' : 'en';
    voice_info = {
      voice: lang === 'zh' ? archetype.edge_voices.zh : archetype.edge_voices.en,
      archetype_id: archetype.id,
      archetype_label: archetype.label,
      quality: archetype.quality,
      pitch: archetype.pitch,
      speed: archetype.speed,
      promo_url: gf.voice_promo_url || null,
    };
  } catch {
    /* voice metadata is best-effort — never block the detail page */
  }

  const enriched = {
    ...gf,
    image_url,
    portrait_video_url: portrait_video_url || gf.portrait_video_url || '',
    avatar_video_url: avatar_video_url || gf.avatar_video_url || '',
    voice_info,
  };

  return NextResponse.json({ girlfriend: enriched });
}