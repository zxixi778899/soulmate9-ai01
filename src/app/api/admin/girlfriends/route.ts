import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';
import { invalidateGirlfriends } from '@/lib/revalidate';
import { resolveImageUrl } from '@/lib/storage';
import {
  clampTrait,
  randomizeGirlfriendTraits,
} from '@/lib/girlfriend-traits';

export const dynamic = 'force-dynamic';

/**
 * Resolve raw storage keys to browser-usable URLs for admin display.
 * This ensures the admin page shows the same images as the frontend.
 */
async function resolveGirlfriendMedia(g: Record<string, unknown>): Promise<Record<string, unknown>> {
  const portrait_url = await resolveImageUrl(g.portrait_url as string | null | undefined);
  const avatar_url = await resolveImageUrl(g.avatar_url as string | null | undefined);
  const card_url = await resolveImageUrl(g.card_url as string | null | undefined);
  const portrait_video_url = await resolveImageUrl(g.portrait_video_url as string | null | undefined);
  const avatar_video_url = await resolveImageUrl(g.avatar_video_url as string | null | undefined);
  const image_url = portrait_url || avatar_url || card_url || '';
  return {
    ...g,
    portrait_url: portrait_url || g.portrait_url || '',
    avatar_url: avatar_url || g.avatar_url || '',
    card_url: card_url || g.card_url || '',
    portrait_video_url: portrait_video_url || g.portrait_video_url || '',
    avatar_video_url: avatar_video_url || g.avatar_video_url || '',
    image_url,
  };
}

async function syncFeaturedFromGirlfriend(
  supabase: SupabaseClient,
  id: string,
  isFeatured?: boolean | null,
): Promise<void> {
  const { data: gf } = await supabase.from('girlfriends').select('*').eq('id', id).maybeSingle();
  if (!gf) return;

  const row = gf as {
    is_featured?: boolean | null;
    tags?: string[] | null;
    portrait_url?: string | null;
    avatar_url?: string | null;
    card_url?: string | null;
    name?: string | null;
    short_description?: string | null;
    personality?: string | null;
    backstory?: string | null;
    sort_order?: number | null;
  };

  const featured = isFeatured === true || row.is_featured === true;
  if (!featured) {
    if (isFeatured === false) {
      await supabase.from('featured_girlfriends').delete().eq('base_girlfriend_id', id);
    }
    return;
  }

  const tags = Array.isArray(row.tags) ? row.tags : [];
  const avatar = row.portrait_url || row.avatar_url || row.card_url || '';
  if (!avatar) return;

  const { data: existing } = await supabase
    .from('featured_girlfriends')
    .select('id')
    .eq('base_girlfriend_id', id)
    .limit(1);

  const payload = {
    name: row.name,
    subtitle: row.short_description || null,
    avatar_url: avatar,
    description: row.short_description || row.personality || row.backstory || null,
    personality_tags: tags,
    is_active: true,
    sort_order: Number(row.sort_order || 0),
  };

  if (existing && existing.length > 0) {
    await supabase.from('featured_girlfriends').update(payload).eq('base_girlfriend_id', id);
  } else {
    await supabase.from('featured_girlfriends').insert({
      ...payload,
      greeting_message: null,
      quick_chat_enabled: true,
      base_girlfriend_id: id,
    });
  }
}

const ADMIN_GF_WRITE_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 }; // 60/h/admin

// PATCH **** user_id / id / created_at 
const ALLOWED_PATCH_FIELDS = new Set<string>([
  'name',
  'age',
  'gender',
  'slug',
  'personality',
  'tags',
  'short_description',
  'backstory',
  'portrait_url',
  'avatar_url',
  'appearance_hair',
  'appearance_hair_color',
  'appearance_eyes',
  'appearance_body',
  'appearance_style',
  'is_public',
  'review_status',
  'rejection_reason',
  'submitted_at',
  'approved_at',
  'avatar_video_url',
  'portrait_video_url',
  'card_url',
  'album_urls',
  'face_reference_url',
  'image_prompt',
  'negative_prompt',
  'appearance_race',
  'voice',
  'relationship',
  'occupation',
  'hobbies',
  'outfit_id',
  // Catalog game fields
  'rarity',
  'access_status',
  'unlock_price_tokens',
  'base_intimacy',
  'base_desire',
  'base_development',
  'base_kink',
  // Homepage placement (merged from featured/hot)
  'is_hot',
  'is_featured',
  'hot_score',
  'sort_order',
]);

