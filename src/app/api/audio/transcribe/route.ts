import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { captureException } from '@/lib/sentry';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync } from '@/lib/rate-limit';
import { QuotaManager, type MembershipTier } from '@/lib/quota-manager';
import { uploadFile, deleteFile } from '@/lib/storage';
import { transcribeWithWhisper, whisperEndpointConfigured } from '@/lib/whisper-stt';

/**
 * POST /api/audio/transcribe
 * Voice-to-text input: upload audio → Whisper (RunPod) → transcript text.
 *
 * Quota: Free 0/day · Pro 50/day · Unlimited/Admin no cap
 * Cost: ~$0.006/min (faster-whisper medium on RunPod)
 */

const ALLOWED_TYPES = ['audio/webm', 'audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/ogg'];
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB (~1h of webm/opus voice)

/** Daily STT quota per membership tier. */
const STT_QUOTA_BY_TIER: Record<MembershipTier, number> = {
  free: 0,
  pro: 50,
  unlimited: Number.POSITIVE_INFINITY,
  admin: Number.POSITIVE_INFINITY,
};

const quota = new QuotaManager();

export async function POST(request: NextRequest) {
  try {
    // Step 1: Authenticate user
    const authResult = await getAuthUser(request);
    if (!authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authResult.user.id;

    // Step 2: Rate limit (GPU-backed endpoint — must be throttled)
    const rl = await checkRateLimitAsync(`stt:${userId}`, { maxRequests: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests, slow down.' }, { status: 429 });
    }

    // Step 3: Feature gate + membership quota
    if (!whisperEndpointConfigured()) {
      return NextResponse.json(
        { error: 'Voice transcription is not available yet. Please try again later.' },
        { status: 503 },
      );
    }

    const membership = await quota.getMembership(userId);
    const dailyLimit = STT_QUOTA_BY_TIER[membership];
    if (dailyLimit === 0) {
      return NextResponse.json(
        { error: 'Voice transcription requires Pro. Upgrade to unlock.' },
        { status: 403 },
      );
    }
    if (dailyLimit !== Number.POSITIVE_INFINITY) {
      const dailyCount = await quota.getDailyUsage(userId, 'stt_transcription');
      if (dailyCount >= dailyLimit) {
        return NextResponse.json(
          { error: 'Daily voice transcription quota reached. Resets tomorrow.' },
          { status: 403 },
        );
      }
    }

    // Step 4: Read + validate audio file from FormData
    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(audioFile.type)) {
      return NextResponse.json(
        { error: `Unsupported format. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file too large (max 10 MB)' }, { status: 400 });
    }

    // Step 5: Upload audio to temporary storage
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const extension = audioFile.type.includes('wav')
      ? 'wav'
      : audioFile.type.includes('mpeg') || audioFile.type.includes('mp3')
        ? 'mp3'
        : audioFile.type.includes('ogg')
          ? 'ogg'
          : 'webm';
    const { key: storageKey, url: audioUrl } = await uploadFile(
      buffer,
      `stt_${Date.now()}.${extension}`,
      audioFile.type,
      'temp/stt',
    );

    logger.info('[STT] audio uploaded for transcription', {
      userId,
      bytes: buffer.length,
      type: audioFile.type,
    });

    // Step 6: Transcribe via Whisper (RunPod)
    let transcript: string;
    let detectedLanguage: string | undefined;
    try {
      const result = await transcribeWithWhisper(audioUrl, {
        language: 'auto',
        modelSize: 'medium',
      });
      transcript = result.transcript.trim();
      detectedLanguage = result.detectedLanguage;
    } finally {
      // Step 7: Always clean up the temporary audio object
      await deleteFile(storageKey);
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'No speech detected in the audio. Please try again.' },
        { status: 422 },
      );
    }

    // Step 8: Increment usage counter (only for successful transcriptions)
    await quota.incrementUsage(userId, 'stt_transcription');

    logger.info('[STT] transcription successful', {
      userId,
      chars: transcript.length,
      language: detectedLanguage,
    });

    return NextResponse.json({
      success: true,
      transcript,
      detectedLanguage: detectedLanguage ?? 'auto',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[STT] request failed', { err: message });
    captureException(error, { tags: { area: 'stt' } });

    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
