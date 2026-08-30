import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { CREDIT_COSTS, deductCredits, grantCredits } from '@/lib/credit-system';
import {
  audioMime,
  cacheVoiceAudio,
  getCachedVoiceUrl,
  getVoiceForCompanionV2,
  synthesizeSpeech,
  type TTSResult,
} from '@/lib/tts-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 20 voice messages / minute / user
const VOICE_RATE_LIMIT = { maxRequests: 20, windowMs: 60_000 };
const MAX_TEXT_LENGTH = 300;

/**
 * POST /api/ai/voice
 * Body: { text: string, girlfriend_id: string, emotion?: string }
 *
 * Generates a voice message for a companion using the configured TTS voice.
 * Costs CREDIT_COSTS.tts_extra credits. Returns a hosted audio URL.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUser(req);
    if (!auth.user || !auth.client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { user, client } = auth;

    // Membership redesign: TTS consumes credits and is a paid-tier surface.
    // Free users get a structured code so the UI shows an upgrade guide.
    // Admin role always bypasses the membership check.
    const { data: tierProfile } = await client
      .from('profiles')
      .select('role, membership_tier')
      .eq('user_id', user.id)
      .maybeSingle();
    const role = String((tierProfile as { role?: string | null } | null)?.role || '').toLowerCase();
    const tier = String((tierProfile as { membership_tier?: string | null } | null)?.membership_tier || 'free');
    if (role !== 'admin' && role !== 'superadmin' && tier === 'free') {
      return NextResponse.json(
        {
          error: 'Voice messages are available on membership plans.',
          code: 'membership_required',
          upgrade_url: '/pricing',
        },
        { status: 403 },
      );
    }

    const rl = await checkRateLimitAsync(`voice-tts:${user.id}`, VOICE_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many voice requests. Please slow down.' },
        { status: 429, headers: rateLimitHeaders(rl, VOICE_RATE_LIMIT) },
      );
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const text = String(body.text || '').trim();
    const girlfriendId = String(body.girlfriend_id || '').trim();
    const emotion = body.emotion ? String(body.emotion) : undefined;

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }
    if (!girlfriendId) {
      return NextResponse.json({ error: 'girlfriend_id is required' }, { status: 400 });
    }

    const cleanText = text.slice(0, MAX_TEXT_LENGTH);

    // 1) Resolve the companion's voice profile (personality-aware). Done
    //    before the cache lookup so the expected audio format is known.
    const { data: companionRow } = await client
      .from('girlfriends')
      .select('id, name, personality, backstory, language, occupation, character_card')
      .eq('id', girlfriendId)
      .maybeSingle();

    const companion = companionRow as Record<string, unknown> | null;
    const voice = await getVoiceForCompanionV2(
      {
        id: girlfriendId,
        name: String(companion?.name || ''),
        personality: String(companion?.personality || ''),
        backstory: String(companion?.backstory || ''),
        language: String(companion?.language || 'en'),
        occupation: String(companion?.occupation || ''),
        voice: String(
          (companion?.character_card as Record<string, unknown> | null)?.voice || '',
        ),
      },
      client,
    );
    if (!voice) {
      return NextResponse.json(
        {
          error: 'No voice is configured for this companion yet.',
          code: 'no_voice_profile',
        },
        { status: 404 },
      );
    }

    // Edge TTS emits MP3; RunPod Fish-Speech/CosyVoice emit Opus.
    const expectedFormat: TTSResult['format'] = voice.engine === 'edge-tts' ? 'mp3' : 'opus';

    // 2) Shared cache hit — same line already spoken by this companion.
    const cached = await getCachedVoiceUrl(cleanText, girlfriendId, client, expectedFormat);
    if (cached) {
      return NextResponse.json({
        audio_url: cached,
        duration_ms: 0,
        format: expectedFormat,
        cached: true,
      });
    }

    // 3) Charge credits before generating.
    const cost = CREDIT_COSTS.tts;
    const deducted = await deductCredits(client, user.id, cost, 'tts_extra', girlfriendId);
    if (!deducted.ok) {
      if (deducted.error === 'insufficient_credits') {
        const { data: profile } = await client
          .from('profiles')
          .select('credits_remaining')
          .eq('user_id', user.id)
          .single();
        return NextResponse.json(
          {
            error: `Insufficient credits. Need ${cost}, have ${profile?.credits_remaining ?? 0}.`,
            code: 'insufficient_credits',
            required: cost,
            balance: profile?.credits_remaining ?? 0,
          },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: 'Failed to deduct credits' }, { status: 500 });
    }

    // 4) Synthesize. Refund on failure so users never pay for errors.
    let tts;
    try {
      tts = await synthesizeSpeech(cleanText, voice, {
        emotion,
        max_length: MAX_TEXT_LENGTH,
      });
    } catch (err) {
      await grantCredits(client, user.id, cost, 'refund', girlfriendId).catch(() => undefined);
      logger.error('[ai/voice] synthesis failed', {
        userId: user.id,
        girlfriendId,
        err: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { error: 'Voice generation failed. Please try again.', code: 'tts_failed' },
        { status: 502 },
      );
    }

    // 5) Persist the audio once into the shared cache (correct MIME/extension)
    //    and serve it straight from there — no duplicate per-user copy.
    const cacheUrl = await cacheVoiceAudio(cleanText, girlfriendId, tts.audio_base64, tts.format);
    let audioUrl = cacheUrl;
    if (!audioUrl) {
      // Cache write failed — synthesize once more into an inline data URL so
      // the user still gets their paid audio.
      audioUrl = `data:${audioMime(tts.format)};base64,${tts.audio_base64}`;
    }

    return NextResponse.json({
      audio_url: audioUrl,
      duration_ms: tts.duration_ms,
      format: tts.format,
      cost,
      balance_after: deducted.balance_after,
    });
  } catch (err) {
    logger.error('[ai/voice] error', { err: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
