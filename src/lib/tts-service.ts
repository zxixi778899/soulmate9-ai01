/**
 * TTS Service — Fish-Speech / CosyVoice via RunPod (self-hosted, uncensored)
 *
 * Architecture:
 * - Primary: RunPod Fish-Speech endpoint (on-demand)
 * - Fallback: Pre-cached voice clips from Supabase Storage
 *
 * Voice profiles are stored per-companion in site_settings or DB.
 *
 * Env vars:
 *   RUNPOD_TTS_ENDPOINT_ID   RunPod serverless endpoint for TTS
 *   RUNPOD_TTS_API_KEY       RunPod API key (falls back to RUNPOD_API_KEY)
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { resolveBucketName, toPublicUrl, uploadFile } from '@/lib/storage';
import { VOICE_EMOTIONS, isVoiceEmotion } from '@/lib/tts-emotion';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TTSVoiceProfile {
  id: string;
  companion_id: string;
  name: string;
  engine: 'fish-speech' | 'cosyvoice' | 'edge-tts';
  reference_audio_url?: string;
  voice_id?: string;
  /** Edge TTS specific: voice name like 'en-US-JennyNeural' */
  edge_voice?: string;
  language: 'en' | 'zh' | 'auto';
  pitch?: number;
  speed?: number;
  emotion_presets?: string[];
}

export interface TTSResult {
  audio_base64: string;
  format: 'opus' | 'mp3' | 'wav';
  duration_ms: number;
  voice_id: string;
}

export interface TTSSynthesizeOptions {
  emotion?: string;
  max_length?: number;
}

// ─── Config ──────────────────────────────────────────────────────────────────

const TTS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const SUBMIT_TIMEOUT_MS = 15_000;
const STATUS_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_TEXT = 500;

export const VOICE_PROFILES_SETTINGS_KEY = 'voice_profiles';

function getTTSConfig(): { apiKey: string; endpointId: string; baseUrl: string } {
  const endpointId = process.env.RUNPOD_TTS_ENDPOINT_ID || '';
  const apiKey = process.env.RUNPOD_TTS_API_KEY || process.env.RUNPOD_API_KEY || '';
  // Don't throw at module load time (breaks Next.js build); validate at call time.
  const baseUrl = endpointId ? `https://api.runpod.ai/v2/${endpointId}` : '';
  return { apiKey, endpointId, baseUrl };
}

/** Always true — Edge TTS provides a fallback when RunPod is unavailable. */
export function isTTSConfigured(): boolean {
  return true;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip a data-URL prefix and return raw base64 (or null if not a data URL). */
function stripAudioDataUrl(value: string): string | null {
  const match = value.match(/^data:audio\/[\w.+-]+;base64,([\s\S]+)$/);
  return match ? match[1].replace(/\s+/g, '') : null;
}

/** Resolve a reference audio URL / data-URL to raw base64 for the worker. */
async function resolveReferenceAudioBase64(url: string): Promise<string | undefined> {
  try {
    const fromDataUrl = stripAudioDataUrl(url);
    if (fromDataUrl) return fromDataUrl;
    if (!/^https?:\/\//i.test(url)) return undefined;
    const res = await fetch(url, { signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS) });
    if (!res.ok) {
      logger.warn('[tts] reference audio fetch failed', { status: res.status });
      return undefined;
    }
    return Buffer.from(await res.arrayBuffer()).toString('base64');
  } catch (err) {
    logger.warn('[tts] reference audio resolve failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return undefined;
  }
}

/**
 * Extract a base64 audio blob from a RunPod TTS job output.
 * Workers vary: audio may live under audio / audio_base64 / output / result,
 * be wrapped in an object, or be the raw output string itself.
 */
function extractAudioFromOutput(output: unknown): string | null {
  const looksLikeAudio = (s: string): boolean => {
    const t = s.replace(/\s+/g, '');
    if (t.startsWith('data:audio/')) return true;
    // Base64-ish blob, long enough to be audio bytes
    return t.length > 200 && /^[A-Za-z0-9+/]+=*$/.test(t.slice(0, 200));
  };

  const normalize = (s: string): string => {
    const stripped = stripAudioDataUrl(s);
    return (stripped ?? s).replace(/\s+/g, '');
  };

  const visit = (value: unknown, depth: number): string | null => {
    if (!value || depth > 4) return null;
    if (typeof value === 'string') {
      return looksLikeAudio(value) ? normalize(value) : null;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = visit(item, depth + 1);
        if (hit) return hit;
      }
      return null;
    }
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // Preferred keys first
      const preferred = ['audio_base64', 'audio', 'b64_audio', 'base64', 'data', 'output', 'result'];
      for (const key of preferred) {
        const hit = visit(obj[key], depth + 1);
        if (hit) return hit;
      }
    }
    return null;
  };

  return visit(output, 0);
}

