/**
 * Equip an outfit onto a girlfriend:
 * 1) wardrobe row equip (one active per girl)
 * 2) update appearance_style + character_card + equipped_outfit_*
 * 3) optional portrait regenerate with wear_prompt + face consistency
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOutfitById, resolveOutfitMeta, type OutfitCatalogItem } from '@/lib/outfit-catalog';
import { logger } from '@/lib/logger';

export type EquipResult = {
  ok: boolean;
  error?: string;
  outfit?: OutfitCatalogItem;
  girlfriend?: Record<string, unknown>;
  wardrobe_item?: Record<string, unknown>;
  portrait_url?: string | null;
  regenerated?: boolean;
};

async function loadOutfit(
  client: SupabaseClient,
  outfitId: string,
): Promise<OutfitCatalogItem | null> {
  const catalog = getOutfitById(outfitId);
  try {
    const { data } = await client
      .from('outfits')
      .select('id, name, description, tier, category, price_cents, intimacy_boost, preview_url')
      .or(`id.eq.${outfitId},slug.eq.${outfitId}`)
      .maybeSingle();
    if (data) return resolveOutfitMeta(outfitId, data as Partial<OutfitCatalogItem>);
  } catch {
    /* table may use only uuid or no slug */
  }
  try {
    const { data } = await client
      .from('outfits')
      .select('id, name, description, tier, category, price_cents, intimacy_boost, preview_url')
      .eq('id', outfitId)
      .maybeSingle();
    if (data) return resolveOutfitMeta(String(data.id), data as Partial<OutfitCatalogItem>);
  } catch {
    /* ignore */
  }
  return catalog;
}

function mergeCharacterCard(
  card: Record<string, unknown> | null | undefined,
  outfit: OutfitCatalogItem,
): Record<string, unknown> {
  const base = card && typeof card === 'object' ? { ...card } : {};
  const appearance =
    base.appearance && typeof base.appearance === 'object'
      ? { ...(base.appearance as Record<string, unknown>) }
      : {};
  appearance.style = outfit.name;
  appearance.outfit = outfit.name;
  appearance.outfit_id = outfit.id;
  appearance.clothing = outfit.wear_prompt;
  base.appearance = appearance;
  base.outfit = {
    id: outfit.id,
    name: outfit.name,
    description: outfit.description,
    wear_prompt: outfit.wear_prompt,
  };
  return base;
}

/**
 * Equip outfit for user+girlfriend. Creates wardrobe row if missing.
 */
