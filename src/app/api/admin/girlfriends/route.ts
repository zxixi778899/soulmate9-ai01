import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

// PATCH 允许修改的字段白名单，**严禁**透传 user_id / id / created_at 等敏感字段
const ALLOWED_PATCH_FIELDS = new Set<string>([
  'name',
  'age',
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
]);

// 服务端 age 18+ 强校验（M17）
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
    return NextResponse.json({
      girlfriends: data || [],
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

  try {
    const body = await request.json();

    // ── Batch create via LLM ──
    if (body.batch) {
      return await handleBatchCreate(supabase, user, body.count);
    }

    // 服务端 age 18+ 校验
    const ageCheck = validateAge(body.age);
    if (!ageCheck.ok) {
      return NextResponse.json({ error: ageCheck.error }, { status: 400 });
    }

    const { data, error: insertErr } = await supabase
      .from('girlfriends')
      .insert({
        user_id: user.id,
        name: body.name,
        age: ageCheck.age,
        slug: body.slug || body.name.toLowerCase().replace(/\s+/g, '-'),
        personality: body.personality || '',
        tags: body.tags || [],
        short_description: body.short_description || '',
        backstory: body.backstory || '',
        portrait_url: body.portrait_url || null,
        avatar_url: body.avatar_url || null,
        appearance_hair: body.appearance_hair || '',
        appearance_hair_color: body.appearance_hair_color || '',
        appearance_eyes: body.appearance_eyes || '',
        appearance_body: body.appearance_body || '',
        appearance_style: body.appearance_style || '',
        is_public: body.is_public !== undefined ? body.is_public : false,
        review_status: body.review_status || 'approved',
        age_verified: true,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return NextResponse.json({ girlfriend: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const body = await request.json();
    const { id, ...rawUpdates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // 字段白名单过滤：禁止透传 user_id 等敏感字段（M15 修复）
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawUpdates)) {
      if (ALLOWED_PATCH_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    // age 字段若存在，强制 18+ 校验
    if ('age' in updates) {
      const ageCheck = validateAge(updates.age);
      if (!ageCheck.ok) {
        return NextResponse.json({ error: ageCheck.error }, { status: 400 });
      }
      updates.age = ageCheck.age;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });
    }

    const { error: updateErr } = await supabase
      .from('girlfriends')
      .update(updates)
      .eq('id', id);

    if (updateErr) throw updateErr;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error: deleteErr } = await supabase.from('girlfriends').delete().eq('id', id);
    if (deleteErr) throw deleteErr;
    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── Batch create handler ──
async function handleBatchCreate(supabase: any, user: { id: string }, rawCount: number) {
  const count = Math.min(Math.max(Number(rawCount) || 3, 1), 10);

  // LLM generates random girlfriend profiles
  const systemPrompt = `You are a creative character generator for a Western-market AI companion platform (18+).
Generate diverse, interesting girlfriend characters with unique personalities, appearances, and backgrounds.

Return ONLY valid JSON with a "girlfriends" array. Each item must have:
- name: A unique English female name (first name only, 2-8 letters)
- age: A number between 18 and 35
- personality: 1-2 sentences describing her personality traits and vibe
- tags: Array of 3-5 English tags
- short_description: A one-sentence tagline describing her
- backstory: 1-2 sentences of backstory
- appearance: An object with: hair, hair_color, eyes, body, style

CRITICAL rules:
- Each character must be UNIQUE - different names, personalities, appearances
- Make profiles feel real and diverse
- Keep it tasteful and romantic, not explicit
- Generate EXACTLY ${count} characters
- Use ONLY English for all text values`;

  const userPrompt = `Generate ${count} unique, diverse girlfriend characters for an AI companion platform.`;

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
    const slug = profile.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    const { data, error: insertErr } = await supabase
      .from('girlfriends')
      .insert({
        user_id: user.id,
        name: profile.name,
        age: profile.age,
        slug: `${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        personality: profile.personality || '',
        tags: profile.tags || [],
        short_description: profile.short_description || '',
        backstory: profile.backstory || '',
        portrait_url: null,
        avatar_url: null,
        appearance_hair: profile.appearance?.hair || '',
        appearance_hair_color: profile.appearance?.hair_color || '',
        appearance_eyes: profile.appearance?.eyes || '',
        appearance_body: profile.appearance?.body || '',
        appearance_style: profile.appearance?.style || '',
        is_public: false,
        review_status: 'draft',
        age_verified: true,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('Failed to insert girlfriend:', insertErr);
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