// ─── Edge TTS (always-available fallback) ──────────────────────────────────

/** Curated Edge TTS voice pools — natural-sounding female voices. */
const EDGE_VOICES_EN = [
  'en-US-JennyNeural',
  'en-US-AriaNeural',
  'en-US-SaraNeural',
  'en-US-CoraNeural',
  'en-US-ElizabethNeural',
  'en-US-MichelleNeural',
  'en-GB-SoniaNeural',
  'en-GB-LibbyNeural',
  'en-AU-NatashaNeural',
];

const EDGE_VOICES_ZH = [
  'zh-CN-XiaoxiaoNeural',
  'zh-CN-XiaoyiNeural',
  'zh-CN-XiaochenNeural',
  'zh-CN-XiaohanNeural',
  'zh-CN-XiaomoNeural',
  'zh-CN-XiaoshuangNeural',
  'zh-TW-HsiaoChenNeural',
];

/** Deterministic voice assignment based on companion ID hash. */
function assignEdgeVoice(companionId: string, language: 'en' | 'zh' | 'auto' = 'auto'): string {
  const hash = createHash('md5').update(companionId).digest();
  const idx = hash[0]! % 256;
  const pool = language === 'zh' ? EDGE_VOICES_ZH : language === 'en' ? EDGE_VOICES_EN : [...EDGE_VOICES_EN, ...EDGE_VOICES_ZH];
  return pool[idx % pool.length]!;
}

/**
 * Synthesize speech using Microsoft Edge TTS (free, no GPU, always available).
 * Returns opus audio in an ogg container.
 */
async function edgeTtsSynthesize(
  text: string,
  voice: TTSVoiceProfile,
  opts?: TTSSynthesizeOptions,
): Promise<TTSResult> {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');

  const voiceName = voice.edge_voice || assignEdgeVoice(voice.companion_id, voice.language);
  const speed = voice.speed ?? 1.0;

  const tts = new MsEdgeTTS();
  await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const started = Date.now();
  const result = tts.toStream(text);
  const stream = result.audioStream;
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
    // Safety timeout
    setTimeout(() => reject(new Error('Edge TTS stream timeout')), 30_000);
  });

  const audioBuffer = Buffer.concat(chunks);
  const audioBase64 = audioBuffer.toString('base64');
  const durationMs = Date.now() - started;

  logger.info('[tts] edge-tts success', {
    voice: voiceName,
    companion_id: voice.companion_id,
    text_len: text.length,
    bytes: audioBuffer.length,
    duration_ms: durationMs,
  });

  return {
    audio_base64: audioBase64,
    format: 'mp3',
    duration_ms: durationMs,
    voice_id: voiceName,
  };
}

// ─── Synthesis ───────────────────────────────────────────────────────────────

/**
 * Synthesize speech for a voice profile via the RunPod TTS endpoint.
 * Uses the async RunPod pattern: POST /run, then poll /status/{id}.
 * Times out after ~30s and best-effort cancels the job.
 */
export async function synthesizeSpeech(
  text: string,
  voice: TTSVoiceProfile,
  opts?: TTSSynthesizeOptions,
): Promise<TTSResult> {
  const { apiKey, endpointId, baseUrl } = getTTSConfig();
  const runpodAvailable = !!(apiKey && endpointId);

  // If engine is explicitly edge-tts, or RunPod is not configured, use Edge TTS directly
  if (voice.engine === 'edge-tts' || !runpodAvailable) {
    return edgeTtsSynthesize(text, voice, opts);
  }

  // Try RunPod first, fall back to Edge TTS on failure
  try {
    return await synthesizeViaRunPod(text, voice, opts, { apiKey, endpointId, baseUrl });
  } catch (runpodErr) {
    logger.warn('[tts] RunPod failed, falling back to Edge TTS', {
      err: runpodErr instanceof Error ? runpodErr.message : String(runpodErr),
      companion_id: voice.companion_id,
    });
    return edgeTtsSynthesize(text, voice, opts);
  }
}

