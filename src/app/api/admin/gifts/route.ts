import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  GIFT_EFFECT_OPTIONS,
  isGiftEffectType,
  isSvgaUrl,
  slugifyGiftCode,
  type ChatGift,
  type GiftEffectType,
} from '@/lib/gifts/catalog';
import {
  createGift,
  deleteGift,
  listGifts,
  seedDefaultGifts,
  updateGift,
} from '@/lib/gifts/store';
import { ensureChatGiftsTable } from '@/lib/gifts/ensure-table';
import { invalidateGifts } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';

const WRITE_LIMIT = { maxRequests: 80, windowMs: 60 * 60 * 1000 };

function sanitizeBody(body: Record<string, unknown>): Partial<ChatGift> & { name?: string } {
  const out: Partial<ChatGift> & { name?: string } = {};
  if (body.name != null) out.name = String(body.name).trim().slice(0, 128);
  if (body.code != null) {
    out.code = String(body.code)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 64);
  } else if (out.name) {
    out.code = slugifyGiftCode(out.name);
  }
  if (body.emoji != null) out.emoji = String(body.emoji).trim().slice(0, 32) || '🎁';
  if (body.description != null) out.description = String(body.description).slice(0, 500);
  if (body.icon_url != null) out.icon_url = String(body.icon_url).trim() || null;
  if (body.effect_asset_url != null) {
    out.effect_asset_url = String(body.effect_asset_url).trim() || null;
  }
  if (body.cost_tokens != null) out.cost_tokens = Math.max(0, Math.round(Number(body.cost_tokens) || 0));
  if (body.intimacy_boost != null)
    out.intimacy_boost = Math.max(0, Math.round(Number(body.intimacy_boost) || 0));
  if (body.sort_order != null) out.sort_order = Math.round(Number(body.sort_order) || 0);
  if (body.is_active != null) out.is_active = Boolean(body.is_active);

  let effect_config: ChatGift['effect_config'] = {};
  if (body.effect_config != null) {
    if (typeof body.effect_config === 'string') {
      try {
        effect_config = JSON.parse(body.effect_config) as ChatGift['effect_config'];
      } catch {
        effect_config = {};
      }
    } else if (typeof body.effect_config === 'object' && !Array.isArray(body.effect_config)) {
      effect_config = body.effect_config as ChatGift['effect_config'];
    }
  }
  out.effect_config = effect_config;

  if (body.effect_type != null) {
    out.effect_type = isGiftEffectType(body.effect_type)
      ? (body.effect_type as GiftEffectType)
      : isSvgaUrl(String(out.effect_asset_url || ''))
        ? 'svga'
        : 'float_emoji';
  } else if (isSvgaUrl(String(out.effect_asset_url || ''))) {
    out.effect_type = 'svga';
  }

  return out;
}

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  try {
    const includeInactive = new URL(request.url).searchParams.get('all') === '1';
    const result = await listGifts(supabase, { includeInactive });
    return NextResponse.json({
      gifts: result.gifts,
      effects: GIFT_EFFECT_OPTIONS,
      source: result.source,
      total: result.gifts.length,
      hint: result.hint,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gifts:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    if (body.action === 'ensure_table') {
      // Optional: only works with real DB URL
      const probe = await listGifts(supabase, { includeInactive: true });
      if (probe.source === 'db') {
        return NextResponse.json({
          success: true,
          method: 'rest',
          message: 'chat_gifts 表已可用',
        });
      }
      const r = await ensureChatGiftsTable(true);
      if (r.ok) {
        return NextResponse.json({ success: true, method: r.method });
      }
      // Soft: site_settings fallback is fine
      return NextResponse.json({
        success: true,
        method: 'site_settings_fallback',
        message:
          '专用表未创建，将使用 site_settings 保存礼物（功能可用）。可选：在 SQL Editor 执行 0010_chat_gifts.sql',
      });
    }

    if (body.action === 'seed_defaults') {
      const result = await seedDefaultGifts(supabase);
      if (result.error && result.seeded === 0) {
        return NextResponse.json(
          { error: result.error, code: 'seed_failed' },
          { status: 500 },
        );
      }
      invalidateGifts();
      return NextResponse.json({
        success: true,
        seeded: result.seeded,
        source: result.source,
      });
    }

    const fields = sanitizeBody(body);
    if (!fields.name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const result = await createGift(supabase, fields as Partial<ChatGift> & { name: string });
    if ('error' in result) {
      logger.error('[admin/gifts] create failed', { err: result.error });
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    invalidateGifts();
    return NextResponse.json({
      success: true,
      gift: result.gift,
      source: result.source,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/gifts] POST error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gifts:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body?.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const id = String(body.id);
    const fields = sanitizeBody(body);
    const result = await updateGift(supabase, id, fields);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    invalidateGifts();
    return NextResponse.json({
      success: true,
      gift: result.gift,
      source: result.source,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase, user } = adminCheck;

  const rl = await checkRateLimitAsync(`admin-gifts:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const soft = searchParams.get('soft') === '1';
    const result = await deleteGift(supabase, id, soft);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    invalidateGifts();
    return NextResponse.json({ success: true, source: result.source, soft });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