const RARITIES = new Set(['N', 'R', 'SR', 'SSR']);
const ACCESS_STATUSES = new Set(['open', 'locked', 'closed']);

function clampStat(v: unknown, fallback = 0): number {
  return clampTrait(v, 0, 100, fallback);
}

function missingColumnFromError(message: string): string | null {
  const schemaCache = message.match(/Could not find the ['"]([^'"]+)['"] column/i);
  if (schemaCache?.[1]) return schemaCache[1];
  const postgres = message.match(/column\s+(?:girlfriends\.)?["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
  return postgres?.[1] || null;
}

//  age 18+ M17
function validateAge(age: unknown): { ok: true; age: number } | { ok: false; error: string } {
  const n = Number(age);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'age must be an integer' };
  }
  if (n < 18 || n > 99) {
    return { ok: false, error: 'age must be between 18 and 99' };
  }
  return { ok: true, age: n };
}

interface GeneratedProfile {
  name: string;
  age: number;
  personality: string;
  tags: string[];
  short_description: string;
  backstory: string;
  appearance: {
    race: string;
    hair: string;
    hair_color: string;
    eyes: string;
    body: string;
    style: string;
  };
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { searchParams } = new URL(request.url);
  const id = (searchParams.get('id') || '').trim();
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const status = searchParams.get('status') || '';
  const q = searchParams.get('q')?.trim() || '';
  const visibility = searchParams.get('visibility') || ''; // public | private
  const creator = searchParams.get('creator') || ''; // system | user
  const sort = searchParams.get('sort') || 'created_at';
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    if (id) {
      const { data, error: oneErr } = await supabase
        .from('girlfriends')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (oneErr) throw oneErr;
      if (!data) {
        return NextResponse.json({ girlfriend: null, girlfriends: [], total: 0 });
      }
      const resolved = await resolveGirlfriendMedia(data as Record<string, unknown>);
      return NextResponse.json({
        girlfriend: resolved,
        girlfriends: [resolved],
        total: 1,
      });
    }

    let query = supabase.from('girlfriends').select('*', { count: 'exact' });

    if (status && ['draft', 'pending', 'approved', 'rejected'].includes(status)) {
      query = query.eq('review_status', status);
    }
    if (q) {
      query = query.ilike('name', `%${q}%`);
    }
    if (visibility === 'public') {
      query = query.eq('is_public', true);
    } else if (visibility === 'private') {
      query = query.eq('is_public', false);
    }
    if (creator === 'system') {
      query = query.is('user_id', null);
    } else if (creator === 'user') {
      query = query.not('user_id', 'is', null);
    }

    const sortField = ['created_at', 'updated_at', 'name'].includes(sort) ? sort : 'created_at';
    const { data, count, error: queryErr } = await query
      .order(sortField, { ascending: order === 'asc' })
      .range(from, to);

