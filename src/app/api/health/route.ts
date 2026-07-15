import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DependencyResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

async function checkSupabase(): Promise<DependencyResult> {
  const start = Date.now();
  try {
    const client = getSupabaseClient();
    const [{ error: profileError }, { error: ledgerError }] = await Promise.all([
      client.from('profiles').select('id', { count: 'exact', head: true }).limit(1),
      client.from('wallet_ledger').select('id', { count: 'exact', head: true }).limit(1),
    ]);
    if (profileError) return { ok: false, error: `database unavailable: ${profileError.message}` };
    if (ledgerError) return { ok: false, error: `financial schema unavailable: ${ledgerError.message}` };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    // Include the URL we tried to hit so encoding / wrong-host failures
    // (e.g. non-ASCII characters in COZE_SUPABASE_URL) are diagnosable
    // from the deploy logs alone.
    const url = (process.env.COZE_SUPABASE_URL || '').slice(0, 60);
    const msg = e instanceof Error ? `${e.message} [url=${url}]` : String(e);
    return { ok: false, error: msg };
  }
}

async function checkStripe(): Promise<DependencyResult> {
  const start = Date.now();
  if (process.env.PAYMENT_PROVIDER !== 'stripe') return { ok: true, error: 'disabled' };
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: false, error: 'not configured' };
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function checkRunPod(): Promise<DependencyResult> {
  const start = Date.now();
  const key = process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY;
  const endpoint = process.env.RUNPOD_ENDPOINT_ID;
  if (!key || !endpoint) return { ok: false, error: 'RunPod env not configured' };
  try {
    const res = await fetch('https://api.runpod.ai/v2/' + endpoint + '/health', {
      headers: { Authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function checkUpstash(): Promise<DependencyResult> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false, error: 'not configured' }
      : { ok: true, error: 'memory fallback' };
  }
  const start = Date.now();
  try {
    const res = await fetch(url + '/ping', {
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function GET(): Promise<NextResponse> {
  const [supabase, stripe, runpod, upstash] = await Promise.all([
    checkSupabase(),
    checkStripe(),
    checkRunPod(),
    checkUpstash(),
  ]);

  const allOk = supabase.ok && stripe.ok && runpod.ok && upstash.ok;
  const status = allOk ? 200 : 503;

  if (!allOk) {
    logger.error('health check failed', { supabase, stripe, runpod, upstash });
  }

  const buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null;
  const buildBranch = process.env.VERCEL_GIT_COMMIT_REF ?? null;
  const buildMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null;

  return NextResponse.json(
    {
      ok: allOk,
      ts: new Date().toISOString(),
      service: 'soulmate9',
      checks: {
        supabase: { ok: supabase.ok, latencyMs: supabase.latencyMs },
        stripe: { ok: stripe.ok, latencyMs: stripe.latencyMs },
        runpod: { ok: runpod.ok, latencyMs: runpod.latencyMs },
        upstash: { ok: upstash.ok, latencyMs: upstash.latencyMs },
      },
      // 部署元信息:用于一眼判断"线上是不是最新的 commit"
      build: {
        sha: buildSha,
        branch: buildBranch,
        message: buildMessage,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
      },
      // 旧字段保留(向后兼容),值 = build.sha 或 fallback
      version: buildSha ?? process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
    },
    { status },
  );
}

/**
 * HEAD  Kubernetes  readiness  / Docker HEALTHCHECK
 * 
 */
export async function HEAD(): Promise<NextResponse> {
  const supabase = await checkSupabase();
  return new NextResponse(null, {
    status: supabase.ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
