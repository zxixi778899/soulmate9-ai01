import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { ensureImageKey, resolveImageUrl } from '@/lib/storage';
import { checkRateLimitAsync, RATE_LIMITS, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const filter = searchParams.get('filter'); // 'draft' | 'all'

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

  // 兼容历史数据：image_url 优先取 portrait_url，回退到 avatar_url
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

  // 限流：30 次/小时（防 RunPod 烧钱 + 防 base64 攻击）
  const rl = await checkRateLimitAsync(`create-girlfriend:${user.id}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many creation attempts. Please slow down.' },
      { status: 429, headers: rateLimitHeaders(rl, RATE_LIMITS.api) }
    );
  }

  // 会员档位 → 最大女友数（与 lib/constants.ts MEMBERSHIP_TIERS 对齐）
  const { data: profile } = await client
    .from('profiles')
    .select('membership_tier')
    .eq('user_id', user.id)
    .maybeSingle();

  const tier = (profile?.membership_tier as string) || 'free';
  const maxGirlfriends: Record<string, number> = {
    free: 2,
    pro: 10,
    premium: -1, // unlimited
    unlimited: -1,
  };
  const maxAllowed = maxGirlfriends[tier] ?? 2;

  if (maxAllowed !== -1) {
    const { count } = await client
      .from('girlfriends')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);
    if ((count ?? 0) >= maxAllowed) {
      return NextResponse.json(
        {
          error: `You have reached the maximum number of companions (${maxAllowed}) for the ${tier} plan. Upgrade to Pro for more.`,
          code: 'GIRLFRIEND_LIMIT_REACHED',
        },
        { status: 403 }
      );
    }
  }

  const body = await request.json();
  const {
    name, age, personality, backstory, avatar_url, voice_id,
    tags, short_description,
    appearance_race, appearance_hair, appearance_hair_color,
    appearance_eyes, appearance_body, appearance_style,
    outfit_id, portrait_url
  } = body;

  if (!name || typeof name !== 'string' || name.length > 64) {
    return NextResponse.json({ error: 'Name is required (max 64 chars)' }, { status: 400 });
  }

  // base64 大小限制（防 Vercel 4.5MB 函数体限制）
  const MAX_B64_SIZE = 3 * 1024 * 1024; // 3MB 解码后 ≈ 4MB base64
  const checkImageSize = (val: unknown, field: string): number => {
    if (typeof val !== 'string' || !val.startsWith('data:')) return 0;
    const payload = val.split(',')[1] || '';
    const size = Math.floor((payload.length * 3) / 4);
    if (size > MAX_B64_SIZE) {
      throw new Error(`${field} too large (max ${MAX_B64_SIZE / 1024 / 1024}MB)`);
    }
    return size;
  };
  try {
    checkImageSize(avatar_url, 'avatar');
    checkImageSize(portrait_url, 'portrait');
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Image too large' },
      { status: 413 }
    );
  }

  // 写入侧：base64 data URL 上传到 OSS，存 key
  const avatarKey = await ensureImageKey(avatar_url, 'girlfriends');
  const portraitKey = await ensureImageKey(portrait_url, 'girlfriends');

  const insertData: Record<string, unknown> = {
    user_id: user.id,
    name,
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
  const { user, client, error: authError } = await g