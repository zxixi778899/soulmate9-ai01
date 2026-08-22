import { NextRequest, NextResponse } from 'next/server';
import { authedFetch } from '@/lib/supabase';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { readResponseJson } from '@/lib/safe-json';

/**
 * Turbo Preview Endpoint
 * 
 * Lightweight image generation for real-time parameter preview
 * - 8 steps (vs 28-32 for final)
 * - 640x960 resolution (vs 1024x1536)
 * - Cost: ~15% of full generation
 * 
 * Rate Limit: 10 requests per minute per user
 */

const TURBO_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 }; // 10/min

export const runtime = 'nodejs';
export const maxDuration = 60; // Turbo should complete within 60s

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    // Strict rate limiting for turbo previews
    const rl = await checkRateLimitAsync(`turbo-preview:${user.id}`, TURBO_LIMIT);
    if (!rl.allowed) {
      logger.warn('[Turbo Preview] Rate limit exceeded', { userId: user.id });
      return NextResponse.json(
        { 
          error: 'Too many preview requests. Please wait a moment.',
          retryAfter: Math.ceil(rl.resetInMs / 1000),
        },
        { status: 429, headers: rateLimitHeaders(rl, TURBO_LIMIT) },
      );
    }

    const body = await request.json().catch(() => ({}));
    
    // Extract core parameters
    const name = String(body.name || 'Companion');
    const visual_style = String(body.visual_style || 'realistic').toLowerCase();
    const gender = String(body.gender || 'Female');
    const ethnicity = String(body.ethnicity || 'Asian');
    const face_shape = String(body.face_shape || 'oval');
    const hair_style = String(body.hair_style || 'long flowing');
    const hair_color = String(body.hair_color || '#d4a574');
    const eye_color = String(body.eye_color || 'brown');
    const body_type = String(body.body_type || 'slim');
    const fashion_style = String(body.fashion_style || 'casual');
    const appearance_prompt = String(body.appearance_prompt || '');
    const personality = String(body.personality || '');
    const nsfw_level = Math.max(1, Math.min(5, Number(body.nsfw_level) || 1));

    // 🔥 TURBO SPECIFIC SETTINGS
    const turboSettings = {
      num_inference_steps: 8,           // Minimal steps for speed
      width: 640,                         // Lower resolution
      height: 960,                        // 2:3 aspect ratio
      guidance_scale: 2.5,              // Reduced CFG for faster convergence
      seed: typeof body.seed === 'number' ? body.seed : Math.floor(Math.random() * 2_147_483_647),
    };

    // Build simplified prompt (no scene enhancement for speed)
    const prompt = [
      `visual style: ${visual_style}. Gender: ${gender}.`,
      `${ethnicity} features, ${face_shape} face shape.`,
      `${hair_style} ${hair_color} hair, ${eye_color} eyes.`,
      `${body_type} build, wearing ${fashion_style} outfit.`,
      appearance_prompt && !appearance_prompt.toLowerCase().includes('blur') 
        ? appearance_prompt.slice(0, 200) 
        : '',
      personality && !personality.toLowerCase().includes('blur')
        ? personality.slice(0, 150)
        : '',
      'clear eyes, complete head in frame, natural lighting',
    ]
      .filter(Boolean)
      .join(', ')
      .slice(0, 750); // Shorter token limit for turbo

    const negativePrompt = [
      'blurry, low quality, distorted, deformed, ugly, bad anatomy, extra limbs',
      'text, watermark, signature',
      nsfw_level >= 3 
        ? 'explicit, nudity, genitals'  // NSFW filter for SFW turbo previews
        : '',
    ].filter(Boolean).join(', ');
    void negativePrompt; // Reserved for future use

    logger.info('[Turbo Preview] Generating', {
      userId: user.id,
      params: { visual_style, gender, nsfw_level, turbo: true },
      promptLen: prompt.length,
    });

    // Forward to main generate-portrait endpoint with turbo flags
    const res = await authedFetch('/api/girlfriends/generate-portrait', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        visual_style,
        ethnicity,
        gender,
        face_shape,
        hair_style,
        hair_color,
        eye_color,
        body_type,
        fashion_style,
        appearance_prompt,
        personality,
        nsfw_level,
        // Turbo override parameters
        _turbo_mode: true,
        _turbo_steps: turboSettings.num_inference_steps,
        _turbo_width: turboSettings.width,
        _turbo_height: turboSettings.height,
        _turbo_cfg: turboSettings.guidance_scale,
        _turbo_seed: turboSettings.seed,
        count: 1, // Single image only for preview
      }),
    });

    const data = await readResponseJson<{ imageUrl?: string; error?: string; success?: boolean }>(res);

    if (!res.ok || !data.success || !data.imageUrl) {
      logger.error('[Turbo Preview] Generation failed', { 
        error: data.error,
        status: res.status,
      });
      return NextResponse.json(
        { error: data.error || 'Preview generation failed' },
        { status: res.status },
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: data.imageUrl,
      turbo: true,
      settings: turboSettings,
    });

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Turbo Preview] Unexpected error', { error: errMsg });
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
