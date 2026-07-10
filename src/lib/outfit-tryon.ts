/**
 * Simple virtual try-on:
 *   女友图 (face/body consistency) + 服装描述/服装图 = 换装结果图
 *
 * Stack: RunPod FLUX img2img (girl as reference) + strong clothing prompt.
 * Outfit preview image is used as style text cue (full dual-image VTON needs extra Comfy nodes).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getOutfitById, resolveOutfitMeta, type OutfitCatalogItem } from '@/lib/outfit-catalog';
import { runpodClient } from '@/lib/runpod';
import { logger } from '@/lib/logger';

export type TryOnInput = {
  client: SupabaseClient;
  userId: string;
  girlfriendId: string;
  /** catalog slug e.g. maid-costume */
  outfitId?: string;
  /** optional direct clothing image URL (overrides catalog preview) */
  outfitImageUrl?: string;
  /** optional free-text clothing override */
  outfitText?: string;
  /** denoise 0.35–0.75: lower keeps face more, higher changes clothes more */
  strength?: number;
};

export type TryOnResult = {
  ok: boolean;
  error?: string;
  portrait_url?: string;
  outfit?: OutfitCatalogItem | { id: string; name: string; wear_prompt: string };
  girlfriend?: Record<string, unknown>;
};

function buildWearPrompt(
  outfit: OutfitCatalogItem | null,
  outfitText?: string,
  hasOutfitImage?: boolean,
): string {
  const parts: string[] = [];
  if (outfitText?.trim()) parts.push(outfitText.trim());
  if (outfit?.wear_prompt) parts.push(outfit.wear_prompt);
  else if (outfit?.name) {
    parts.push(`wearing ${outfit.name}${outfit.description ? `: ${outfit.description}` : ''}`);
  }
  if (hasOutfitImage) {
    parts.push(
      'match the clothing design, color, fabric and silhouette of the provided outfit fashion reference',
    );
  }
  if (parts.length === 0) {
    parts.push('wearing a stylish fashionable outfit');
  }
  return parts.join(', ');
}

/**
 * One-shot try-on: write outfit to girlfriend + generate new portrait.
 */