    if (queryErr) throw queryErr;
    const resolved = await Promise.all(
      (data || []).map((g) => resolveGirlfriendMedia(g as Record<string, unknown>))
    );
    return NextResponse.json({
      girlfriends: resolved,
      total: count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gf-write:${user.id}`, ADMIN_GF_WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many admin girlfriend requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, ADMIN_GF_WRITE_LIMIT) },
    );
  }

  try {
    const body = await request.json();

    //  Batch create via LLM 
    if (body.batch) {
      return await handleBatchCreate(supabase, user, body.count, body.gender);
    }

    //  age 18+ 
    const ageCheck = validateAge(body.age);
    if (!ageCheck.ok) {
      return NextResponse.json({ error: ageCheck.error }, { status: 400 });
    }

    const rarity = RARITIES.has(String(body.rarity || '').toUpperCase())
      ? String(body.rarity).toUpperCase()
      : 'R';
    const accessStatus = ACCESS_STATUSES.has(String(body.access_status || ''))
      ? String(body.access_status)
      : 'open';

    const slug = makeGirlfriendSlug(body.name, body.slug);
    // Default heat stats into product range 50–100 when omitted
    const rnd = randomizeGirlfriendTraits({
      keepAge: ageCheck.age,
      keepOccupation: body.occupation || null,
      keepHobbies: body.hobbies || null,
    });
    const insertRow: Record<string, unknown> = {
      user_id: user.id,
      name: body.name,
      age: ageCheck.age,
      gender: ['Female', 'Male', 'Transgender'].includes(String(body.gender)) ? body.gender : 'Female',
      slug,
      personality: body.personality || '',
      tags: body.tags || [],
      short_description: body.short_description || '',
      backstory: body.backstory || '',
      occupation: String(body.occupation || rnd.occupation || '').trim() || null,
      hobbies: String(body.hobbies || rnd.hobbies || '').trim() || null,
      portrait_url: body.portrait_url || null,
      avatar_url: body.avatar_url || null,
      card_url: body.card_url || null,
      portrait_video_url: body.portrait_video_url || null,
      avatar_video_url: body.avatar_video_url || null,
      voice: body.voice || null,
      image_prompt: body.image_prompt || null,
      negative_prompt: body.negative_prompt || null,
      appearance_hair: body.appearance_hair || body.appearance?.hair || '',
      appearance_hair_color: body.appearance_hair_color || body.appearance?.hair_color || '',
      appearance_eyes: body.appearance_eyes || body.appearance?.eyes || '',
      appearance_body: body.appearance_body || body.appearance?.body || '',
      appearance_style: body.appearance_style || body.appearance?.style || '',
      appearance_race: body.appearance_race || body.appearance?.race || '',
      is_public: body.is_public !== undefined ? body.is_public : true,
      review_status: body.review_status || 'approved',
      age_verified: true,
      rarity,
      access_status: accessStatus,
      unlock_price_tokens: Math.max(0, Number(body.unlock_price_tokens) || 0),
      base_intimacy: clampStat(
        body.base_intimacy != null ? body.base_intimacy : rnd.base_intimacy,
        rnd.base_intimacy,
      ),
      base_desire: clampStat(
        body.base_desire != null ? body.base_desire : rnd.base_desire,
        rnd.base_desire,
      ),
      base_development: clampStat(
        body.base_development != null ? body.base_development : rnd.base_development,
        rnd.base_development,
      ),
      base_kink: clampStat(
        body.base_kink != null ? body.base_kink : rnd.base_kink,
        rnd.base_kink,
      ),
      is_hot: Boolean(body.is_hot),
      is_featured: Boolean(body.is_featured),
      hot_score: Math.max(0, Math.round(Number(body.hot_score) || 0)),
      sort_order: Math.round(Number(body.sort_order) || 0),
    };

    // Drop unknown columns so older DBs still accept create
    let data: Record<string, unknown> | null = null;
    let insertErr: { message?: string } | null = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await supabase.from('girlfriends').insert(insertRow).select().single();
      insertErr = result.error;
      if (!insertErr) {
        data = result.data as Record<string, unknown>;
        break;
      }
      const missing = missingColumnFromError(insertErr.message || '');
      if (missing && missing in insertRow) {
        delete insertRow[missing];
        continue;
      }
      break;
    }
    if (insertErr) throw insertErr;

    if (data?.is_featured === true) {
      try {
        await syncFeaturedFromGirlfriend(supabase, String(data.id), true);
      } catch (syncErr) {
        logger.warn('[admin/girlfriends] featured sync on create failed', {
          err: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    invalidateGirlfriends(slug);
    return NextResponse.json({ girlfriend: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gf-write:${user.id}`, ADMIN_GF_WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many admin girlfriend requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, ADMIN_GF_WRITE_LIMIT) },
    );
  }

  try {
    const body = await request.json();

    // Bulk: randomize age / intimacy / occupation / hobbies / passion / openness / kink
    if (body?.action === 'randomize_traits') {
      const { data: rows, error: listErr } = await supabase
        .from('girlfriends')
        .select('id, age, occupation, hobbies')
        .limit(2000);
      if (listErr) {
        logger.warn('[admin/girlfriends] randomize_traits list failed', {
          err: listErr.message,
          code: listErr.code,
          hint: listErr.hint,
        });
        throw listErr;
      }

      logger.info('[admin/girlfriends] randomize_traits starting', {
        found: (rows || []).length,
        firstId: (rows || [])[0]?.id ?? null,
      });

      const randomizedRows: Array<{ id: string; patch: Record<string, unknown> }> = [];
      for (const row of rows || []) {
        const id = String((row as { id?: string }).id || '');
        if (!id) continue;
        const traits = randomizeGirlfriendTraits({
          keepAge: null, // re-roll age in 20–28 unless you want to keep — user asked full random
          keepOccupation: null,
          keepHobbies: null,
        });
        // Always re-roll all trait fields
        randomizedRows.push({ id, patch: {
          age: traits.age,
          base_intimacy: traits.base_intimacy,
          base_desire: traits.base_desire,
          base_development: traits.base_development,
          base_kink: traits.base_kink,
          occupation: traits.occupation,
          hobbies: traits.hobbies,
        } });
      }

      let updated = 0;
      const errors: string[] = [];
      for (let start = 0; start < randomizedRows.length; start += 20) {
        const chunk = randomizedRows.slice(start, start + 20);
        const results = await Promise.all(chunk.map(async ({ id, patch }) => {
          const { error } = await supabase.from('girlfriends').update(patch).eq('id', id);
          return { id, error };
        }));
        for (const result of results) {
          if (result.error) errors.push(`${result.id}: ${result.error.message}`);
          else updated += 1;
        }
      }
      invalidateGirlfriends();
      logger.info('[admin/girlfriends] randomize_traits done', { updated, errors: errors.length });
      return NextResponse.json({
        ok: true,
        updated,
        total: (rows || []).length,
        errors: errors.slice(0, 10),
        message: `已为 ${updated} 位伴侣随机分配年龄/亲密/职业/爱好/热情/开发/变态值`,
      });
    }

    const { id, ...rawUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Flatten nested appearance if client sent object
    if (rawUpdates.appearance && typeof rawUpdates.appearance === 'object') {
      const app = rawUpdates.appearance as Record<string, string>;
      if (app.hair != null) rawUpdates.appearance_hair = app.hair;
      if (app.hair_color != null) rawUpdates.appearance_hair_color = app.hair_color;
      if (app.eyes != null) rawUpdates.appearance_eyes = app.eyes;
      if (app.body != null) rawUpdates.appearance_body = app.body;
      if (app.style != null) rawUpdates.appearance_style = app.style;
    }

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawUpdates)) {
      if (ALLOWED_PATCH_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if ('age' in updates) {
      const ageCheck = validateAge(updates.age);
      if (!ageCheck.ok) {
        return NextResponse.json({ error: ageCheck.error }, { status: 400 });
      }
      updates.age = ageCheck.age;
    }

    if ('rarity' in updates) {
      const r = String(updates.rarity || '').toUpperCase();
      if (!RARITIES.has(r)) {
        return NextResponse.json({ error: 'rarity must be N|R|SR|SSR' }, { status: 400 });
      }
      updates.rarity = r;
    }
    if ('access_status' in updates) {
      const a = String(updates.access_status || '');
      if (!ACCESS_STATUSES.has(a)) {
        return NextResponse.json({ error: 'access_status must be open|locked|closed' }, { status: 400 });
      }
    }
    for (const k of ['base_intimacy', 'base_desire', 'base_development', 'base_kink'] as const) {
      if (k in updates) updates[k] = clampStat(updates[k], 0);
    }
    if ('unlock_price_tokens' in updates) {
      updates.unlock_price_tokens = Math.max(0, Number(updates.unlock_price_tokens) || 0);
    }
    if ('is_hot' in updates) updates.is_hot = Boolean(updates.is_hot);
    if ('is_featured' in updates) updates.is_featured = Boolean(updates.is_featured);
    if ('hot_score' in updates) {
      updates.hot_score = Math.max(0, Math.round(Number(updates.hot_score) || 0));
    }
    if ('sort_order' in updates) {
      updates.sort_order = Math.round(Number(updates.sort_order) || 0);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
    }

    const appliedUpdates = { ...updates } as Record<string, unknown>;
    const skippedFields: string[] = [];
    let updateError: { message?: string } | null = null;
    for (let attempt = 0; attempt <= Object.keys(updates).length; attempt += 1) {
      const result = await supabase.from('girlfriends').update(appliedUpdates).eq('id', id);
      updateError = result.error;
      if (!updateError) break;

      const message = updateError.message || '';
      const missingColumn = missingColumnFromError(message);
      if (missingColumn && missingColumn in appliedUpdates) {
        delete appliedUpdates[missingColumn];
        skippedFields.push(missingColumn);
        continue;
      }

      // Older deployments may report a generic schema-cache error without the
      // exact field. Remove only optional placement fields, then retry once.
      if (/schema cache|column/i.test(message)) {
        const optionalPlacementFields = ['is_hot', 'is_featured', 'hot_score', 'sort_order'];
        const removable = optionalPlacementFields.filter((field) => field in appliedUpdates);
        if (removable.length) {
          removable.forEach((field) => {
            delete appliedUpdates[field];
            skippedFields.push(field);
          });
          continue;
        }
      }
      throw updateError;
    }
    if (updateError) throw updateError;

    // Re-sync featured marketing row when placement OR media/identity changes
    const mediaOrIdentityKeys = [
      'is_featured',
      'name',
      'short_description',
      'personality',
      'tags',
      'portrait_url',
      'avatar_url',
      'card_url',
      'sort_order',
    ];
    const shouldSyncFeatured = mediaOrIdentityKeys.some((k) => k in appliedUpdates);
    if (shouldSyncFeatured) {
      try {
        const featuredFlag =
          'is_featured' in appliedUpdates
            ? Boolean(appliedUpdates.is_featured)
            : undefined;
        await syncFeaturedFromGirlfriend(
          supabase,
          id,
          featuredFlag === undefined ? null : featuredFlag,
        );
      } catch (syncErr) {
        logger.warn('[admin/girlfriends] featured sync failed', {
          err: syncErr instanceof Error ? syncErr.message : String(syncErr),
        });
      }
    }

    const { data: girlfriend, error: readBackError } = await supabase
      .from('girlfriends')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (readBackError) throw readBackError;

    const slug =
      (girlfriend?.slug as string | undefined) ||
      (typeof appliedUpdates.slug === 'string' ? appliedUpdates.slug : null);
    invalidateGirlfriends(slug);

    return NextResponse.json({ success: true, girlfriend, skipped_fields: skippedFields });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gf-write:${user.id}`, ADMIN_GF_WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many admin girlfriend requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, ADMIN_GF_WRITE_LIMIT) },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Best-effort slug for ISR bust before delete
    let slug: string | null = null;
    let gfName: string | null = null;
    try {
      const { data: row } = await supabase.from('girlfriends').select('slug, name').eq('id', id).maybeSingle();
      slug = (row?.slug as string) || null;
      gfName = (row?.name as string) || null;
    } catch {
      /* ignore */
    }

    // Clean up featured_girlfriends: match by base_girlfriend_id AND by name
    // (name fallback handles cases where featured row has a different base ID)
    try {
      await supabase.from('featured_girlfriends').delete().eq('base_girlfriend_id', id);
      if (gfName) {
        await supabase.from('featured_girlfriends').delete().eq('name', gfName);
      }
    } catch (featuredErr) {
      logger.warn('[admin/girlfriends] featured cleanup failed (non-critical)', {
        err: featuredErr instanceof Error ? featuredErr.message : String(featuredErr),
        id,
      });
    }

    const { error: deleteErr } = await supabase.from('girlfriends').delete().eq('id', id);
    if (deleteErr) throw deleteErr;
    invalidateGirlfriends(slug);
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

//  Build image prompt for character consistency 
function buildImagePrompt(profile: GeneratedProfile, gender = 'Female'): string {
  const appearance = profile.appearance;
  const parts: string[] = [];

  // Base quality tags
  parts.push('masterpiece', 'best quality', 'ultra detailed', 'professional photography');

  // Gender-aware character description
  if (gender === 'Male') {
    parts.push(`1boy, solo, handsome man, ${profile.name || 'young man'}`);
  } else if (gender === 'Transgender') {
    parts.push(`1girl, solo, transgender woman, ${profile.name || 'young woman'}`);
  } else {
    parts.push(`1girl, solo, ${profile.name || 'young woman'}`);
  }

  // Race/ethnicity
  if (appearance?.race) {
    parts.push(gender === 'Male' ? `${appearance.race} man` : `${appearance.race} woman`);
  }

  // Age
  if (profile.age) parts.push(`${profile.age} years old`);

  // Hair
  if (appearance.hair_color) parts.push(`${appearance.hair_color} hair`);
  if (appearance.hair) parts.push(`${appearance.hair} hairstyle`);

  // Eyes
  if (appearance.eyes) parts.push(`${appearance.eyes} eyes`);

  // Body
  if (appearance.body) parts.push(`${appearance.body} body type`);

  // Style
  if (appearance.style) parts.push(`wearing ${appearance.style} clothing`);

  // Personality-based expression
  const personality = (profile.personality || '').toLowerCase();
  if (personality.includes('shy') || personality.includes('gentle')) {
    parts.push('soft smile', 'gentle expression');
  } else if (personality.includes('bold') || personality.includes('confident')) {
    parts.push('confident smile', 'direct gaze');
  } else if (personality.includes('playful') || personality.includes('flirty')) {
    parts.push('playful wink', 'mischievous smile');
  } else if (personality.includes('mysterious')) {
    parts.push('mysterious gaze', 'slight smirk');
  } else {
    parts.push('warm smile', 'friendly expression');
  }

  // Lighting and atmosphere
  parts.push('soft studio lighting', 'bokeh background', 'shallow depth of field');

  return parts.join(', ');
}

//  Batch create handler 
async function handleBatchCreate(supabase: any, user: { id: string }, rawCount: number, rawGender?: string) {
  const count = Math.min(Math.max(Number(rawCount) || 3, 1), 10);
  const gender = ['Female', 'Male', 'Transgender'].includes(String(rawGender)) ? String(rawGender) : 'Female';

  // Gender-aware LLM prompt
  const genderInstruction = gender === 'Male'
    ? `Generate diverse, compelling MALE companion characters (boyfriends) with rich personalities and detailed appearances.
Each character MUST have a male first name, masculine appearance details, and male-appropriate descriptions.`
    : gender === 'Transgender'
      ? `Generate diverse, compelling transgender companion characters with rich personalities and detailed appearances.
Each character MUST have a feminine name, feminine appearance with tall graceful proportions, and confident authentic presentation.`
      : `Generate diverse, compelling girlfriend characters with rich personalities and detailed appearances.`;

  const nameInstruction = gender === 'Male'
    ? '- name: Unique English male first name (2-10 letters, NO duplicates)'
    : '- name: Unique English female first name (2-8 letters, NO duplicates)';

  const bodyOptions = gender === 'Male'
    ? '- body: One of [Lean muscular, Athletic, Broad-shouldered, Slim, Tall and lean, Swimmer build, Boxer physique, V-taper, Powerful, Well-proportioned]'
    : '- body: One of [Petite, Slim, Athletic, Curvy, Busty, Hourglass, Tall and lean]';

  const systemPrompt = `You are an expert character designer for a premium AI companion platform targeting Western audiences (18+).
${genderInstruction}

Return ONLY valid JSON: {"girlfriends": [...]}
Each character MUST have:
${nameInstruction}
- age: Integer 19-32
- gender: "${gender}"
- personality: 2-3 sentences. Include their communication style, quirks, what makes them unique in conversation
- tags: Array of 4-6 descriptive English tags (e.g., "Sultry", "Bookworm", "Adventurous", "Flirty", "Artistic")
- short_description: One captivating sentence that makes someone want to talk to them
- backstory: 2-3 sentences. Where they're from, what they do, a hint of mystery
- appearance: Object with these EXACT keys:
  - race: One of [Caucasian, Asian, Latino/Latina, Ebony, Arab, Indian, Mixed, Slavic, Mediterranean, Nordic]
  - hair: Specific style (e.g., ${gender === 'Male' ? '"Short cropped", "Textured fade", "Slicked back", "Messy quiff", "Undercut"' : '"Long wavy", "Pixie cut", "Twin braids", "Messy bun", "Straight bob"'})
  - hair_color: Specific color (e.g., "Platinum blonde", "Raven black", "Copper red", "Ash brown", "Dark brown")
  - eyes: Specific eye description (e.g., "Deep emerald green", "Honey brown", "Ice blue", "Steel gray")
${bodyOptions}
  - style: Fashion style (e.g., ${gender === 'Male' ? '"Suited and sharp", "Casual masculine", "Streetwear", "Sporty athletic", "Classic gentleman", "Edgy rock"' : '"Boho chic", "Minimalist elegance", "Streetwear", "Classic feminine", "Edgy alternative", "Cozy academic"'})

DIVERSITY RULES - each batch MUST include:
- At least 3 different races
- At least 3 different hair colors
- At least 3 different body types
- Mix of personality archetypes (shy, bold, intellectual, playful, mysterious)
- Age spread across the 19-32 range

STYLE RULES:
- Names must be memorable and fit the character's background
- Descriptions should evoke emotion and curiosity
- Appearance details must be specific enough for consistent image generation
- Avoid generic descriptions like "beautiful" or "pretty" - show, don't tell
- Each character should feel like a real person with depth

Generate EXACTLY ${count} characters. Use ONLY English.`;

  const userPrompt = `Generate ${count} unique, diverse ${gender === 'Male' ? 'male companion' : gender === 'Transgender' ? 'transgender companion' : 'girlfriend'} characters. Make each one unforgettable.`;

  // Direct HTTP LLM call (bypass SDK to avoid "Missing credentials" issue)
  const API_BASE = process.env.COZE_INTEGRATION_BASE_URL || 'https://integration.coze.cn';
  const API_KEY = process.env.COZE_WORKLOAD_IDENTITY_API_KEY || '';
  if (!API_KEY) {
    return NextResponse.json({ error: 'LLM credentials not configured' }, { status: 500 });
  }

  const llmRes = await fetch(`${API_BASE}/api/v3/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'doubao-seed-2-0-pro-260215',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.95,
      max_tokens: 2048,
      stream: false,
    }),
  });

  if (!llmRes.ok) {
    const errText = await llmRes.text().catch(() => 'unknown');
    return NextResponse.json({ error: `[LLM_DIRECT] LLM API error (${llmRes.status}): ${errText}` }, { status: 500 });
  }

  // Parse SSE response
  const reader = llmRes.body?.getReader();
  if (!reader) return NextResponse.json({ error: 'No response body' }, { status: 500 });
  const decoder = new TextDecoder();
  let fullContent = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (line.startsWith('data: ')) {
        try {
          const parsed = JSON.parse(line.slice(6));
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (delta) fullContent += delta;
        } catch { /* skip non-JSON lines */ }
      }
    }
  }

  const text = fullContent.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return NextResponse.json(
      { error: 'LLM returned invalid format', raw: text.slice(0, 500) },
      { status: 500 }
    );
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const profiles: GeneratedProfile[] = parsed.girlfriends || parsed;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return NextResponse.json(
      { error: 'LLM returned empty array', raw: text.slice(0, 500) },
      { status: 500 }
    );
  }

  const created: Record<string, unknown>[] = [];

  for (const profile of profiles.slice(0, count)) {
    // Defensive: ensure name is always a valid string
    const rawName = String(profile.name || `Girl-${Date.now()}`).trim();
    const safeName = rawName.length > 0 ? rawName : `Girl-${Date.now()}`;

    const slug = makeGirlfriendSlug(safeName);

    // Ensure age is valid
    const safeAge = Number(profile.age) >= 18 && Number(profile.age) <= 99 ? Number(profile.age) : 22;

    const { data, error: insertErr } = await supabase
      .from('girlfriends')
      .insert({
        user_id: user.id,
        name: safeName,
        age: safeAge,
        gender,
        slug,
        personality: String(profile.personality || ''),
        tags: Array.isArray(profile.tags) ? profile.tags : [],
        short_description: String(profile.short_description || ''),
        backstory: String(profile.backstory || ''),
        portrait_url: null,
        avatar_url: null,
        appearance_race: String(profile.appearance?.race || ''),
        appearance_hair: String(profile.appearance?.hair || ''),
        appearance_hair_color: String(profile.appearance?.hair_color || ''),
        appearance_eyes: String(profile.appearance?.eyes || ''),
        appearance_body: String(profile.appearance?.body || ''),
        appearance_style: String(profile.appearance?.style || ''),
        image_prompt: buildImagePrompt(profile, gender),
        is_public: false,
        review_status: 'draft',
        age_verified: true,
      })
      .select()
      .single();

    if (insertErr) {
      logger.error('admin/girlfriends: batch insert failed', { insertErr });
      continue;
    }

    created.push(data);
  }

  return NextResponse.json({
    success: true,
    count: created.length,
    girlfriends: created,
  });
}