export async function equipOutfitOnGirlfriend(opts: {
  client: SupabaseClient;
  userId: string;
  girlfriendId: string;
  outfitId: string;
  wardrobeItemId?: string;
  regeneratePortrait?: boolean;
}): Promise<EquipResult> {
  const { client, userId, girlfriendId, outfitId, wardrobeItemId, regeneratePortrait } = opts;

  const outfit = await loadOutfit(client, outfitId);
  if (!outfit) {
    return { ok: false, error: `Unknown outfit: ${outfitId}` };
  }

  // Ownership check
  const { data: gf, error: gfErr } = await client
    .from('girlfriends')
    .select(
      'id, user_id, name, portrait_url, avatar_url, base_portrait_url, appearance_style, character_card, equipped_outfit_id',
    )
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .single();

  if (gfErr || !gf) {
    return { ok: false, error: 'Girlfriend not found' };
  }

  // Unequip others for this girl
  await client
    .from('wardrobe')
    .update({ is_equipped: false })
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .eq('is_equipped', true);

  let wardrobeItem: Record<string, unknown> | null = null;

  if (wardrobeItemId) {
    const { data, error } = await client
      .from('wardrobe')
      .update({
        girlfriend_id: girlfriendId,
        is_equipped: true,
        gifted: true,
        outfit_id: outfit.id,
        equipped_at: new Date().toISOString(),
      })
      .eq('id', wardrobeItemId)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) return { ok: false, error: error.message };
    wardrobeItem = data as Record<string, unknown>;
  } else {
    // Find existing ownership row or insert
    const { data: existing } = await client
      .from('wardrobe')
      .select('*')
      .eq('user_id', userId)
      .eq('girlfriend_id', girlfriendId)
      .eq('outfit_id', outfit.id)
      .maybeSingle();

    if (existing) {
      const { data, error } = await client
        .from('wardrobe')
        .update({
          is_equipped: true,
          gifted: true,
          equipped_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) return { ok: false, error: error.message };
      wardrobeItem = data as Record<string, unknown>;
    } else {
      // Free outfits can be equipped without prior purchase; paid must exist
      if (outfit.tier !== 'free' && outfit.price_cents > 0) {
        // allow equip if user owns for any girlfriend
        const { data: owned } = await client
          .from('wardrobe')
          .select('id')
          .eq('user_id', userId)
          .eq('outfit_id', outfit.id)
          .limit(1)
          .maybeSingle();
        if (!owned) {
          return {
            ok: false,
            error: 'You do not own this outfit. Purchase it in the shop first.',
          };
        }
      }
      const { data, error } = await client
        .from('wardrobe')
        .insert({
          user_id: userId,
          girlfriend_id: girlfriendId,
          outfit_id: outfit.id,
          is_equipped: true,
          gifted: true,
          equipped_at: new Date().toISOString(),
        })
        .select('*')
        .single();
      if (error) return { ok: false, error: error.message };
      wardrobeItem = data as Record<string, unknown>;
    }
  }

  // Backup original portrait once
  const basePortrait =
    (gf.base_portrait_url as string) ||
    (gf.portrait_url as string) ||
    (gf.avatar_url as string) ||
    null;

  const nextStyle = `${outfit.name}: ${outfit.description}`;
  const nextCard = mergeCharacterCard(
    gf.character_card as Record<string, unknown> | null,
    outfit,
  );

  const gfUpdate: Record<string, unknown> = {
    appearance_style: nextStyle,
    character_card: nextCard,
    equipped_outfit_id: outfit.id,
    equipped_outfit_name: outfit.name,
  };
  if (!gf.base_portrait_url && basePortrait) {
    gfUpdate.base_portrait_url = basePortrait;
  }

  let portraitUrl = (gf.portrait_url as string) || null;
  let regenerated = false;

  if (regeneratePortrait) {
    try {
      const gen = await regenerateGirlfriendPortrait({
        name: String(gf.name || 'companion'),
        referenceUrl: basePortrait,
        wearPrompt: outfit.wear_prompt,
        styleHint: nextStyle,
      });
      if (gen) {
        portraitUrl = gen;
        gfUpdate.portrait_url = gen;
        gfUpdate.avatar_url = gen;
        regenerated = true;
      }
    } catch (e) {
      logger.warn('[wardrobe-equip] portrait regen failed', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { data: updatedGf, error: upErr } = await client
    .from('girlfriends')
    .update(gfUpdate)
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  return {
    ok: true,
    outfit,
    girlfriend: updatedGf as Record<string, unknown>,
    wardrobe_item: wardrobeItem || undefined,
    portrait_url: portraitUrl,
    regenerated,
  };
}

export async function unequipOutfitOnGirlfriend(opts: {
  client: SupabaseClient;
  userId: string;
  girlfriendId: string;
  restoreBasePortrait?: boolean;
}): Promise<EquipResult> {
  const { client, userId, girlfriendId, restoreBasePortrait } = opts;

  const { data: gf, error: gfErr } = await client
    .from('girlfriends')
    .select('id, base_portrait_url, portrait_url, character_card')
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .single();

  if (gfErr || !gf) return { ok: false, error: 'Girlfriend not found' };

  await client
    .from('wardrobe')
    .update({ is_equipped: false })
    .eq('user_id', userId)
    .eq('girlfriend_id', girlfriendId)
    .eq('is_equipped', true);

  const card =
    gf.character_card && typeof gf.character_card === 'object'
      ? { ...(gf.character_card as Record<string, unknown>) }
      : {};
  if (card.appearance && typeof card.appearance === 'object') {
    const ap = { ...(card.appearance as Record<string, unknown>) };
    delete ap.outfit;
    delete ap.outfit_id;
    delete ap.clothing;
    card.appearance = ap;
  }
  delete card.outfit;

  const update: Record<string, unknown> = {
    equipped_outfit_id: null,
    equipped_outfit_name: null,
    appearance_style: null,
    character_card: card,
  };

  if (restoreBasePortrait && gf.base_portrait_url) {
    update.portrait_url = gf.base_portrait_url;
    update.avatar_url = gf.base_portrait_url;
  }

  const { data: updatedGf, error } = await client
    .from('girlfriends')
    .update(update)
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, girlfriend: updatedGf as Record<string, unknown> };
}

/**
 * Best-effort FLUX regen with outfit wear prompt + optional reference image.
 */
async function regenerateGirlfriendPortrait(opts: {
  name: string;
  referenceUrl: string | null;
  wearPrompt: string;
  styleHint: string;
}): Promise<string | null> {
  const apiKey = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY || '';
  const endpointId = process.env.RUNPOD_ENDPOINT_ID || '';
  if (!apiKey || !endpointId) {
    logger.warn('[wardrobe-equip] RunPod not configured, skip portrait regen');
    return null;
  }

  try {
    const { runpodClient } = await import('@/lib/runpod');
    if (!runpodClient.isConfigured) {
      logger.warn('[wardrobe-equip] RunPod not configured, skip portrait regen');
      return null;
    }
    const prompt = [
      `Three-quarter body portrait of ${opts.name}, a stunningly beautiful young woman`,
      opts.wearPrompt,
      'large breasts, wide hips, sexy alluring, soft cinematic lighting',
      'ultra photorealistic, 8k, sharp focus, looking at viewer',
      opts.styleHint,
    ].join(', ');

    const urls = await runpodClient.generateAndUpload(
      {
        prompt,
        negative_prompt:
          'blurry, deformed, bad anatomy, watermark, text, child, underage, wrong clothes',
        width: 832,
        height: 1216,
        num_inference_steps: 24,
        guidance_scale: 3.5,
        input_image: opts.referenceUrl || undefined,
        denoising_strength: opts.referenceUrl ? 0.55 : undefined,
      },
      'wardrobe',
    );
    return urls[0] || null;
  } catch (e) {
    logger.warn('[wardrobe-equip] portrait regen failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