export async function tryOnOutfit(input: TryOnInput): Promise<TryOnResult> {
  const { client, userId, girlfriendId } = input;

  if (!runpodClient.isConfigured) {
    return {
      ok: false,
      error:
        '出图未配置：请在 Vercel 设置 RUNPOD_API_KEY 与 RUNPOD_ENDPOINT_ID（ComfyUI/FLUX 端点）',
    };
  }

  const { data: gf, error: gfErr } = await client
    .from('girlfriends')
    .select(
      'id, user_id, name, portrait_url, avatar_url, base_portrait_url, character_card, appearance_race, appearance_hair, appearance_hair_color, appearance_eyes, appearance_body',
    )
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .single();

  if (gfErr || !gf) {
    return { ok: false, error: 'Girlfriend not found' };
  }

  const girlImage =
    (gf.portrait_url as string) ||
    (gf.avatar_url as string) ||
    (gf.base_portrait_url as string) ||
    null;

  if (!girlImage) {
    return {
      ok: false,
      error: '该女友还没有肖像图，请先生成或上传一张形象图再换装',
    };
  }

  let outfit = input.outfitId
    ? resolveOutfitMeta(input.outfitId, getOutfitById(input.outfitId))
    : null;

  // Optional DB outfits row
  if (input.outfitId && !outfit) {
    try {
      const { data } = await client
        .from('outfits')
        .select('*')
        .eq('id', input.outfitId)
        .maybeSingle();
      if (data) outfit = resolveOutfitMeta(input.outfitId, data as Partial<OutfitCatalogItem>);
    } catch {
      /* ignore */
    }
  }

  const outfitImageUrl =
    input.outfitImageUrl ||
    (outfit?.preview_url as string | null) ||
    null;

  const wear = buildWearPrompt(outfit, input.outfitText, !!outfitImageUrl);
  const outfitName = outfit?.name || input.outfitText?.slice(0, 40) || 'Custom Outfit';

  const faceBits = [
    gf.appearance_race ? `${gf.appearance_race} ethnicity` : '',
    gf.appearance_hair_color || gf.appearance_hair
      ? `${[gf.appearance_hair_color, gf.appearance_hair].filter(Boolean).join(' ')} hair`
      : '',
    gf.appearance_eyes ? `${gf.appearance_eyes} eyes` : '',
    gf.appearance_body ? `${gf.appearance_body} figure` : '',
  ]
    .filter(Boolean)
    .join(', ');

  // Core formula: same girl + new clothes
  const prompt = [
    `Photo of the same young woman as the reference image, identity preserved, same face`,
    faceBits,
    wear,
    'three-quarter body shot, head to mid-thighs, standing pose, looking at viewer',
    'sexy alluring, large breasts, wide hips, soft cinematic lighting',
    'ultra photorealistic, 8k, sharp focus, natural skin texture',
    `outfit name: ${outfitName}`,
  ]
    .filter(Boolean)
    .join(', ');

  const negative =
    'different person, face change, ugly, deformed, bad anatomy, blurry, watermark, text, logo, child, underage, wrong identity, extra limbs';

  // strength: 0.5 keeps face; 0.65 changes clothes more
  const denoise = Math.min(0.75, Math.max(0.35, input.strength ?? 0.55));

  let portraitUrl: string;
  try {
    // Primary: girl as img2img base (keeps face)
    const urls = await runpodClient.generateAndUpload(
      {
        prompt,
        negative_prompt: negative,
        width: 832,
        height: 1216,
        num_inference_steps: 26,
        guidance_scale: 3.5,
        input_image: girlImage,
        denoising_strength: denoise,
      },
      'tryon',
    );
    if (!urls[0]) throw new Error('No image returned');
    portraitUrl = urls[0];
  } catch (e) {
    logger.error('[try-on] generate failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return {
      ok: false,
      error: e instanceof Error ? e.message : '换装生成失败',
    };
  }

  // Backup original once
  const basePortrait =
    (gf.base_portrait_url as string) ||
    (gf.portrait_url as string) ||
    (gf.avatar_url as string) ||
    null;

  const card =
    gf.character_card && typeof gf.character_card === 'object'
      ? { ...(gf.character_card as Record<string, unknown>) }
      : {};
  const appearance =
    card.appearance && typeof card.appearance === 'object'
      ? { ...(card.appearance as Record<string, unknown>) }
      : {};
  appearance.style = outfitName;
  appearance.outfit = outfitName;
  appearance.clothing = wear;
  if (outfit?.id) appearance.outfit_id = outfit.id;
  card.appearance = appearance;
  card.outfit = {
    id: outfit?.id || 'custom',
    name: outfitName,
    wear_prompt: wear,
    try_on: true,
  };

  const gfUpdate: Record<string, unknown> = {
    portrait_url: portraitUrl,
    avatar_url: portraitUrl,
    appearance_style: `${outfitName}`,
    character_card: card,
    equipped_outfit_id: outfit?.id || 'custom',
    equipped_outfit_name: outfitName,
  };
  if (!gf.base_portrait_url && basePortrait) {
    gfUpdate.base_portrait_url = basePortrait;
  }

  // Wardrobe bookkeeping (best-effort; table may be missing)
  if (outfit?.id) {
    try {
      await client
        .from('wardrobe')
        .update({ is_equipped: false })
        .eq('user_id', userId)
        .eq('girlfriend_id', girlfriendId)
        .eq('is_equipped', true);

      const { data: existing } = await client
        .from('wardrobe')
        .select('id')
        .eq('user_id', userId)
        .eq('girlfriend_id', girlfriendId)
        .eq('outfit_id', outfit.id)
        .maybeSingle();

      if (existing) {
        await client
          .from('wardrobe')
          .update({
            is_equipped: true,
            gifted: true,
            equipped_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await client.from('wardrobe').insert({
          user_id: userId,
          girlfriend_id: girlfriendId,
          outfit_id: outfit.id,
          is_equipped: true,
          gifted: true,
          equipped_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      logger.warn('[try-on] wardrobe write skipped', {
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const { data: updated, error: upErr } = await client
    .from('girlfriends')
    .update(gfUpdate)
    .eq('id', girlfriendId)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (upErr) {
    // Image was generated; still return URL even if DB partial fail
    return {
      ok: true,
      portrait_url: portraitUrl,
      outfit: outfit || { id: 'custom', name: outfitName, wear_prompt: wear },
      error: `形象已生成，但保存角色失败: ${upErr.message}`,
    };
  }

  return {
    ok: true,
    portrait_url: portraitUrl,
    outfit: outfit || { id: 'custom', name: outfitName, wear_prompt: wear },
    girlfriend: updated as Record<string, unknown>,
  };
}
