/**
 * Whisper STT Client (RunPod serverless)
 *
 * Submits an audio URL to a self-hosted faster-whisper endpoint on RunPod,
 * polls until completion and returns the transcript. Endpoint must expose the
 * standard RunPod serverless contract: POST /run → poll /status/{id}.
 *
 * Env:
 *  - RUNPOD_WHISPER_ENDPOINT_ID — endpoint id (feature disabled when unset)
 *  - RUNPOD_API_KEY             — shared RunPod API key
 */

import { logger } from '@/lib/logger';

export interface WhisperTranscribeOptions {
  /** 'auto' lets faster-whisper detect the language. */
  language?: string;
  /** faster-whisper model size installed on the worker. */
  modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large-v3';
  /** Max ms to poll before giving up. Default 55s (fits Vercel 60s budget). */
  pollBudgetMs?: number;
}

export interface WhisperTranscribeResult {
  transcript: string;
  detectedLanguage?: string;
  executionTimeMs?: number;
}

const POLL_INTERVAL_MS = 1500;

export function whisperEndpointConfigured(): boolean {
  return Boolean(
    process.env.RUNPOD_WHISPER_ENDPOINT_ID?.trim() && process.env.RUNPOD_API_KEY?.trim(),
  );
}

function getWhisperBaseUrl(): string {
  const endpointId = process.env.RUNPOD_WHISPER_ENDPOINT_ID?.trim();
  if (!endpointId) throw new Error('RUNPOD_WHISPER_ENDPOINT_ID not configured');
  return `https://api.runpod.ai/v2/${endpointId}`;
}

interface RunPodStatusPayload {
  id: string;
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | string;
  output?: unknown;
  error?: string;
  execution_time?: number;
}

/** Extract transcript text from the worker output (tolerant to shapes). */
function extractTranscript(output: unknown): { transcript: string; language?: string } | null {
  if (!output) return null;
  if (typeof output === 'string') return { transcript: output };
  if (typeof output === 'object') {
    const o = output as Record<string, unknown>;
    const raw = o.text ?? o.transcript ?? o.result;
    if (typeof raw === 'string') {
      const language = typeof o.language === 'string' ? o.language : undefined;
      return { transcript: raw, language };
    }
    // segments shape: [{ text: '...' }, ...]
    if (Array.isArray(o.segments)) {
      const text = (o.segments as Array<{ text?: unknown }>)
        .map((s) => (typeof s.text === 'string' ? s.text : ''))
        .join(' ')
        .trim();
      if (text) {
        const language = typeof o.language === 'string' ? o.language : undefined;
        return { transcript: text, language };
      }
    }
  }
  return null;
}

/**
 * Transcribe audio via the RunPod Whisper endpoint.
 * Throws on misconfiguration / failure — callers should surface a friendly error.
 */
export async function transcribeWithWhisper(
  audioUrl: string,
  options: WhisperTranscribeOptions = {},
): Promise<WhisperTranscribeResult> {
  const apiKey = process.env.RUNPOD_API_KEY?.trim();
  const baseUrl = getWhisperBaseUrl();
  const pollBudgetMs = options.pollBudgetMs ?? 55_000;
  const startedAt = Date.now();

  // 1. Submit
  const submitRes = await fetch(`${baseUrl}/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        audio_url: audioUrl,
        language: options.language && options.language !== 'auto' ? options.language : undefined,
        model: options.modelSize ?? 'medium',
        task: 'transcribe',
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '');
    throw new Error(`Whisper endpoint submit failed (HTTP ${submitRes.status}): ${body.slice(0, 200)}`);
  }

  const submitted = (await submitRes.json()) as { id?: string };
  const jobId = submitted.id;
  if (!jobId) throw new Error('Whisper endpoint returned no job id');

  logger.info('[whisper-stt] job submitted', { jobId });

  // 2. Poll until COMPLETED / FAILED
  while (Date.now() - startedAt < pollBudgetMs) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const statusRes = await fetch(`${baseUrl}/status/${jobId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!statusRes.ok) {
      logger.warn('[whisper-stt] status poll failed', { jobId, status: statusRes.status });
      continue;
    }

    const payload = (await statusRes.json()) as RunPodStatusPayload;

    if (payload.status === 'COMPLETED') {
      const parsed = extractTranscript(payload.output);
      if (!parsed) {
        throw new Error('Whisper job completed but output had no transcript');
      }
      logger.info('[whisper-stt] transcription complete', {
        jobId,
        chars: parsed.transcript.length,
        elapsedMs: Date.now() - startedAt,
      });
      return {
        transcript: parsed.transcript,
        detectedLanguage: parsed.language,
        executionTimeMs: payload.execution_time,
      };
    }

    if (payload.status === 'FAILED') {
      throw new Error(`Whisper job failed: ${payload.error || 'unknown worker error'}`);
    }
    // IN_QUEUE / IN_PROGRESS → keep polling
  }

  throw new Error(`Whisper transcription timed out after ${Math.round(pollBudgetMs / 1000)}s (job ${jobId})`);
}
