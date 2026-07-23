import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { ensureImageKey, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';
import { assertCanAddCompanion } from '@/lib/companion-seats';
import { consumeCreationCard, getCreationCardStatus } from '@/lib/creation-cards';
import { logger } from '@/lib/logger';
import { invalidateGirlfriends } from '@/lib/revalidate';
import { resolveCompanionProfile } from '@/lib/companion-profile';

const CREATE_GF_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 }; // 30/h/user

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter'); // 'draft' | 'all'
  const id = searchParams.get('id'); // optional single-record fetch

  type Row = Record<string, unknown> & {
    portrait_url?: string | null;
    avatar_url?: string | null;
    card_url?: string | null;
  };

  /**
   * Resolve every media field to a displayable URL. Clients read
   * portrait_url / card_url directly (e.g. chat page 30% background portrait),
   * so returning raw storage keys there breaks the image.
   */
  async function resolveRowMedia(row: Row): Promise<Row> {
    const [avatar, portrait, card] = await Promise.all([
      resolveImageUrl(row.avatar_url || null),
      resolveImageUrl(row.portrait_url || null),
      resolveImageUrl(row.card_url || null),
    ]);
    return {
      ...row,
      avatar_url: avatar || row.avatar_url || null,
      portrait_url: portrait || row.portrait_url || null,
      card_url: card || row.card_url || null,
      image_url: portrait || avatar || card || null,
    };
  }

  // Single-id fetch: own first, then public catalog (for chat open / deep links)
  if (id) {
    const { data: owned, error: ownedErr } = await client
      .from('girlfriends')
      .select('*')
      .eq('user_id', user.id)
      .eq('id', id)
      .maybeSingle();
    if (ownedErr) {
      return NextResponse.json({ error: ownedErr.message }, { status: 500 });
    }

    let row = owned as Row | null;
    if (!row) {
      // Fall back: public approved companion (read-only for chat bootstrap)
      const { data: pub, error: pubErr } = await client
        .from('girlfriends')
        .select('*')
        .eq('id', id)
        .eq('is_public', true)
        .eq('review_status', 'approved')
        .maybeSingle();
      if (pubErr) {
        logger.warn('[girlfriends GET] public fallback failed', { err: pubErr.message });
      } else {
        row = (pub as Row | null) || null;
      }
    }

    if (!row) {
      return NextResponse.json({ girlfriends: [], total: 0 });
    }

    const resolved = await resolveRowMedia(row);
    return NextResponse.json({
      girlfriends: [resolved],
      total: 1,
    });
  }

  let query = client
    .from('girlfriends')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (filter === 'draft') {
    query = query.in('review_status', ['draft', 'pending', 'rejected']);
  }

  const { data: girlfriends, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (girlfriends || []) as Row[];
  const enriched = await Promise.all(rows.map((g) => resolveRowMedia(g)));

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
    outfit_id, portrait_url, meta
  } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const seatCheck = await assertCanAddCompanion(client, user.id);
  if (!seatCheck.ok) {
    return NextResponse.json(
      {
        error: seatCheck.error,
        code: seatCheck.code,
        seats: seatCheck.seats,
      },
      { status: 403 },
    );
  }

  // Consume a creation card
  const cardResult = await consumeCreationCard(client, user.id);
  if (!cardResult.ok) {
    return NextResponse.json(
      {
        error: 'No creation cards remaining. Purchase more in the shop.',
        code: 'NO_CARDS',
      },
      { status: 403 },
    );
  }

  // base64 data URL  OSS key
  const avatarKey = await ensureImageKey(avatar_url, 'girlfriends');
  const portraitKey = await ensureImageKey(portrait_url, 'girlfriends');
  const companionMeta = meta && typeof meta === 'object' ? meta as Record<string, unknown> : {};
  const gender = String(companionMeta.gender || 'Female');
  const companion = resolveCompanionProfile({
    gender,
    appearance_style: companionMeta.visual_style || appearance_style,
  });

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name,
    slug: makeGirlfriendSlug(name),
    age: age || 22,
    gender,
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
      gender,
      visual_style: companionMeta.visual_style || 'realistic',
      face_shape: companionMeta.face_shape || '',
      occupation: companionMeta.occupation || '',
      relationship: companionMeta.relationship || companion.relationship,
      hobbies: companionMeta.hobbies || [],
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
      system_prompt: `You are ${name}, the user's loving adult ${companion.relationship}. Age: ${age || 22}. Gender: ${gender}. Visual style: ${String(companionMeta.visual_style || 'realistic')}. ${personality ? `Personality: ${personality}` : ''} ${backstory ? `Backstory: ${backstory}` : ''} Stay consistent with ${companion.pronouns.possessive} identity, appearance, personality, and relationship. Respond naturally, warmly, playfully, and intimately.`
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

  // Create initial intimacy score — V3 (Heat) for user-created girlfriends
  await client
    .from('intimacy_scores')
    .insert({
      user_id: user.id,
      girlfriend_id: girlfriend.id,
      score: 40,
      level: 3,
      last_daily_reset: new Date().toISOString().split('T')[0],
    });

  // Sync: invalidate cached girlfriend lists so other tabs/pages see the new companion
  invalidateGirlfriends();

  return NextResponse.json({ girlfriend, cards_remaining: cardResult.remaining });
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

  // Sync: invalidate cached girlfriend lists so edits propagate
  invalidateGirlfriends();

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

  // Verify the girlfriend exists and belongs to this user (protect system characters)
  const { data: gf, error: gfError } = await client
    .from('girlfriends')
    .select('id, user_id, name')
    .eq('id', id)
    .maybeSingle();

  if (gfError || !gf) {
    return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
  }

  // System girlfriends (user_id IS NULL) cannot be deleted
  if (!gf.user_id) {
    return NextResponse.json(
      { error: 'System characters cannot be deleted' },
      { status: 403 },
    );
  }

  // Ensure the girlfriend belongs to the requesting user
  if (gf.user_id !== user.id) {
    return NextResponse.json(
      { error: 'Cannot delete a character you do not own' },
      { status: 403 },
    );
  }

  // Reset intimacy so re-adding this companion starts from 0.
  try {
    await client
      .from('intimacy_scores')
      .delete()
      .eq('user_id', user.id)
      .eq('girlfriend_id', id);
  } catch (err) {
    logger.warn('[girlfriends] intimacy delete failed', { err: String(err), id });
    try {
      await client
        .from('intimacy_scores')
        .update({ score: 0, level: 1 })
        .eq('user_id', user.id)
        .eq('girlfriend_id', id);
    } catch (err2) {
      logger.warn('[girlfriends] intimacy zero failed', { err: String(err2), id });
    }
  }

  const { error } = await client
    .from('girlfriends')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync: invalidate cached girlfriend lists so deletion propagates
  invalidateGirlfriends();

  return NextResponse.json({ success: true, intimacy_reset: true });
}
