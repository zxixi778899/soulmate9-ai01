import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  loadComfyConfig,
  saveComfyConfig,
  invalidateComfyCache,
  type ComfyConsoleConfig,
} from '@/lib/comfy-console/store';
import { createDefaultComfyConfig } from '@/lib/comfy-console/defaults';
import { LORA_CATALOG, groupLorasByCategory } from '@/lib/comfy-console/lora-catalog';
import { runpodClient } from '@/lib/runpod';
import {
  uploadImageBase64,
  deleteFile,
  resolveImageUrl,
  extractKeyFromUrl,
  toPublicUrl,
  resolveBucketName,
} from '@/lib/storage';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const GEN_LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

/**
 * GET /api/admin/comfy
 *   ?view=config | assets | help | loras
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const view = new URL(req.url).searchParams.get('view') || 'config';
  const cfg = await loadComfyConfig(admin.supabase);

  if (view === 'loras') {
    return NextResponse.json({
      catalog: {
        version: LORA_CATALOG.version,
        base_model: LORA_CATALOG.base_model,
        target_volume: LORA_CATALOG.target_volume,
        region: LORA_CATALOG.region,
        notes: LORA_CATALOG.notes,
        categories: LORA_CATALOG.categories,
        stacking_tips: LORA_CATALOG.stacking_tips,
        apply_recipes: LORA_CATALOG.apply_recipes || [],
      },
      by_category: groupLorasByCategory(),
      loras: cfg.loras,
      download_script: 'scripts/runpod/download-loras.sh',
      download_readme: 'scripts/runpod/README-LORA.md',
    });
  }

  if (view === 'help') {
    return NextResponse.json({
      network_volume: cfg.network_volume,
      resources: {
        pod_downloader: 'model-downloader (US-CA-2) — 下载模型/LoRA 到卷',
        volume: cfg.network_volume.name,
        endpoints: cfg.endpoints,
      },
      lora_howto: cfg.network_volume.setup_notes,
      lora_catalog_version: LORA_CATALOG.version,
      stacking_tips: LORA_CATALOG.stacking_tips,
    });
  }

  if (view === 'assets') {
    const kind = new URL(req.url).searchParams.get('kind');
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') || 48), 100);
    let q = admin.supabase
      .from('generation_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (kind) q = q.eq('kind', kind);
    const { data, error } = await q;

    const assets: Array<Record<string, unknown>> = [];
    let warning: string | undefined;

    if (error) {
      warning = error.message;
    } else {
      for (const row of data || []) {
        const r = row as Record<string, unknown>;
        const key = String(r.storage_key || '');
        const url =
          (r.url as string) ||
          (key ? await resolveImageUrl(key) : '') ||
          toPublicUrl(key);
        assets.push({ ...r, url, source: 'generation_assets' });
      }
    }

    // Supplement from storage folders (操作台 + 历史生成)
    if (assets.length < limit) {
      try {
        const serviceKey =
          process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
          process.env.SUPABASE_SERVICE_ROLE_KEY ||
          '';
        const supabaseUrl =
          process.env.COZE_SUPABASE_URL ||
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          '';
        if (serviceKey && supabaseUrl) {
          const sb = createClient(supabaseUrl, serviceKey, {
            auth: { autoRefreshToken: false, persistSession: false },
          });
          const bucket = resolveBucketName();
          const folders = [
            'comfy-outputs',
            'girlfriends',
            'admin/girlfriends',
            'admin/outfits',
            'admin/shop_items',
          ];
          for (const folder of folders) {
            if (assets.length >= limit) break;
            const { data: files } = await sb.storage.from(bucket).list(folder, {
              limit: Math.min(24, limit - assets.length),
              sortBy: { column: 'created_at', order: 'desc' },
            });
            for (const f of files || []) {
              if (!f.name || f.name.endsWith('/')) continue;
              if (!/\.(png|jpe?g|webp|gif)$/i.test(f.name)) continue;
              const key = `${folder}/${f.name}`;
              if (
                assets.some(
                  (a) =>
                    a.storage_key === key ||
                    String(a.url || '').includes(f.name),
                )
              ) {
                continue;
              }
              const url = await resolveImageUrl(key);
              assets.push({
                id: null,
                storage_key: key,
                url,
                kind: folder.includes('outfit')
                  ? 'outfit'
                  : folder.includes('shop')
                    ? 'shop_item'
                    : 'girlfriend',
                created_at: f.created_at || f.updated_at || null,
                source: 'storage',
                prompt: null,
              });
            }
          }
        }
      } catch (e) {
        logger.warn('[comfy] storage list fallback failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      assets,
      warning:
        warning && assets.length === 0
          ? warning
          : assets.length === 0
            ? '暂无操作台生成图。请先在 Comfy 操作台生成。'
            : undefined,
      hint:
        warning && assets.length === 0
          ? 'Run db/migrations/0009_comfy_console.sql in Supabase'
          : undefined,
    });
  }

  return NextResponse.json({
    config: cfg,
    runpod_configured: runpodClient.isConfigured,
    env_endpoint: process.env.RUNPOD_ENDPOINT_ID || null,
  });
}

/**
 * PATCH /api/admin/comfy — save config
 * Body: { config: ComfyConsoleConfig } | partial
 */
