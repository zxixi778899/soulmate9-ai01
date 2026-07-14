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
    const { error } = await client.from('profiles').select('id', { count: 'exact', head: true }).limit(1);
    if (error) return { ok: false, error: error.message };
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function checkStripe(): Promise<DependencyResult> {
  const start = Date.now();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return { ok: true, error: 'not configured' };
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
  const key = process.env.RUNPOD_API_KEY;
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
  if (!url || !token) return { ok: true, error: 'not configured (memory fallback)' };
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

  // Supabase ok
  const allOk = supabase.ok;
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
      checks: { supabase, stripe, runpod, upstash },
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
export function HEAD(): NextResponse {
  return new NextResponse(null, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