/** Internal: RunPod synthesis (extracted from original synthesizeSpeech). */
async function synthesizeViaRunPod(
  text: string,
  voice: TTSVoiceProfile,
  opts: TTSSynthesizeOptions | undefined,
  config: { apiKey: string; endpointId: string; baseUrl: string },
): Promise<TTSResult> {
  const { apiKey, endpointId, baseUrl } = config;

  const maxLength = Math.max(1, Math.min(opts?.max_length ?? DEFAULT_MAX_TEXT, 2000));
  const cleanText = String(text || '').trim().slice(0, maxLength);
  if (!cleanText) {
    throw new Error('synthesizeSpeech: empty text');
  }

  // Emotion preset tunes pitch/speed unless the profile overrides them.
  const emotion = isVoiceEmotion(opts?.emotion) ? opts?.emotion : undefined;
  const preset = emotion ? VOICE_EMOTIONS[emotion] : undefined;
  const pitch = voice.pitch ?? preset?.pitch ?? 1.0;
  const speed = voice.speed ?? preset?.speed ?? 1.0;

  const referenceAudio = voice.reference_audio_url
    ? await resolveReferenceAudioBase64(voice.reference_audio_url)
    : undefined;

  // Fish-Speech / CosyVoice input shape.
  const input: Record<string, unknown> = {
    text: cleanText,
    format: 'opus',
    max_new_tokens: 1024,
    pitch,
    speed,
    language: voice.language,
  };
  if (referenceAudio) input.reference_audio = referenceAudio;
  if (voice.voice_id) input.voice_id = voice.voice_id;
  if (preset) input.instruction = preset.instruction;
  if (emotion) input.emotion = emotion;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const started = Date.now();

  const submitRes = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => '');
    throw new Error(`TTS submit HTTP ${submitRes.status}: ${errText.slice(0, 200)}`);
  }

  const submitted = (await submitRes.json()) as { id?: string };
  const jobId = submitted.id;
  if (!jobId) {
    throw new Error('TTS submit returned no job id');
  }

  logger.info('[tts] job submitted', {
    id: jobId,
    engine: voice.engine,
    companion_id: voice.companion_id,
    text_len: cleanText.length,
    emotion: emotion ?? 'none',
  });

  interface TTSJobStatus {
    id: string;
    status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
    output?: unknown;
    error?: string;
    execution_time?: number;
  }

  while (Date.now() - started < TTS_TIMEOUT_MS) {
    const statusRes = await fetch(`${baseUrl}/status/${jobId}`, {
      headers,
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!statusRes.ok) {
      throw new Error(`TTS status HTTP ${statusRes.status} for job ${jobId}`);
    }

    const status = (await statusRes.json()) as TTSJobStatus;

    if (status.status === 'COMPLETED') {
      const audio = extractAudioFromOutput(status.output);
      if (!audio) {
        throw new Error(`TTS job ${jobId} completed but no audio bytes in output`);
      }
      const durationMs = status.execution_time
        ? Math.round(status.execution_time * 1000)
        : Date.now() - started;
      logger.info('[tts] success', { id: jobId, duration_ms: durationMs, bytes: audio.length });
      return {
        audio_base64: audio,
        format: 'opus',
        duration_ms: durationMs,
        voice_id: voice.voice_id || voice.id,
      };
    }

    if (status.status === 'FAILED') {
      throw new Error(`TTS job FAILED: ${status.error || 'unknown error'}`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  // Timed out — best-effort cancel so we don't leave a billable job running.
  try {
    await fetch(`${baseUrl}/cancel/${jobId}`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    /* ignore */
  }
  throw new Error(`TTS timeout after ${Math.round(TTS_TIMEOUT_MS / 1000)}s (job ${jobId})`);
}

// ─── Voice cache (Supabase Storage) ─────────────────────────────────────────

/** Stable storage key for a text+companion pair. */
export function voiceCacheKey(text: string, companionId: string): string {
  const hash = createHash('md5').update(text.trim()).digest('hex');
  return `voice-cache/${companionId}/${hash}.opus`;
}

/**
 * Return a public URL if this exact line was already synthesized and cached.
 * Returns null on miss (or any storage error — caching is best-effort).
 */
export async function getCachedVoiceUrl(
  text: string,
  companionId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  try {
    const key = voiceCacheKey(text, companionId);
    const bucket = resolveBucketName();
    const { data, error } = await supabase.storage.from(bucket).exists(key);
    if (error || !data) return null;
    return toPublicUrl(key) || null;
  } catch (err) {
    logger.warn('[tts] cache lookup failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Persist generated audio to the shared voice cache. Best-effort. */
export async function cacheVoiceAudio(
  text: string,
  companionId: string,
  audioBase64: string,
): Promise<string | null> {
  try {
    const key = voiceCacheKey(text, companionId);
    const buffer = Buffer.from(audioBase64, 'base64');
    if (buffer.length < 32) return null;
    const { url } = await uploadFile(buffer, key, 'audio/ogg', '');
    return url;
  } catch (err) {
    logger.warn('[tts] cache write failed', {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Voice profile persistence (site_settings) ──────────────────────────────

function normalizeProfile(raw: Record<string, unknown>, companionId: string): TTSVoiceProfile {
  const engine = raw.engine === 'cosyvoice' ? 'cosyvoice' : 'fish-speech';
  const language =
    raw.language === 'en' || raw.language === 'zh' ? raw.language : 'auto';
  const pitch = typeof raw.pitch === 'number' && Number.isFinite(raw.pitch) ? raw.pitch : undefined;
  const speed = typeof raw.speed === 'number' && Number.isFinite(raw.speed) ? raw.speed : undefined;
  const emotionPresets = Array.isArray(raw.emotion_presets)
    ? (raw.emotion_presets as unknown[]).filter((e): e is string => typeof e === 'string')
    : undefined;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `vp_${companionId}`,
    companion_id: companionId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Default Voice',
    engine,
    reference_audio_url:
      typeof raw.reference_audio_url === 'string' && raw.reference_audio_url
        ? raw.reference_audio_url
        : undefined,
    voice_id: typeof raw.voice_id === 'string' && raw.voice_id ? raw.voice_id : undefined,
    language,
    pitch,
    speed,
    emotion_presets: emotionPresets && emotionPresets.length ? emotionPresets : undefined,
  };
}

/** Read the full companion_id -> profile map from site_settings. */
async function readProfilesMap(
  supabase: SupabaseClient,
): Promise<Record<string, TTSVoiceProfile>> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', VOICE_PROFILES_SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      logger.warn('[tts] voice_profiles read failed', { err: error.message });
      return {};
    }

    const val = data?.value as Record<string, unknown> | null;
    if (!val || typeof val !== 'object') return {};

    // Accept either a direct map or { profiles: {...} }
    const rawMap =
      val.profiles && typeof val.profiles === 'object' && !Array.isArray(val.profiles)
        ? (val.profiles as Record<string, unknown>)
        : val;

    const out: Record<string, TTSVoiceProfile> = {};
    for (const [companionId, entry] of Object.entries(rawMap)) {
      if (companionId === 'updated_at') continue;
      if (entry && typeof entry === 'object') {
        out[companionId] = normalizeProfile(entry as Record<string, unknown>, companionId);
      }
    }
    return out;
  } catch (err) {
    logger.warn('[tts] voice_profiles read error', {
      err: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}

async function writeProfilesMap(
  supabase: SupabaseClient,
  map: Record<string, TTSVoiceProfile>,
): Promise<void> {
  const { error } = await supabase.from('site_settings').upsert(
    {
      key: VOICE_PROFILES_SETTINGS_KEY,
      value: { profiles: map, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) {
    throw new Error(`Failed to save voice profiles: ${error.message}`);
  }
}

/** Look up the voice profile configured for a companion. Auto-creates Edge TTS profile if none exists. */
export async function getVoiceForCompanion(
  companionId: string,
  supabase: SupabaseClient,
): Promise<TTSVoiceProfile | null> {
  if (!companionId) return null;
  const map = await readProfilesMap(supabase);

  if (map[companionId]) return map[companionId]!;

  // Auto-assign an Edge TTS voice (deterministic based on companion ID)
  const edgeVoice = assignEdgeVoice(companionId);
  const autoProfile: TTSVoiceProfile = {
    id: `vp_${companionId}`,
    companion_id: companionId,
    name: 'Edge TTS (auto)',
    engine: 'edge-tts',
    edge_voice: edgeVoice,
    voice_id: edgeVoice,
    language: edgeVoice.startsWith('zh') ? 'zh' : 'en',
  };

  // Persist so it stays consistent across requests
  map[companionId] = autoProfile;
  await writeProfilesMap(supabase, map).catch((err) => {
    logger.warn('[tts] auto-save voice profile failed', {
      err: err instanceof Error ? err.message : String(err),
    });
  });

  logger.info('[tts] auto-assigned Edge TTS voice', {
    companion_id: companionId,
    voice: edgeVoice,
  });

  return autoProfile;
}

/** List all configured voice profiles. */
export async function listVoiceProfiles(
  supabase: SupabaseClient,
): Promise<TTSVoiceProfile[]> {
  const map = await readProfilesMap(supabase);
  return Object.values(map);
}

/** Create or update the voice profile for a companion. */
export async function saveVoiceProfile(
  profile: TTSVoiceProfile,
  supabase: SupabaseClient,
): Promise<void> {
  const map = await readProfilesMap(supabase);
  const stored: TTSVoiceProfile = {
    ...profile,
    id: profile.id || `vp_${profile.companion_id}`,
  };
  map[profile.companion_id] = stored;
  await writeProfilesMap(supabase, map);
  logger.info('[tts] voice profile saved', {
    companion_id: profile.companion_id,
    engine: stored.engine,
  });
}

/** Delete the voice profile for a companion (no-op if absent). */
export async function deleteVoiceProfile(
  companionId: string,
  supabase: SupabaseClient,
): Promise<void> {
  const map = await readProfilesMap(supabase);
  if (!(companionId in map)) return;
  delete map[companionId];
  await writeProfilesMap(supabase, map);
  logger.info('[tts] voice profile deleted', { companion_id: companionId });
}
