import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  try {
    const db = guard.supabase;

    // Girlfriends
    let girlfriends: unknown[] = [];
    try {
      const { data, error } = await db
        .from('girlfriends')
        .select('id, name, personality, avatar_url, portrait_url, created_at, slug, tags, review_status, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body, appearance_style, character_card')
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (data) {
        girlfriends = data.map((gf: Record<string, unknown>) => {
          // Extract appearance from character_card if available
          const cc = (gf.character_card || {}) as Record<string, unknown>;
          const appearance = (cc.appearance || {}) as Record<string, string>;
          
          // Build appearance string for display
          const appearanceParts: string[] = [];
          const race = (gf.appearance_race as string) || appearance.race || '';
          const hair = (gf.appearance_hair as string) || appearance.hair_style || '';
          const hairColor = (gf.appearance_hair_color as string) || appearance.hair_color || '';
          const eyes = (gf.appearance_eyes as string) || appearance.eyes || '';
          const body = (gf.appearance_body as string) || appearance.body || '';
          
          if (race) appearanceParts.push(race);
          if (hairColor && hair) appearanceParts.push(`${hairColor} ${hair}`);
          else if (hair) appearanceParts.push(hair);
          if (eyes) appearanceParts.push(`${eyes} eyes`);
          if (body) appearanceParts.push(`${body} figure`);
          
          return {
            ...gf,
            imageUrl: gf.avatar_url || gf.portrait_url || null,
            hasImage: !!(gf.avatar_url || gf.portrait_url),
            itemCategory: 'girlfriend',
            field: 'avatar_url',
            portraitUrl: gf.portrait_url || null,
            appearance: appearanceParts.join(', '),
          };
        });
      }
    } catch {
      /* table may not exist */
    }

    // Outfits   description / category / tier
    let outfits: unknown[] = [];
    try {
      const { data, error } = await db
        .from('outfits')
        .select('id, name, description, category, preview_url, tier')
        .order('name');
      if (!error && data) {
        outfits = data.map((o: Record<string, unknown>) => ({
          ...o,
          imageUrl: o.preview_url || null,
          hasImage: !!o.preview_url,
          itemCategory: 'outfit',
          field: 'preview_url',
        }));
      }
    } catch {
      /* table may not exist */
    }

    // Shop / prop items   description / item_type / category / intimacy_boost
    let shopItems: unknown[] = [];
    try {
      const { data, error } = await db
        .from('shop_items')
        .select('id, name, description, image_url, item_type, category, intimacy_boost')
        .order('name');
      if (!error && data) {
        shopItems = data.map((si: Record<string, unknown>) => ({
          ...si,
          imageUrl: si.image_url || null,
          hasImage: !!si.image_url,
          itemCategory: 'shop_item',
          field: 'image_url',
        }));
      }
    } catch {
      /* table may not exist */
    }

    return NextResponse.json({ girlfriends, outfits, shopItems });
  } catch (error) {
    logger.error('list error:', { data: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load list' },
      { status: 500 }
    );
  }
}