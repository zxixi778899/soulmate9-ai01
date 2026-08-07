import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { ensureImageKey, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';
import { consumeCreationCard } from '@/lib/creation-cards';
import { logger } from '@/lib/logger';
import { invalidateGirlfriends } from '@/lib/revalidate';
import { resolveCompanionProfile } from '@/lib/companion-profile';
import { buildCompanionCharacterCard, normalizeCreatorPreset, type CreatorPreset } from '@/lib/creator-presets';
import { soulForPreset } from '@/lib/preset-souls';
import { findCachedPresetPortrait, recordPresetPortraitStat } from '@/lib/preset-portrait-cache';
import { checkAchievements } from '@/lib/achievement-checker';
import { rollCompanionStats, rarityFromTraits, companionScore, type Rarity } from '@/lib/rarity';

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
    .neq('review_status', 'removed')
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (filter === 'draft') {
    query = query.in('review_status', ['draft', 'pending', 'rejected']);
  }

  const { data: girlfriends, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (girlfriends || []) as Row[];

  /**
   * "我的伴侣" must mirror the friend list (user_friends is the single source
   * of truth: seats / proactive / chats all read it). Owned companions are
   * backfilled there with source='created'; companions added from the public
   * library only exist in user_friends, so union them in here. Skip the union
   * when a status filter is requested (draft management stays owner-scoped).
   */
  let addedFriends: Row[] = [];
  const sourceByGfId = new Map<string, string>();
  if (!filter) {
    const { data: friendLinks } = await client
      .from('user_friends')
      .select('girlfriend_id, source, created_at')
      .eq('user_id', user.id);

    const ownedIds = new Set(rows.map((r) => String(r.id)));
    const links: Array<{ girlfriend_id: string; source: string; created_at: string }> =
      (friendLinks || []) as Array<{ girlfriend_id: string; source: string; created_at: string }>;
    for (const link of links) sourceByGfId.set(String(link.girlfriend_id), link.source);

    const addedLinks = links
      .filter((l) => !ownedIds.has(String(l.girlfriend_id)))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    if (addedLinks.length) {
      const addedIds = addedLinks.map((l) => String(l.girlfriend_id));
      const { data: friendGfs, error: friendErr } = await client
        .from('girlfriends')
        .select('*')
        .in('id', addedIds)
        .neq('review_status', 'removed');
      if (friendErr) {
        logger.warn('[girlfriends GET] friend union failed', { err: friendErr.message });
      } else {
        const byId = new Map(((friendGfs || []) as Row[]).map((r) => [String(r.id), r]));
        addedFriends = addedLinks
          .map((l) => byId.get(String(l.girlfriend_id)))
          .filter((r): r is Row => Boolean(r));
      }
    }
  }

  const withSource = (r: Row, fallback: string): Row => ({
    ...r,
    friend_source: sourceByGfId.get(String(r.id)) || fallback,
  });
  const enriched = await Promise.all([...rows, ...addedFriends].map((g, i) =>
    resolveRowMedia(withSource(g, i < rows.length ? 'created' : 'public')),
  ));

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
    voice_timbre_id,
    tags, short_description,
    appearance_race, appearance_hair, appearance_hair_color,
    appearance_eyes, appearance_body, appearance_style,
    appearance_face, appearance_skin, appearance_breast, appearance_height,
    genome,
    outfit_id, portrait_url, meta,
    preset_id, preset_slug, locale, forge,
  } = body;

  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // ── Resolve library preset (千人千面 soul layer) when created from one ──
  let preset: CreatorPreset | null = null;
  let presetDbId: string | null = null;
  if (preset_id || preset_slug) {
    let pq = client.from('character_presets').select('*').eq('is_active', true);
    pq = preset_slug ? pq.eq('slug', String(preset_slug)) : pq.eq('id', String(preset_id));
    const { data: presetRow, error: presetErr } = await pq.maybeSingle();
    if (presetErr) {
      logger.warn('[girlfriends] preset lookup failed', { err: presetErr.message });
    } else if (presetRow) {
      preset = normalizeCreatorPreset(presetRow as Record<string, unknown>);
      presetDbId = String((presetRow as Record<string, unknown>).id || '');
    }
  }
  const zhLocale = String(locale || '').toLowerCase().startsWith('zh');
  const presetSoul = preset?.character_soul || soulForPreset(preset?.slug || (preset_slug ? String(preset_slug) : null));
  const presetGreeting = preset
    ? (zhLocale ? preset.greeting_zh || preset.greeting_en : preset.greeting_en || preset.greeting_zh) || undefined
    : undefined;

  // ── Forged combination (零件化组合): reuse soul layer by vibe-slug ──
  const forgeData = forge && typeof forge === 'object' ? (forge as Record<string, unknown>) : null;
  const forgeSoulSlug = forgeData && typeof forgeData.soul_slug === 'string' ? forgeData.soul_slug.trim() : '';
  const forgeSoul = !preset && forgeSoulSlug ? soulForPreset(forgeSoulSlug) : null;
  const forgeGreeting = !preset && forgeData
    ? String(
        zhLocale
          ? forgeData.greeting_zh || forgeData.greeting_en || ''
          : forgeData.greeting_en || forgeData.greeting_zh || '',
      ) || undefined
    : undefined;

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
  const gender = String(companionMeta.gender || preset?.gender || 'Female');
  const companion = resolveCompanionProfile({
    gender,
    appearance_style: companionMeta.visual_style || appearance_style,
  });

  const characterCard = buildCompanionCharacterCard({
    name: String(name),
    age: Number(age) || preset?.age || 22,
    gender,
    relationship: String(companionMeta.relationship || preset?.relationship || companion.relationship),
    personality: String(personality || ''),
    backstory: String(backstory || ''),
    occupation: String(companionMeta.occupation || preset?.occupation || ''),
    hobbies: Array.isArray(companionMeta.hobbies)
      ? companionMeta.hobbies.map(String)
      : String(companionMeta.hobbies || preset?.hobbies || ''),
    voice: String(companionMeta.voice || voice_timbre_id || voice_id || preset?.voice || ''),
    visualStyle: String(companionMeta.visual_style || preset?.visual_style || 'realistic'),
    shortDescription: String(short_description || ''),
    soul: presetSoul || forgeSoul || undefined,
    greeting: presetGreeting || forgeGreeting,
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
    voice: String(companionMeta.voice || voice_timbre_id || voice_id || ''),
    portrait_url: portraitKey || null,
    appearance_race: appearance_race || null,
    appearance_hair: appearance_hair || null,
    appearance_hair_color: appearance_hair_color || null,
    appearance_eyes: appearance_eyes || null,
    appearance_body: appearance_body || null,
    appearance_style: appearance_style || null,
    appearance_face: appearance_face || null,
    appearance_skin: appearance_skin || null,
    appearance_breast: appearance_breast || null,
    appearance_height: appearance_height || null,
    genome: genome && typeof genome === 'object' ? genome : null,
    is_public: false,
    review_status: 'draft',
    is_pinned: true,
    pinned_at: new Date().toISOString(),
    character_card: {
      ...characterCard,
      appearance: {
        race: appearance_race || '',
        hair: appearance_hair || '',
        hair_color: appearance_hair_color || '',
        eyes: appearance_eyes || '',
        body: appearance_body || '',
        style: appearance_style || '',
        face: appearance_face || '',
        skin: appearance_skin || '',
        breast: appearance_breast || '',
        height: appearance_height || '',
      },
      ...(voice_timbre_id ? { voice: voice_timbre_id } : {}),
    },
  };

  // Library preset identity columns (千人千面): persist catalog fields directly so
  // trait prompt builders and preset-usage analytics read real values.
  if (preset) {
    if (preset.relationship) insertData.relationship = preset.relationship;
    if (preset.occupation) insertData.occupation = preset.occupation;
    if (preset.hobbies) insertData.hobbies = preset.hobbies;
    if (preset.traits) {
      insertData.base_intimacy = preset.traits.base_intimacy;
      insertData.base_desire = preset.traits.base_desire;
      insertData.base_development = preset.traits.base_development;
      insertData.base_kink = preset.traits.base_kink;
      // Universal rarity rule: always derived from the stat score
      insertData.rarity = rarityFromTraits(
        preset.traits.base_desire,
        preset.traits.base_development,
        preset.traits.base_kink,
      );
    }
    if (presetDbId) insertData.preset_id = presetDbId;
    // M4: merge preset vibes into tags so catalog tag filters can find them
    if (preset.vibe_tags?.length) {
      const baseTags = Array.isArray(tags) ? tags.map(String) : [];
      insertData.tags = Array.from(new Set([...baseTags, ...preset.vibe_tags]));
    }
    // M3: no custom portrait? Reuse the shared preset portrait (zero GPU cost)
    if (!portraitKey && !avatarKey && preset.slug) {
      const cachedPortrait = await findCachedPresetPortrait(preset.slug);
      if (cachedPortrait) {
        insertData.avatar_url = cachedPortrait;
        insertData.portrait_url = cachedPortrait;
        void recordPresetPortraitStat(preset.slug, 'hit', cachedPortrait);
      }
    }
  }

  // Forged combination identity (千人千面): persist rolled rarity/traits/vibe so
  // trait prompt builders and catalog filters read real values.
  if (forgeData) {
    const clamp01 = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
    const forgeTraits = forgeData.traits && typeof forgeData.traits === 'object'
      ? (forgeData.traits as Record<string, unknown>)
      : null;
    if (forgeTraits && forgeTraits.base_intimacy !== undefined) {
      insertData.base_intimacy = clamp01(forgeTraits.base_intimacy);
    }
    const forgeRel = String(companionMeta.relationship || '');
    if (forgeRel) insertData.relationship = forgeRel;
    const forgeOcc = String(companionMeta.occupation || '');
    if (forgeOcc) insertData.occupation = forgeOcc;
    const forgeHob = Array.isArray(companionMeta.hobbies)
      ? companionMeta.hobbies.map(String).join(', ')
      : String(companionMeta.hobbies || '');
    if (forgeHob) insertData.hobbies = forgeHob;
    const forgeVibe = String(forgeData.vibe || '').trim();
    if (forgeVibe) {
      const baseTags = Array.isArray(tags) ? tags.map(String) : [];
      insertData.tags = Array.from(new Set([...baseTags, forgeVibe]));
    }
  }

  // ── Universal stat system (site-wide): every companion without designed
  // preset stats rolls desire/development/kink uniformly in 70-100; rarity is
  // ALWAYS derived from the score = round(avg(stats)). See src/lib/rarity.ts.
  if (insertData.base_desire === undefined) {
    const roll = rollCompanionStats();
    insertData.base_desire = roll.base_desire;
    insertData.base_development = roll.base_development;
    insertData.base_kink = roll.base_kink;
    insertData.rarity = roll.rarity;
  }
  const finalStats = {
    base_desire: Number(insertData.base_desire ?? 0),
    base_development: Number(insertData.base_development ?? 0),
    base_kink: Number(insertData.base_kink ?? 0),
  };
  const finalScore = companionScore(finalStats.base_desire, finalStats.base_development, finalStats.base_kink);
  const finalRarity = (insertData.rarity as Rarity) || rarityFromTraits(finalStats.base_desire, finalStats.base_development, finalStats.base_kink);
  insertData.rarity = finalRarity;

  const { data: girlfriend, error } = await client
    .from('girlfriends')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ── Auto-create voice profile from timbre (non-fatal) ──
  if (voice_timbre_id && girlfriend) {
    try {
      const { getVoiceTimbre } = await import('@/lib/voice-timbres');
      const { saveVoiceProfile } = await import('@/lib/tts-service');
      const timbre = getVoiceTimbre(voice_timbre_id);
      await saveVoiceProfile({
        id: `vp_${girlfriend.id}`,
        companion_id: girlfriend.id,
        name: timbre.nameEn,
        engine: 'fish-speech',
        language: 'auto',
        pitch: timbre.pitch,
        speed: timbre.speed,
        emotion_presets: timbre.emotions,
      }, client);
    } catch (e) {
      logger.warn('[girlfriends] auto-create voice profile failed (non-fatal)', { err: String(e) });
    }
  }

  // ── M4: preset / forge telemetry (best-effort, never blocks creation) ──
  if ((preset || forgeData) && girlfriend) {
    try {
      const catRows: Array<{ girlfriend_id: string; category_type: string; category_value: string }> = [];
      for (const value of String(personality || '').split(',').map((s) => s.trim()).filter(Boolean)) {
        catRows.push({ girlfriend_id: girlfriend.id, category_type: 'personality', category_value: value });
      }
      if (preset) {
        for (const vibe of preset.vibe_tags || []) {
          catRows.push({ girlfriend_id: girlfriend.id, category_type: 'vibe', category_value: vibe });
        }
        if (preset.relationship) {
          catRows.push({ girlfriend_id: girlfriend.id, category_type: 'relationship', category_value: preset.relationship });
        }
      } else if (forgeData) {
        const forgeVibe = String(forgeData.vibe || '').trim();
        if (forgeVibe) {
          catRows.push({ girlfriend_id: girlfriend.id, category_type: 'vibe', category_value: forgeVibe });
        }
        const forgeCode = String(forgeData.code || '').trim();
        if (forgeCode) {
          catRows.push({ girlfriend_id: girlfriend.id, category_type: 'forge_code', category_value: forgeCode });
        }
        catRows.push({ girlfriend_id: girlfriend.id, category_type: 'source', category_value: 'forge' });
      }
      if (catRows.length) {
        const { error: catErr } = await client.from('girlfriend_categories').insert(catRows);
        if (catErr) logger.warn('[girlfriends] category insert failed', { err: catErr.message });
      }
    } catch (e) {
      logger.warn('[girlfriends] category telemetry failed', { err: String(e) });
    }
    if (presetDbId) {
      try {
        const { data: presetStat } = await client
          .from('character_presets')
          .select('usage_count')
          .eq('id', presetDbId)
          .maybeSingle();
        await client
          .from('character_presets')
          .update({
            usage_count: Number((presetStat as { usage_count?: number } | null)?.usage_count || 0) + 1,
            last_used_at: new Date().toISOString(),
          })
          .eq('id', presetDbId);
      } catch (e) {
        logger.warn('[girlfriends] usage telemetry failed', { err: String(e) });
      }
    }
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

  // Create initial intimacy score — start at 300 (热恋期 / Passionate) for user-created girlfriends
  await client
    .from('intimacy_scores')
    .insert({
      user_id: user.id,
      girlfriend_id: girlfriend.id,
      score: 300,
      level: 3,
      last_daily_reset: new Date().toISOString().split('T')[0],
    });

  // The generated character art is also the companion's first private album item.
  if (portraitKey) {
    const { error: mediaError } = await client.from('chat_media').insert({
      user_id: user.id,
      girlfriend_id: girlfriend.id,
      media_type: 'image',
      url: portraitKey,
      metadata: { source: 'character_creator', asset_role: 'character-art', intimacy_level: 3 },
    });
    if (mediaError) {
      logger.warn('[girlfriends] creator portrait album save failed', {
        girlfriend_id: girlfriend.id,
        error: mediaError.message,
      });
    }
  }

  // Auto-add to friend list (created companions are automatically friends)
  await client
    .from('user_friends')
    .insert({ user_id: user.id, girlfriend_id: girlfriend.id, source: 'created' })
    .then(({ error: friendErr }) => {
      if (friendErr) logger.warn('[girlfriends] auto-add friend failed', { error: friendErr.message });
    });

  // Sync: invalidate cached girlfriend lists so other tabs/pages see the new companion
  invalidateGirlfriends();

  // Fire-and-forget: creation achievements (first_creation, collector_*) unlock here.
  checkAchievements(client, user.id).catch(() => {});

  return NextResponse.json({
    girlfriend,
    cards_remaining: cardResult.remaining,
    stats: {
      ...finalStats,
      score: finalScore,
      rarity: finalRarity,
    },
  });
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
  // Strip admin-controlled fields — owners cannot set these directly.
  // Public visibility and slug are only managed via /api/admin/review.
  delete updates.is_public;
  delete updates.slug;
  delete updates.submitted_at;
  delete updates.approved_at;
  if (pAvatar !== undefined) updates.avatar_url = await ensureImageKey(pAvatar, 'girlfriends');
  if (pPortrait !== undefined) updates.portrait_url = await ensureImageKey(pPortrait, 'girlfriends');

  // If toggling to public (pending review)
  const patchData: Record<string, unknown> = { ...updates };

  // Pin/unpin handling
  if (updates.is_pinned === true) {
    patchData.is_pinned = true;
    patchData.pinned_at = new Date().toISOString();
  } else if (updates.is_pinned === false) {
    patchData.is_pinned = false;
    patchData.pinned_at = null;
  }

  if (review_status === 'pending') {
    patchData.review_status = 'pending';
    patchData.submitted_at = new Date().toISOString();
    patchData.is_public = false; // will become public after admin approval
    patchData.rejection_reason = null; // fresh submission clears the old reason
  } else if (review_status === 'draft') {
    // Owners may withdraw their own pending submission back to a private draft.
    const { data: current } = await client
      .from('girlfriends')
      .select('review_status')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();
    if ((current as { review_status?: string } | null)?.review_status !== 'pending') {
      return NextResponse.json(
        { error: 'Only pending submissions can be withdrawn' },
        { status: 403 },
      );
    }
    patchData.review_status = 'draft';
    patchData.submitted_at = null;
    patchData.is_public = false;
  } else if (review_status) {
    // Owners can only submit for review (pending). Approval / rejection /
    // removal are admin-only operations handled by /api/admin/review.
    // Prevent self-approval or direct public visibility.
    return NextResponse.json(
      { error: 'Only admins can change review status to ' + review_status },
      { status: 403 },
    );
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

  // Clear all chat history for this companion (delete = wipe conversation).
  try {
    await client
      .from('chat_messages')
      .delete()
      .eq('user_id', user.id)
      .eq('girlfriend_id', id);
  } catch (err) {
    logger.warn('[girlfriends] clear chat messages failed', { err: String(err), id });
  }

  // Soft-delete: mark as removed instead of hard-deleting so companion data is preserved.
  // "Delete" only removes the friend relationship, not the companion itself.
  const { error } = await client
    .from('girlfriends')
    .update({ review_status: 'removed', is_public: false })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sync: invalidate cached girlfriend lists so removal propagates
  invalidateGirlfriends();

  return NextResponse.json({ success: true, intimacy_reset: true, soft_removed: true });
}
