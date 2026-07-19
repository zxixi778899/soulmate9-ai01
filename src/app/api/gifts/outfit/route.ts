import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { getOutfitById, type OutfitCatalogItem } from '@/lib/outfit-catalog';
import { equipOutfitOnGirlfriend } from '@/lib/wardrobe-equip';
import { invalidateShop, invalidateGirlfriends } from '@/lib/revalidate';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RL = { maxRequests: 20, windowMs: 60 * 60 * 1000 }; // 20 gifts per hour

/** Localized girlfriend reaction messages when receiving an outfit gift. */
const REACTIONS = [
  (name: string) =>
    `*receives the ${name} and tears open the wrapping excitedly* Oh my god! This is gorgeous! Give me a sec, I'm changing into it right now... I'll take a photo for you~ `,
  (name: string) =>
    `*eyes light up* Wow! The ${name}! How did you know I've been wanting this?! Let me go put it on, don't you dare look away~ `,
  (name: string) =>
    `*hugs you tight* Thank you so much, babe! The ${name} is absolutely stunning! I'm going to change right now, wait for me~ `,
  (name: string) =>
    `*blushing* You really picked this out for me? The ${name}... it's perfect. I'll try it on and come show you, okay? `,
];

/**
 * POST /api/gifts/outfit
 * Body: { outfit_id: string, girlfriend_id: string }
 *
 * Gift-to-outfit flow:
 * 1. Validate outfit exists in catalog
 * 2. Verify girlfriend belongs to user
 * 3. Check wardrobe for duplicate ownership
 * 4. Deduct credits (if price > 0)
 * 5. Record purchase in purchase_history
 * 6. Add outfit to wardrobe + equip on girlfriend
 * 7. Insert an AI "reaction" message from the girlfriend
 * 8. Return success + message preview + outfit details
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user, client, error: authError } = await getAuthUser(req);
  if (!user || !client) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Rate limit
  const rl = await checkRateLimitAsync(`gift-outfit:${user.id}`, RL);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many gifts. Please wait a moment.' },
      { status: 429, headers: rateLimitHeaders(rl, RL) },
    );
  }

  // Parse body
  const body = await req.json().catch((): null => null);
  const outfitId = body?.outfit_id as string | undefined;
  const girlfriendId = body?.girlfriend_id as string | undefined;

  if (!outfitId || !girlfriendId) {
    return NextResponse.json(
      { error: 'outfit_id and girlfriend_id are required' },
      { status: 400 },
    );
  }

  try {
    // 1. Load outfit from catalog (source of truth)
    const outfit: OutfitCatalogItem | null = getOutfitById(outfitId);
    if (!outfit) {
      return NextResponse.json(
        { error: `Outfit not found: ${outfitId}` },
        { status: 404 },
      );
    }

    // 2. Verify girlfriend belongs to user
    const { data: gf, error: gfError } = await client
      .from('girlfriends')
      .select('id, name, portrait_url, avatar_url, appearance_style, character_card, equipped_outfit_id')
      .eq('id', girlfriendId)
      .eq('user_id', user.id)
      .single();

    if (gfError || !gf) {
      return NextResponse.json({ error: 'Girlfriend not found' }, { status: 404 });
    }

    // 3. Check if user already owns this outfit for this girlfriend
    const { data: existingWardrobe } = await client
      .from('wardrobe')
      .select('id')
      .eq('user_id', user.id)
      .eq('girlfriend_id', girlfriendId)
      .eq('outfit_id', outfit.id)
      .maybeSingle();

    if (existingWardrobe) {
      return NextResponse.json(
        { error: 'You already gifted this outfit to this girlfriend', code: 'DUPLICATE_GIFT' },
        { status: 409 },
      );
    }

    // 4. Deduct credits if outfit has a price
    if (outfit.price_cents > 0) {
      const { data: profile, error: profileError } = await client
        .from('profiles')
        .select('credits_remaining')
        .eq('user_id', user.id)
        .single();

      if (profileError || !profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }

      const balance: number = profile.credits_remaining ?? 0;
      if (balance < outfit.price_cents) {
        return NextResponse.json(
          {
            error: `Insufficient credits. Need ${outfit.price_cents}, have ${balance}`,
            code: 'INSUFFICIENT_CREDITS',
          },
          { status: 402 },
        );
      }

      // Atomic deduction: only update if credits_remaining >= price
      const { error: deductError, count: updatedCount } = await client
        .from('profiles')
        .update({ credits_remaining: balance - outfit.price_cents })
        .eq('user_id', user.id)
        .gte('credits_remaining', outfit.price_cents)
        .select();

      if (deductError) {
        logger.error('[gift-outfit] credit deduction failed', { err: deductError.message });
        return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
      }

      if (updatedCount === 0) {
        return NextResponse.json(
          { error: 'Insufficient credits (concurrent request)', code: 'INSUFFICIENT_CREDITS' },
          { status: 402 },
        );
      }
    }

    // 5. Record the gift in purchase_history
    await client.from('purchase_history').insert({
      user_id: user.id,
      item_type: 'outfit_gift',
      item_id: outfit.id,
      amount_cents: outfit.price_cents,
      status: 'completed',
      metadata: {
        gift_type: 'outfit',
        outfit_id: outfit.id,
        outfit_name: outfit.name,
        girlfriend_id: girlfriendId,
        girlfriend_name: gf.name,
      },
    });

    // 6. Add to wardrobe + equip on girlfriend (handles unequipping previous outfit)
    const equipResult = await equipOutfitOnGirlfriend({
      client,
      userId: user.id,
      girlfriendId,
      outfitId: outfit.id,
      regeneratePortrait: false, // image gen is queued separately below
    });

    if (!equipResult.ok) {
      logger.error('[gift-outfit] equip failed after purchase', {
        error: equipResult.error,
        outfitId: outfit.id,
        girlfriendId,
      });
      // Credits were already deducted, log for manual review
      return NextResponse.json(
        { error: `Gift recorded but equip failed: ${equipResult.error}` },
        { status: 500 },
      );
    }

    // 7. Insert AI reaction message from girlfriend
    const reactionFn = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
    const reactionText = reactionFn(outfit.name);

    const { data: reactionMsg } = await client
      .from('chat_messages')
      .insert({
        girlfriend_id: girlfriendId,
        user_id: user.id,
        role: 'assistant',
        content: reactionText,
        metadata: {
          type: 'outfit_reaction',
          outfit_id: outfit.id,
          outfit_name: outfit.name,
          gift: true,
        },
      })
      .select('id, role, content, created_at')
      .single();

    // 8. Queue image generation (best-effort, non-blocking)
    let imageQueued = false;
    try {
      const { runpodClient } = await import('@/lib/runpod');
      if (runpodClient.isConfigured) {
        // Fire-and-forget: queue the generation without awaiting
        const basePortrait =
          (gf.portrait_url as string) || (gf.avatar_url as string) || null;
        const prompt = [
          `Three-quarter body portrait of ${gf.name}, a stunningly beautiful young woman`,
          outfit.wear_prompt,
          'large breasts, wide hips, sexy alluring, soft cinematic lighting',
          'ultra photorealistic, 8k, sharp focus, looking at viewer',
          `${outfit.name}: ${outfit.description}`,
        ].join(', ');

        runpodClient
          .generateAndUpload(
            {
              prompt,
              negative_prompt:
                'blurry, deformed, bad anatomy, watermark, text, child, underage, wrong clothes',
              width: 832,
              height: 1216,
              num_inference_steps: 24,
              guidance_scale: 3.5,
              input_image: basePortrait || undefined,
              denoising_strength: basePortrait ? 0.55 : undefined,
            },
            'gift-outfit',
          )
          .then((urls: string[]) => {
            if (urls[0]) {
              client
                .from('girlfriends')
                .update({ portrait_url: urls[0], avatar_url: urls[0] })
                .eq('id', girlfriendId)
                .eq('user_id', user.id)
                .then(() => {
                  logger.info('[gift-outfit] portrait updated after image gen', {
                    girlfriendId,
                    outfitId: outfit.id,
                  });
                });
            }
          })
          .catch((e: unknown) => {
            logger.warn('[gift-outfit] background image gen failed', {
              err: e instanceof Error ? e.message : String(e),
            });
          });

        imageQueued = true;
      }
    } catch {
      // RunPod not configured or import failed — non-critical
      logger.info('[gift-outfit] RunPod not available, skipping image queue');
    }

    logger.info('[gift-outfit] success', {
      userId: user.id,
      girlfriendId,
      outfitId: outfit.id,
      priceCents: outfit.price_cents,
      imageQueued,
    });

    // 9. Sync caches: gift changes wardrobe + girlfriend portrait + credits
    invalidateShop();
    invalidateGirlfriends();

    // 10. Return success
    return NextResponse.json({
      success: true,
      message: reactionMsg,
      outfit: {
        id: outfit.id,
        name: outfit.name,
        description: outfit.description,
        wear_prompt: outfit.wear_prompt,
        tier: outfit.tier,
        emoji: outfit.emoji,
      },
      girlfriend: {
        id: gf.id,
        name: gf.name,
      },
      credits_deducted: outfit.price_cents,
      image_queued: imageQueued,
      wardrobe_item: equipResult.wardrobe_item,
    });
  } catch (e) {
    logger.error('[gift-outfit] unexpected error', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Gift failed' },
      { status: 500 },
    );
  }
}
