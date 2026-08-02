import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { assertCanAddCompanion } from '@/lib/companion-seats';

/**
 * POST /api/girlfriends/add-from-public
 * 添加公共伴侣为好友（引用式，不克隆）。
 * 兼容旧接口签名：body { slug }
 */
export async function POST(request: NextRequest) {
  const { user, client } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { slug } = await request.json();
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  // Fetch the public girlfriend
  const { data: publicGf, error: fetchError } = await client
    .from('girlfriends')
    .select('id, name, slug, avatar_url, portrait_url, personality, short_description, character_card')
    .eq('is_public', true)
    .eq('slug', slug)
    .eq('review_status', 'approved')
    .maybeSingle();

  if (fetchError || !publicGf) {
    return NextResponse.json({ error: 'Public girlfriend not found' }, { status: 404 });
  }

  // Check if already friends
  const { data: existing } = await client
    .from('user_friends')
    .select('id')
    .eq('user_id', user.id)
    .eq('girlfriend_id', publicGf.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ girlfriend: publicGf, alreadyOwned: true });
  }

  // Seat check
  const seatCheck = await assertCanAddCompanion(client, user.id);
  if (!seatCheck.ok) {
    return NextResponse.json(
      { error: seatCheck.error, code: seatCheck.code, seats: seatCheck.seats },
      { status: 403 },
    );
  }

  // Insert friend reference (no clone)
  const { error: insertError } = await client
    .from('user_friends')
    .insert({ user_id: user.id, girlfriend_id: publicGf.id, source: 'public' });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Create initial intimacy score
  await client.from('intimacy_scores').insert({
    user_id: user.id,
    girlfriend_id: publicGf.id,
    score: 10,
    level: 1,
    last_daily_reset: new Date().toISOString().split('T')[0],
  });

  // Initial album
  const albumUrl = publicGf.portrait_url || publicGf.avatar_url;
  if (albumUrl) {
    await client.from('chat_media').insert({
      user_id: user.id,
      girlfriend_id: publicGf.id,
      media_type: 'image',
      url: albumUrl,
      metadata: { source: 'public_friend', asset_role: 'character-art', intimacy_level: 1 },
    });
  }

  return NextResponse.json({ girlfriend: publicGf, alreadyOwned: false });
}
