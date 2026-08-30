/**
 * Admin API: Generation Control Center backend.
 *
 * GET  /api/admin/generation — job stats (24h window) + provider health +
 *                              global content-rating config + model asset
 *                              manifest + SDXL matrix gate state.
 * POST /api/admin/generation — actions:
 *   - refund_job:    { job_id } → one-shot refund via gen-hub
 *   - save_rating:   { nsfw_enabled } → site_settings kill switch
 *   - seed_assets:   upsert the canonical gen_model_assets manifest
 *   - matrix_preview: { category, render_style, nsfw_level, tier }
 *                     → resolved ModelPlan (checkpoint/LoRA/endpoint)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { collectGenJobStats, invalidateGlobalNsfwCache } from '@/lib/gen-monitor';
import { getImageProviderHealthAsync } from '@/lib/image-router';
import { refundGenJob } from '@/lib/gen-hub';
import {
  assetFromRow,
  isMissingAssetTableError,
  seedModelAssets,
  type ModelAsset,
} from '@/lib/gen-assets/manifest';
import {
  isSdxlMatrixActive,
  isSdxlMatrixEndpointConfigured,
  isSdxlMatrixReady,
  resolveModelPlan,
} from '@/lib/model-matrix';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  try {
    const [stats, providerHealth, nsfwRow, assetRows] = await Promise.all([
      collectGenJobStats(admin.supabase, 24),
      getImageProviderHealthAsync(),
      admin.supabase.from('site_settings').select('value').eq('key', 'nsfw_enabled').maybeSingle(),
      admin.supabase
        .from('gen_model_assets')
        .select('*')
        .order('sort_order', { ascending: true })
        .limit(1000),
    ]);

    const rawNsfw = (nsfwRow.data as { value?: unknown } | null)?.value;
    const nsfwEnabled =
      rawNsfw === false || rawNsfw === 'false' || rawNsfw === '0' || rawNsfw === 0 ? false : true;

    let assets: ModelAsset[] = [];
    let assetsTableMissing = false;
    if (assetRows.error) {
      assetsTableMissing = isMissingAssetTableError(assetRows.error);
      if (!assetsTableMissing) {
        logger.warn('[admin/generation] asset manifest query failed', { error: String(assetRows.error) });
      }
    } else {
      assets = ((assetRows.data as unknown[]) || [])
        .map(assetFromRow)
        .filter((row): row is ModelAsset => row !== null);
    }

    return NextResponse.json({
      stats,
      provider_health: providerHealth,
      rating: { nsfw_enabled: nsfwEnabled },
      assets,
      assets_table_missing: assetsTableMissing,
      matrix: {
        ready: isSdxlMatrixReady(),
        endpoint_configured: isSdxlMatrixEndpointConfigured(),
        active: isSdxlMatrixActive(),
      },
    });
  } catch (e) {
    logger.error('[admin/generation] GET failed', { error: String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String((body as { action?: string }).action || '');

  try {
    switch (action) {
      case 'refund_job': {
        const jobId = String((body as { job_id?: string }).job_id || '').trim();
        if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 });
        const { data: job, error: jobErr } = await admin.supabase
          .from('generation_jobs')
          .select('id, user_id, cost_tokens, refunded, status')
          .eq('id', jobId)
          .maybeSingle();
        if (jobErr || !job) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }
        const row = job as { id: string; user_id: string; cost_tokens: number; refunded: boolean; status: string };
        if (row.status !== 'failed' && row.status !== 'cancelled') {
          return NextResponse.json(
            { error: 'Only failed/cancelled jobs can be refunded' },
            { status: 409 },
          );
        }
        const outcome = await refundGenJob(admin.supabase, row);
        logger.info('[admin/generation] manual refund', { jobId: row.id, outcome });
        return NextResponse.json({ success: true, outcome });
      }

      case 'save_rating': {
        const nsfwEnabled = Boolean((body as { nsfw_enabled?: boolean }).nsfw_enabled);
        const { error } = await admin.supabase.from('site_settings').upsert(
          { key: 'nsfw_enabled', value: nsfwEnabled, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        invalidateGlobalNsfwCache();
        logger.info('[admin/generation] nsfw kill switch updated', { nsfwEnabled });
        return NextResponse.json({ success: true, rating: { nsfw_enabled: nsfwEnabled } });
      }

      case 'seed_assets': {
        const outcome = await seedModelAssets(admin.supabase);
        if (outcome.error) {
          const tableMissing = isMissingAssetTableError({ message: outcome.error });
          return NextResponse.json(
            { error: outcome.error },
            { status: tableMissing ? 503 : 500 },
          );
        }
        logger.info('[admin/generation] model assets seeded', { upserted: outcome.upserted });
        return NextResponse.json({ success: true, upserted: outcome.upserted });
      }

      case 'matrix_preview': {
        const b = body as {
          category?: string;
          render_style?: string;
          nsfw_level?: number;
          tier?: string;
        };
        const category =
          b.category === 'male' ? 'male' : b.category === 'transgender' ? 'transgender' : 'female';
        const renderStyle =
          b.render_style === '2d' ? b.render_style : 'realistic';
        const nsfwLevel = Math.min(5, Math.max(1, Math.round(Number(b.nsfw_level || 1)))) as 1 | 2 | 3 | 4 | 5;
        const plan = resolveModelPlan({
          surface: 'companion',
          category,
          renderStyle,
          nsfwLevel,
          tier: b.tier === 'premium' ? 'premium' : 'standard',
        });
        return NextResponse.json({ success: true, plan, matrix: { active: isSdxlMatrixActive() } });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    logger.error('[admin/generation] POST failed', { action, error: String(e) });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
