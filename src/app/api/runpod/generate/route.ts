/**
 * POST /api/runpod/generate
 * Generate a single image via RunPod, automatically upload to S3
 *
 * Requests:
 * {
 *   prompt: string;
 *   negative_prompt?: string;
 *   size?: { width: number; height: number };
 *   girlfriend_id?: string;   // Use preset prompt for girlfriend
 *   scene?: string;           // Scene type for girlfriend
 *   outfit_category?: string; // Outfit category for outfit presets
 *   custom_details?: string;  // Additional prompt details
 * }
 *
 * Response:
 * {
 *   success: true;
 *   data: {
 *     url: string;      // S3 public URL
 *     prompt: string;   // Full prompt used
 *     key: string;      // S3 storage key
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { runpodClient } from '@/lib/runpod';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { moderateText } from '@/lib/content-moderation';
import {
  buildGirlfriendPrompt,
  buildOutfitPrompt,
  buildHeroPrompt,
  GirlfriendId,
  SceneType,
  OutfitCategory,
} from '@/lib/prompts';

const RUNPOD_GENERATE_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };
const MIN_IMAGE_DIMENSION = 256;
const MAX_IMAGE_DIMENSION = 1024;

function isValidDimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_IMAGE_DIMENSION &&
    value <= MAX_IMAGE_DIMENSION
  );
}

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const { user } = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rl = await checkRateLimitAsync(`runpod-generate:${user.id}`, RUNPOD_GENERATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many image generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, RUNPOD_GENERATE_LIMIT) },
      );
    }

    const body = await req.json();
    const {
      prompt,
      negative_prompt,
      size,
      girlfriend_id,
      scene,
      outfit_category,
      custom_details,
      hero_theme,
    } = body;

    // Build prompt from params or use direct prompt
    let finalPrompt: string;
    let finalNegative: string | undefined;

    if (girlfriend_id && scene) {
      const result = buildGirlfriendPrompt(girlfriend_id as GirlfriendId, scene as SceneType, custom_details);
      finalPrompt = result.prompt;
      finalNegative = result.negative_prompt;
    } else if (outfit_category) {
      const result = buildOutfitPrompt(outfit_category as OutfitCategory, custom_details);
      finalPrompt = result.prompt;
      finalNegative = result.negative_prompt;
    } else if (hero_theme) {
      const result = buildHeroPrompt(hero_theme as 'romantic' | 'mysterious' | 'luxury');
      finalPrompt = result.prompt;
      finalNegative = result.negative_prompt;
    } else if (prompt) {
      finalPrompt = prompt;
      finalNegative = negative_prompt;
    } else {
      return NextResponse.json({ error: 'Missing prompt or preset parameters' }, { status: 400 });
    }

    // // prompt
    const moderation = moderateText(finalPrompt);
    if (!moderation.allowed) {
      logger.warn('RunPod prompt blocked by moderation', {
        userId: user.id,
        reason: moderation.reason,
        matched: moderation.matchedPattern,
      });
      return NextResponse.json(
        { error: 'Prompt violates content policy.', reason: moderation.reason },
        { status: 400 },
      );
    }
    if (finalNegative) {
      const negMod = moderateText(finalNegative);
      if (!negMod.allowed) {
        return NextResponse.json(
          { error: 'Negative prompt violates content policy.', reason: negMod.reason },
          { status: 400 },
        );
      }
    }

    const width = size?.width ?? 768;
    const height = size?.height ?? 1024;
    if (!isValidDimension(width) || !isValidDimension(height)) {
      return NextResponse.json(
        {
          error: `Image size must be an integer between ${MIN_IMAGE_DIMENSION} and ${MAX_IMAGE_DIMENSION}px.`,
        },
        { status: 400 },
      );
    }

    // Check if RunPod is configured
    if (!runpodClient.isConfigured) {
      return NextResponse.json({
        success: false,
        error: 'RunPod not configured',
        message: 'Please set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID environment variables.',
        prompt: finalPrompt,
      }, { status: 503 });
    }

    // Generate via RunPod and upload to S3
    const [url] = await runpodClient.generateAndUpload(
      {
        prompt: finalPrompt,
        negative_prompt: finalNegative,
        width,
        height,
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 7,
      },
    );

    return NextResponse.json({
      success: true,
      data: {
        url,
        prompt: finalPrompt,
      },
    });
  } catch (error) {
    logger.error('RunPod generate error:', { data: error });
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}
