/**
 * Per-endpoint outcome window (in-memory). Complements the circuit breaker:
 * catches "half-dead" endpoints (slow timeouts, intermittent 5xx) that never
 * trip the failure threshold fast enough, so a cold RunPod hop is skipped
 * instead of burning its first-byte budget on every request.
 */

interface OutcomeSample {
  ok: boolean;
  at: number;
}

const WINDOW_MS = 300_000;
const MIN_SAMPLES = 4;
const MAX_SAMPLES = 50;
const COLD_FAIL_RATE = 0.5;

const windows = new Map<string, OutcomeSample[]>();

export function recordEndpointOutcome(endpointId: string, ok: boolean): void {
  const now = Date.now();
  const samples = windows.get(endpointId) || [];
  samples.push({ ok, at: now });
  while (samples.length && now - samples[0].at > WINDOW_MS) samples.shift();
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  windows.set(endpointId, samples);
}

export function isEndpointCold(endpointId: string): boolean {
  const samples = windows.get(endpointId);
  if (!samples || samples.length < MIN_SAMPLES) return false;
  const now = Date.now();
  const recent = samples.filter((sample) => now - sample.at <= WINDOW_MS);
  if (recent.length < MIN_SAMPLES) return false;
  const fails = recent.filter((sample) => !sample.ok).length;
  return fails / recent.length >= COLD_FAIL_RATE;
}

export function resetEndpointHealth(endpointId: string): void {
  windows.delete(endpointId);
}
