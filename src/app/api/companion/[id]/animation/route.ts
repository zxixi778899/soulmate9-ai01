import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';
import {
  getCompanionAnimations,
  getAnimationForSlot,
} from '@/lib/animation-service';
import type { CompanionAnimation } from '@/lib/animation-presets';

export const dynamic = 'force-dynamic';

/**
 * GET /api/companion/[id]/animation
 * Public endpoint — returns animation URLs for a companion's portrait.
 * No auth required (public companion data).
 *
 * Response:
 * {
 *   idle?: string;       // URL for idle breathing animation
 *   greeting?: string;   // URL for wave hello animation
 *   reaction?: string;   // URL for giggle reaction animation
 *   all: CompanionAnimation[];
 * }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Companion ID required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseClient();

    // Fetch slot animations + all animations in parallel
    const [idleAnim, greetingAnim, reactionAnim, allAnimations] = await Promise.all([
      getAnimationForSlot(id, 'idle', supabase),
      getAnimationForSlot(id, 'greeting', supabase),
      getAnimationForSlot(id, 'reaction', supabase),
      getCompanionAnimations(id, supabase),
    ]);

    const response: {
      idle?: string;
      greeting?: string;
      reaction?: string;
      all: CompanionAnimation[];
    } = {
      all: allAnimations,
    };

    if (idleAnim?.video_url) response.idle = idleAnim.video_url;
    if (greetingAnim?.video_url) response.greeting = greetingAnim.video_url;
    if (reactionAnim?.video_url) response.reaction = reactionAnim.video_url;

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    logger.error('[companion/animation] GET error', {
      companionId: id,
      error: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: 'Failed to fetch animations' },
      { status: 500 },
    );
  }
}
