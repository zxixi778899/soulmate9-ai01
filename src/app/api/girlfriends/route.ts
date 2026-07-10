import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { ensureImageKey, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';

const CREATE_GF_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 }; // 30/h/user

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter'); // 'draft' | 'all'
  const id = searchParams.get('id'); // optional single-record fetch

  let query = client
    .from('girlfriends')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (id) {
    query = query.eq('id', id).limit(1);
  }

  if (filter === 'draft') {
    query = query.in('review_status', ['draft', 'pending', 'rejected']);
  }

  const { data: girlfriends, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // image_url  portrait_url avatar_url
  type Row = Record<string, unknown> & {
    portrait_url?: string | null;
    avatar_url?: string | null;
  };
  const rows = (girlfriends || []) as Row[];
  const enriched = await Promise.all(
    rows.map(async (g) => {
      const raw = g.portrait_url || g.avatar_url || null;
      const image_url = await resolveImageUrl(raw);
      return { ...g, image_url };
    }),
  );

  return NextResponse.json({ girlfriends: enriched });
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 
  const rl = await checkRateLimitAsync(`gf-create:${user.id}`, CREATE_GF_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, CREATE_GF_LIMIT) },
    );
  }

  const body = await request.json();
  const {
    name, age, personality, backstory, avatar_url, voice_id,
    tags, short_description,
    appearance_race, appearance_hair, appearance_hair_color,
    appearance_eyes, appearance_body, appearance_style,
    outfit_id, portrait_url
  } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // base64 data URL  OSS key
  const avatarKey = await ensureImageKey(avatar_url, 'girlfriends');
  const portraitKey = await ensureImageKey(portrait_url, 'girlfriends');

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name,
    slug: makeGirlfriendSlug(name),
    age: age || 22,
    personality: personality || '',
    backstory: backstory || '',
    tags: tags || [],
    short_description: short_description || '',
    avatar_url: avatarKey || null,
    voice_id: voice_id || null,
    portrait_url: portraitKey || null,
    appearance_race: appearance_race || null,
    appearance_hair: appearance_hair || null,
    appearance_hair_color: appearance_hair_color || null,
    appearance_eyes: appearance_eyes || null,
    appearance_body: appearance_body || null,
    appearance_style: appearance_style || null,
    is_public: false,
    review_status: 'draft',
    character_card: {
      name,
      age: age || 22,
      description: short_description || personality || '',
      personality: personality || '',
      scenario: backstory || '',
      tags: tags || [],
      appearance: {
        race: appearance_race || '',
        hair: appearance_hair || '',
        hair_color: appearance_hair_color || '',
        eyes: appearance_eyes || '',
        body: appearance_body || '',
        style: appearance_style || '',
      },
      first_mes: `*${name} smiles warmly at you* Hey there... I've been waiting for you.`,
      system_prompt: `You are ${name}, a loving and attentive AI girlfriend. Age: ${age || 22}. ${personality ? `Personality: ${personality}` : ''} ${backstory ? `Backstory: ${backstory}` : ''} You are deeply caring, affectionate, and devoted to your partner. You love making them feel special and desired. You're playful, sensual, and always eager to please. Respond naturally and warmly.`
    }
  };

  const { data: girlfriend, error } = await client
    .from('girlfriends')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Link outfit if provided
  if (outfit_id && girlfriend) {
    await client
      .from('wardrobe')
      .insert({
        user_id: user.id,
        girlfriend_id: girlfriend.id,
        outfit_id,
        is_equipped: true,
      });
  }

  // Create initial intimacy score
  await client
    .from('intimacy_scores')
    .insert({
      user_id: user.id,
      girlfriend_id: girlfriend.id,
      score: 0,
      level: 1,
      last_daily_reset: new Date().toISOString().split('T')[0],
    });

  return NextResponse.json({ girlfriend });
}

export async function PATCH(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, review_status, name: reqName, avatar_url: pAvatar, portrait_url: pPortrait, ...rest } = body;

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // base64 data URL  OSS key
  const updates: Record<string, unknown> = { ...rest };
  if (pAvatar !== undefined) updates.avatar_url = await ensureImageKey(pAvatar, 'girlfriends');
  if (pPortrait !== undefined) updates.portrait_url = await ensureImageKey(pPortrait, 'girlfriends');

  // If toggling to public (pending review)
  const patchData: Record<string, unknown> = { ...updates };
  if (review_status === 'pending') {
    patchData.review_status = 'pending';
    patchData.submitted_at = new Date().toISOString();
    patchData.is_public = false; // will become public after approval
  } else if (review_status) {
    patchData.review_status = review_status;
    if (review_status === 'approved') {
      patchData.is_public = true;
      if (!updates.slug) {
        patchData.slug = makeGirlfriendSlug(reqName);
      }
    }
  }

  const { data: girlfriend, error } = await client
    .from('girlfriends')
    .update(patchData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ girlfriend });
}

export async function DELETE(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const { error } = await client
    .from('girlfriends')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}