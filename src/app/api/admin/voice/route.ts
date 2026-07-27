import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { uploadFile } from '@/lib/storage';
import { VOICE_EMOTIONS } from '@/lib/tts-emotion';
import {
  deleteVoiceProfile,
  isTTSConfigured,
  listVoiceProfiles,
  saveVoiceProfile,
  synthesizeSpeech,
  type TTSVoiceProfile,
} from '@/lib/tts-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WRITE_LIMIT = { maxRequests: 120, windowMs: 60 * 60 * 1000 };
const MAX_TEST_TEXT = 300;

function sanitizeProfile(body: Record<string, unknown>): TTSVoiceProfile | { error: string } {
  const companionId = String(body.companion_id || '').trim();
  if (!companionId) return { error: 'companion_id is required' };

  const name = String(body.name || '').trim().slice(0, 128);
  if (!name) return { error: 'name is required' };

  const engine: TTSVoiceProfile['engine'] =
    body.engine === 'cosyvoice' ? 'cosyvoice' : 'fish-speech';
  const language: TTSVoiceProfile['language'] =
    body.language === 'en' || body.language === 'zh' ? body.language : 'auto';

  const pitch =
    body.pitch != null && Number.isFinite(Number(body.pitch))
      ? Number(body.pitch)
      : undefined;
  const speed =
    body.speed != null && Number.isFinite(Number(body.speed))
      ? Number(body.speed)
      : undefined;

  const emotionPresets = Array.isArray(body.emotion_presets)
    ? (body.emotion_presets as unknown[])
        .filter((e): e is string => typeof e === 'string' && e in VOICE_EMOTIONS)
        .slice(0, 16)
    : undefined;

  return {
    id: `vp_${companionId}`,
    companion_id: companionId,
    name,
    engine,
    reference_audio_url:
      body.reference_audio_url != null
        ? String(body.reference_audio_url).trim() || undefined
        : undefined,
    voice_id: body.voice_id != null ? String(body.voice_id).trim() || undefined : undefined,
    language,
    pitch,
    speed,
    emotion_presets: emotionPresets && emotionPresets.length ? emotionPresets : undefined,
  };
}

/** GET /api/admin/voice — list profiles + TTS status. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    const profiles = await listVoiceProfiles(admin.supabase);
    const endpointId = process.env.RUNPOD_TTS_ENDPOINT_ID || '';
    return NextResponse.json({
      profiles,
      total: profiles.length,
      tts: {
        configured: isTTSConfigured(),
        endpoint_id: endpointId ? `${endpointId.slice(0, 4)}***` : null,
        default_engine: 'fish-speech',
      },
      emotions: VOICE_EMOTIONS,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/voice] GET error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/admin/voice — create or update a voice profile. */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const rl = await checkRateLimitAsync(`admin-voice:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const profile = sanitizeProfile(body);
    if ('error' in profile) {
      return NextResponse.json({ error: profile.error }, { status: 400 });
    }

    await saveVoiceProfile(profile, supabase);
    return NextResponse.json({ success: true, profile });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/voice] POST error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PATCH /api/admin/voice — test synthesis for a companion (admin preview). */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const rl = await checkRateLimitAsync(`admin-voice:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    if (!isTTSConfigured()) {
      return NextResponse.json(
        {
          error:
            'TTS is not configured. Set RUNPOD_TTS_ENDPOINT_ID and RUNPOD_TTS_API_KEY to test synthesis.',
          code: 'tts_not_configured',
        },
        { status: 503 },
      );
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

    const companionId = String(body.companion_id || '').trim();
    const text = String(body.text || '').trim().slice(0, MAX_TEST_TEXT);
    const emotion = body.emotion ? String(body.emotion) : undefined;

    if (!companionId) {
      return NextResponse.json({ error: 'companion_id is required' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 });
    }

    const profiles = await listVoiceProfiles(supabase);
    const voice = profiles.find((p) => p.companion_id === companionId);
    if (!voice) {
      return NextResponse.json(
        { error: 'No voice profile for this companion. Save one first.', code: 'no_voice_profile' },
        { status: 404 },
      );
    }

    const tts = await synthesizeSpeech(text, voice, { emotion, max_length: MAX_TEST_TEXT });
    const buffer = Buffer.from(tts.audio_base64, 'base64');
    const key = `voice-previews/${companionId}/${Date.now()}.opus`;
    const { url } = await uploadFile(buffer, key, 'audio/ogg', '');

    return NextResponse.json({
      success: true,
      audio_url: url,
      duration_ms: tts.duration_ms,
      format: tts.format,
      voice_id: tts.voice_id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/voice] PATCH test error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/** DELETE /api/admin/voice?companion_id=xxx — remove a voice profile. */
export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;
  const { supabase, user } = admin;

  const rl = await checkRateLimitAsync(`admin-voice:${user.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const companionId = searchParams.get('companion_id');
    if (!companionId) {
      return NextResponse.json({ error: 'companion_id is required' }, { status: 400 });
    }

    await deleteVoiceProfile(companionId, supabase);
    return NextResponse.json({ success: true, companion_id: companionId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[admin/voice] DELETE error', { err: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