export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin(req, 'admin');
  if (admin.error) return admin.error;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const current = await loadComfyConfig(admin.supabase);
  const next = body.replace
    ? (body.config as ComfyConsoleConfig)
    : { ...current, ...(body.config || body) };

  const { source } = await saveComfyConfig(next as ComfyConsoleConfig, admin.supabase);
  invalidateComfyCache();
  return NextResponse.json({ success: true, source, config: next });
}

/**
 * POST /api/admin/comfy
 * action: generate | delete_asset | reset_config
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req, 'admin');
  if (admin.error) return admin.error;

  const body = await req.json().catch(() => null);
  if (!body?.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  if (body.action === 'reset_config') {
    const cfg = createDefaultComfyConfig();
    const { source } = await saveComfyConfig(cfg, admin.supabase);
    invalidateComfyCache();
    return NextResponse.json({ success: true, source, config: cfg });
  }

  if (body.action === 'delete_asset') {
    const id = body.id as string;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { data: row } = await admin.supabase
      .from('generation_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (row?.storage_key) {
      await deleteFile(String(row.storage_key));
    } else if (row?.url) {
      const k = extractKeyFromUrl(String(row.url));
      if (k) await deleteFile(k);
    }

    const { error } = await admin.supabase.from('generation_assets').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === 'generate') {
    const rl = await checkRateLimitAsync(`comfy-gen:${admin.user!.id}`, GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many generations' },
        { status: 429, headers: rateLimitHeaders(rl, GEN_LIMIT) },
      );
    }

    const cfg = await loadComfyConfig(admin.supabase);
    const prompt = String(body.prompt || '').trim();
    if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 });

    const workflowId = body.workflow_id as string | undefined;
    const wf = cfg.workflows.find((w) => w.id === workflowId);

    const ckptId = body.ckpt_id || wf?.defaults.ckpt_id || 'flux-fp8';
    const ckpt = cfg.checkpoints.find((c) => c.id === ckptId) || cfg.checkpoints[0];
    const loraId = body.lora_id !== undefined ? body.lora_id : wf?.defaults.lora_id;
    const lora = loraId
      ? cfg.loras.find((l) => l.id === loraId)
      : null;
    const endpointKey = body.endpoint_key || wf?.defaults.endpoint_key || 'comfy-default';
    const ep = cfg.endpoints.find((e) => e.id === endpointKey);

    const endpointId =
      body.endpoint_id ||
      ep?.endpoint_id ||
      process.env.RUNPOD_ENDPOINT_ID ||
      '';

    if (!endpointId) {
      return NextResponse.json(
        {
          error: 'No Comfy endpoint id. Set endpoints in console config or RUNPOD_ENDPOINT_ID',
        },
        { status: 400 },
      );
    }

    const width = Number(body.width || wf?.defaults.width || 832);
    const height = Number(body.height || wf?.defaults.height || 1216);
    const steps = Number(body.steps || wf?.defaults.steps || 28);
    const cfgScale = Number(body.cfg || wf?.defaults.cfg || 3.5);
    const seed = body.seed != null ? Number(body.seed) : -1;
    const denoise =
      body.denoise != null
        ? Number(body.denoise)
        : body.input_image
          ? Number(wf?.defaults.denoise ?? 0.55)
          : 1;
    const negative = String(
      body.negative || wf?.defaults.negative || 'blurry, low quality, watermark',
    );
    const kind = body.kind || wf?.kind || 'custom';
    const loraStrength =
      body.lora_strength != null
        ? Number(body.lora_strength)
        : wf?.defaults.lora_strength ?? lora?.default_strength ?? 0.8;

    try {
      const result = await runpodClient.generate({
        prompt,
        negative_prompt: negative,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: cfgScale,
        seed: seed >= 0 ? seed : undefined,
        input_image: body.input_image || undefined,
        denoising_strength: body.input_image ? denoise : undefined,
        ckpt_name: body.ckpt_name || ckpt?.filename,
        lora_name: lora?.filename || body.lora_name || null,
        lora_strength_model: loraStrength,
        lora_strength_clip: loraStrength,
        endpoint_id: endpointId,
      });

      const assets: Array<Record<string, unknown>> = [];
      for (let i = 0; i < result.images.length; i++) {
        const raw = result.images[i];
        const { key, url } = await uploadImageBase64(
          raw,
          'comfy-outputs',
          'image/png',
        );

        const row = {
          created_by: admin.user!.id,
          kind,
          storage_key: key,
          url,
          prompt,
          negative_prompt: negative,
          workflow_id: workflowId || null,
          endpoint_id: endpointId,
          ckpt_name: body.ckpt_name || ckpt?.filename || null,
          lora_name: lora?.filename || body.lora_name || null,
          width,
          height,
          steps,
          cfg: cfgScale,
          seed: seed >= 0 ? seed : null,
          meta: {
            job_id: result.job_id,
            execution_time: result.execution_time,
            lora_strength: loraStrength,
            denoise: body.input_image ? denoise : 1,
          },
        };

        const { data: saved, error: insErr } = await admin.supabase
          .from('generation_assets')
          .insert(row)
          .select('*')
          .single();

        if (insErr) {
          logger.warn('[comfy] asset insert failed (table?)', { err: insErr.message });
          assets.push({ ...row, id: null, warning: insErr.message });
        } else {
          assets.push(saved);
        }
      }

      return NextResponse.json({
        success: true,
        assets,
        job_id: result.job_id,
        execution_time: result.execution_time,
      });
    } catch (e) {
      logger.error('[comfy] generate failed', { e });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Generate failed' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
}
