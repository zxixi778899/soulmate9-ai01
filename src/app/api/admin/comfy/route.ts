import { NextRequest, NextResponse } from 'next/server';
import { sanitizeLoraForVolume } from '@/lib/runpod-loras';
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
import { assembleGirlfriendFromRow } from '@/lib/prompt/girlfriend';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const GEN_LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

function assetFolder(girlfriendId?: string | null): string {
  const id = (girlfriendId || '').trim();
  if (id) return `girlfriends/${id}`;
  return 'comfy-outputs';
}


/**
 * GET /api/admin/comfy
 *   ?view=config | assets | help | loras
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const view = new URL(req.url).searchParams.get('view') || 'config';
  const cfg = await loadComfyConfig(admin.supabase);

  if (view === 'volume' || view === 'installed') {
    const { getInstalledLoraSet } = await import('@/lib/runpod-loras');
    const installed = [...getInstalledLoraSet()].sort();
    return NextResponse.json({
      volume: cfg.network_volume,
      target_volume: LORA_CATALOG.target_volume,
      region: LORA_CATALOG.region,
      base_model: LORA_CATALOG.base_model,
      installed_loras: installed,
      code_allowlist: installed,
      env_override: !!(process.env.RUNPOD_INSTALLED_LORAS || process.env.COMFY_INSTALLED_LORAS),
      paths: {
        loras: cfg.network_volume?.loras_dir || 'models/loras',
        checkpoints: cfg.network_volume?.checkpoints_dir || 'models/checkpoints',
      },
      note:
        'installed_loras 与 Comfy LoraLoader 白名单一致；下载新文件后请在 LORA_REGISTRY 中添加条目或设置 RUNPOD_INSTALLED_LORAS，并重新部署。',
    });
  }

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
    const sp = new URL(req.url).searchParams;
    const kind = sp.get('kind');
    const girlfriendId = (sp.get('girlfriend_id') || sp.get('girlfriendId') || '').trim();
    const scope = (sp.get('scope') || '').trim();
    const limit = Math.min(Number(sp.get('limit') || 80), 200);
    let q = admin.supabase
      .from('generation_assets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (kind) q = q.eq('kind', kind);
    if (girlfriendId) {
      q = q.eq('girlfriend_id', girlfriendId);
    } else if (scope === 'public') {
      q = q.is('girlfriend_id', null);
    }
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
          const folders = girlfriendId
            ? [
                `girlfriends/${girlfriendId}`,
                'comfy-outputs',
              ]
            : [
            'comfy-outputs',
            'girlfriends',
            'admin/girlfriends',
            'admin/outfits',
            'admin/shop_items',
          ];
          const folderQueue = [...folders];
          const rootIndex = folderQueue.indexOf('girlfriends');
          if (rootIndex >= 0) {
            folderQueue.splice(rootIndex, 1);
            const { data: girlfriendFolders } = await sb.storage.from(bucket).list('girlfriends', {
              limit: 300,
              sortBy: { column: 'name', order: 'asc' },
            });
            for (const entry of girlfriendFolders || []) {
              if (entry.name && !/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) {
                folderQueue.push(`girlfriends/${entry.name}`);
              }
            }
          }
          // Scan folder metadata in bounded parallel batches. Sequentially walking
          // 100+ girlfriend folders made the assets page appear permanently stuck.
          for (let start = 0; start < folderQueue.length && assets.length < limit; start += 12) {
            const batch = folderQueue.slice(start, start + 12);
            const listings = await Promise.all(batch.map(async (folder) => ({
              folder,
              files: (await sb.storage.from(bucket).list(folder, {
                limit: 60,
                sortBy: { column: 'created_at', order: 'desc' },
              })).data || [],
            })));
            for (const { folder, files } of listings) for (const f of files) {
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
              const girlfriendMatch = folder.match(/^girlfriends\/([^/]+)$/);
              assets.push({
                id: null,
                storage_key: key,
                url,
                kind: folder.includes('outfit')
                  ? 'outfit'
                  : folder.includes('shop')
                    ? 'shop_item'
                    : 'girlfriend',
                girlfriend_id: girlfriendMatch?.[1] || null,
                created_at: f.created_at || f.updated_at || null,
                source: 'storage',
                prompt: null,
              });
              if (assets.length >= limit) break;
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
            ? '暂无操作台生成图。请先在 Comfy 生成，或批量上传。'
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

  const ct = req.headers.get('content-type') || '';
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const action = String(form.get('action') || 'upload_assets');
    if (action !== 'upload_assets') {
      return NextResponse.json({ error: 'multipart only supports upload_assets' }, { status: 400 });
    }
    const kind = String(form.get('kind') || 'girlfriend');
    const girlfriendId = String(form.get('girlfriend_id') || form.get('girlfriendId') || '').trim() || null;
    const folder = assetFolder(girlfriendId);
    const files: File[] = [];
    for (const f of form.getAll('files')) {
      if (f instanceof File) files.push(f);
    }
    if (!files.length) {
      for (const [k, v] of form.entries()) {
        if ((k === 'file' || k.startsWith('file')) && v instanceof File) files.push(v);
      }
    }
    if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 });
    if (files.length > 30) return NextResponse.json({ error: 'Max 30 files' }, { status: 400 });

    const assets: Array<Record<string, unknown>> = [];
    let ok = 0;
    const errors: string[] = [];
    for (const file of files) {
      try {
        const isImage = /^image\//.test(file.type);
        const isAudio = /^audio\//.test(file.type);
        if (!isImage && !isAudio) throw new Error(`bad type ${file.type}`);
        if (file.size > 12 * 1024 * 1024) throw new Error('file > 12MB');
        const buf = Buffer.from(await file.arrayBuffer());
        const b64 = `data:${file.type};base64,${buf.toString('base64')}`;
        // uploadImageBase64 handles image MIME; for audio reuse same storage path
        const up = await uploadImageBase64(
          b64,
          folder,
          file.type || (isAudio ? 'audio/mpeg' : 'image/png'),
        );
        if (!up?.url) throw new Error('storage returned empty url');
        const row = {
          created_by: admin.user!.id,
          kind: isAudio ? 'audio' : kind,
          girlfriend_id: girlfriendId,
          storage_key: up.key,
          url: up.url,
          prompt: null,
          negative_prompt: null,
          workflow_id: 'upload',
          endpoint_id: null,
          ckpt_name: null,
          lora_name: null,
          width: null,
          height: null,
          steps: null,
          cfg: null,
          seed: null,
          meta: { source: 'admin_upload', original_name: file.name },
        };
        const { data: saved, error: insErr } = await admin.supabase
          .from('generation_assets')
          .insert(row)
          .select('*')
          .single();
        // Always return a usable URL so media binding succeeds even if assets table is missing columns
        if (insErr) {
          logger.warn('[comfy] generation_assets insert failed (url still returned)', {
            err: insErr.message,
            key: up.key,
          });
          assets.push({ ...row, id: null, warning: insErr.message });
        } else {
          assets.push(saved || row);
        }
        ok += 1;
      } catch (e) {
        errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({
      success: true,
      uploaded: ok,
      failed: errors.length,
      assets,
      errors: errors.slice(0, 10),
    });
  }

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
    const id = body.id as string | undefined;
    const storageKey = body.storage_key as string | undefined;
    if (!id && !storageKey) {
      return NextResponse.json({ error: 'id or storage_key required' }, { status: 400 });
    }

    if (id) {
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

    // storage-only asset (no DB row)
    await deleteFile(String(storageKey));
    return NextResponse.json({ success: true, storage_only: true });
  }

  if (body.action === 'batch_delete_assets') {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter(Boolean) : [];
    const keys = Array.isArray(body.storage_keys)
      ? (body.storage_keys as string[]).filter(Boolean)
      : [];
    const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    for (const it of items) {
      if (it?.id) ids.push(String(it.id));
      if (it?.storage_key) keys.push(String(it.storage_key));
      else if (it?.url) {
        const k = extractKeyFromUrl(String(it.url));
        if (k) keys.push(k);
      }
    }
    if (!ids.length && !keys.length) {
      return NextResponse.json({ error: 'ids or storage_keys required' }, { status: 400 });
    }
    if (ids.length + keys.length > 80) {
      return NextResponse.json({ error: 'Max 80 items per batch' }, { status: 400 });
    }

    let deleted = 0;
    const errors: string[] = [];

    for (const id of ids) {
      try {
        const { data: row } = await admin.supabase
          .from('generation_assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (row?.storage_key) await deleteFile(String(row.storage_key));
        else if (row?.url) {
          const k = extractKeyFromUrl(String(row.url));
          if (k) await deleteFile(k);
        }
        const { error } = await admin.supabase.from('generation_assets').delete().eq('id', id);
        if (error) throw error;
        deleted += 1;
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const key of keys) {
      try {
        await deleteFile(key);
        // best-effort db cleanup by storage_key
        await admin.supabase.from('generation_assets').delete().eq('storage_key', key);
        deleted += 1;
      } catch (e) {
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      failed: errors.length,
      errors: errors.slice(0, 15),
    });
  }

  if (body.action === 'upload_assets') {
    // JSON: { files: [{ name, content_type, data_base64, kind? }] }
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) {
      return NextResponse.json({ error: 'files required' }, { status: 400 });
    }
    if (files.length > 30) {
      return NextResponse.json({ error: 'Max 30 files' }, { status: 400 });
    }

    const kind = String(body.kind || 'girlfriend');
    const girlfriendId = String(body.girlfriend_id || body.girlfriendId || '').trim() || null;
    const folder = assetFolder(girlfriendId);
    const assets: Array<Record<string, unknown>> = [];
    let ok = 0;
    const errors: string[] = [];

    for (const f of files) {
      const name = String(f?.name || `upload_${Date.now()}.png`);
      try {
        const ct = String(f?.content_type || 'image/png');
        const raw = String(f?.data_base64 || '');
        if (!raw) throw new Error('empty data');
        const dataUrl = raw.startsWith('data:')
          ? raw
          : `data:${ct};base64,${raw}`;
        const up = await uploadImageBase64(dataUrl, folder, ct);
        const row = {
          created_by: admin.user!.id,
          kind: String(f?.kind || kind),
          girlfriend_id: girlfriendId,
          storage_key: up.key,
          url: up.url,
          prompt: f?.prompt ? String(f.prompt).slice(0, 2000) : null,
          negative_prompt: null,
          workflow_id: 'upload',
          endpoint_id: null,
          ckpt_name: null,
          lora_name: null,
          width: null,
          height: null,
          steps: null,
          cfg: null,
          seed: null,
          meta: { source: 'admin_upload', original_name: name },
        };
        const { data: saved, error: insErr } = await admin.supabase
          .from('generation_assets')
          .insert(row)
          .select('*')
          .single();
        if (insErr) {
          assets.push({ ...row, id: null, warning: insErr.message });
        } else {
          assets.push(saved);
        }
        ok += 1;
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      uploaded: ok,
      failed: errors.length,
      assets,
      errors: errors.slice(0, 10),
    });
  }

  
  if (body.action === 'move_assets' || body.action === 'copy_assets') {
    const mode = body.action === 'copy_assets' ? 'copy' : 'move';
    const targetGirlfriendId = String(body.girlfriend_id || body.girlfriendId || '').trim() || null;
    const ids = Array.isArray(body.ids) ? (body.ids as string[]).filter(Boolean) : [];
    const keys = Array.isArray(body.storage_keys)
      ? (body.storage_keys as string[]).filter(Boolean)
      : [];
    const items = Array.isArray(body.items) ? (body.items as Array<Record<string, unknown>>) : [];
    for (const it of items) {
      if (it?.id) ids.push(String(it.id));
      if (it?.storage_key) keys.push(String(it.storage_key));
    }
    if (!ids.length && !keys.length) {
      return NextResponse.json({ error: 'ids or storage_keys required' }, { status: 400 });
    }
    if (ids.length + keys.length > 80) {
      return NextResponse.json({ error: 'Max 80 items per batch' }, { status: 400 });
    }

    const folder = assetFolder(targetGirlfriendId);
    let changed = 0;
    const errors: string[] = [];
    const touched = new Set<string>();

    const processRow = async (row: Record<string, unknown> | null, fallbackKey?: string) => {
      const storageKey = String(row?.storage_key || fallbackKey || '').trim();
      if (!storageKey) throw new Error('missing storage_key');
      if (touched.has(storageKey)) return;
      touched.add(storageKey);

      const serviceKey =
        process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        '';
      const supabaseUrl =
        process.env.COZE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
      if (!serviceKey || !supabaseUrl) throw new Error('storage not configured');
      const sb = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const bucket = resolveBucketName();
      const { data: blob, error: dlErr } = await sb.storage.from(bucket).download(storageKey);
      if (dlErr || !blob) throw new Error(dlErr?.message || 'download failed');
      const ab = await blob.arrayBuffer();
      const b64 = `data:image/png;base64,${Buffer.from(ab).toString('base64')}`;
      const up = await uploadImageBase64(b64, folder, 'image/png');

      if (row?.id) {
        if (mode === 'move') {
          const { error } = await admin.supabase
            .from('generation_assets')
            .update({
              girlfriend_id: targetGirlfriendId,
              storage_key: up.key,
              url: up.url,
            })
            .eq('id', String(row.id));
          if (error) throw error;
          if (storageKey !== up.key) await deleteFile(storageKey);
        } else {
          await admin.supabase.from('generation_assets').insert({
            created_by: admin.user!.id,
            kind: row.kind || 'girlfriend',
            girlfriend_id: targetGirlfriendId,
            storage_key: up.key,
            url: up.url,
            prompt: row.prompt || null,
            negative_prompt: row.negative_prompt || null,
            workflow_id: row.workflow_id || null,
            endpoint_id: row.endpoint_id || null,
            ckpt_name: row.ckpt_name || null,
            lora_name: row.lora_name || null,
            width: row.width || null,
            height: row.height || null,
            steps: row.steps || null,
            cfg: row.cfg || null,
            seed: row.seed || null,
            meta: { ...(typeof row.meta === 'object' && row.meta ? (row.meta as object) : {}), copied_from: row.id },
          });
        }
      } else {
        await admin.supabase.from('generation_assets').insert({
          created_by: admin.user!.id,
          kind: 'girlfriend',
          girlfriend_id: targetGirlfriendId,
          storage_key: up.key,
          url: up.url,
          prompt: null,
          negative_prompt: null,
          workflow_id: mode,
          endpoint_id: null,
          ckpt_name: null,
          lora_name: null,
          width: null,
          height: null,
          steps: null,
          cfg: null,
          seed: null,
          meta: { source: mode, from_key: storageKey },
        });
        if (mode === 'move' && storageKey !== up.key) await deleteFile(storageKey);
      }
      changed += 1;
    };

    for (const id of ids) {
      try {
        const { data: row } = await admin.supabase
          .from('generation_assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        await processRow((row as Record<string, unknown>) || null);
      } catch (e) {
        errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const key of keys) {
      try {
        const { data: row } = await admin.supabase
          .from('generation_assets')
          .select('*')
          .eq('storage_key', key)
          .maybeSingle();
        await processRow((row as Record<string, unknown>) || null, key);
      } catch (e) {
        errors.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return NextResponse.json({
      success: true,
      mode,
      changed,
      failed: errors.length,
      target_girlfriend_id: targetGirlfriendId,
      errors: errors.slice(0, 15),
    });
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
    let prompt = String(body.prompt || '').trim();
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
    const allowedSamplers = new Set(['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_sde']);
    const allowedSchedulers = new Set(['simple', 'normal', 'karras', 'sgm_uniform']);
    const requestedSampler = String(body.sampler_name || 'euler');
    const requestedScheduler = String(body.scheduler || 'simple');
    const samplerName = allowedSamplers.has(requestedSampler) ? requestedSampler : 'euler';
    const scheduler = allowedSchedulers.has(requestedScheduler) ? requestedScheduler : 'simple';
    const imageCount = Math.min(4, Math.max(1, Math.floor(Number(body.num_images || 1))));
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
    const girlfriendId = String(body.girlfriend_id || body.girlfriendId || '').trim() || null;
    const characterConsistency = body.character_consistency === true;
    let consistencyReference = '';
    if (characterConsistency && girlfriendId) {
      const { data: girlfriend, error: girlfriendError } = await admin.supabase
        .from('girlfriends')
        .select('*')
        .eq('id', girlfriendId)
        .maybeSingle();
      if (girlfriendError) {
        logger.warn('[comfy] consistency girlfriend lookup failed', {
          girlfriend_id: girlfriendId,
          error: girlfriendError.message,
        });
      } else if (girlfriend) {
        prompt = assembleGirlfriendFromRow(girlfriend, prompt).positive;
        consistencyReference = String(
          girlfriend.portrait_url || girlfriend.avatar_url || girlfriend.card_url || '',
        ).trim();
      }
    }
    const effectiveInputImage = String(body.input_image || consistencyReference || '').trim() || undefined;
    const effectiveDenoise = effectiveInputImage
      ? characterConsistency ? Math.min(0.45, denoise) : denoise
      : undefined;
    const folder = assetFolder(girlfriendId);
    const loraStrength =
      body.lora_strength != null
        ? Number(body.lora_strength)
        : wf?.defaults.lora_strength ?? lora?.default_strength ?? 0.8;

    type RequestedLora = {
      id: string;
      name: string;
      strength_model: number;
      strength_clip: number;
    };
    const requestedLoras: RequestedLora[] = Array.isArray(body.loras)
      ? body.loras.slice(0, 4).map((item: unknown) => {
          const value = item && typeof item === 'object'
            ? item as Record<string, unknown>
            : {};
          const asset = cfg.loras.find((candidate) => candidate.id === String(value.id || ''));
          const strength = Number(value.strength ?? asset?.default_strength ?? 0.7);
          return asset?.filename
            ? {
                id: asset.id,
                name: asset.filename,
                strength_model: Math.min(1.2, Math.max(0, strength)),
                strength_clip: Math.min(1.2, Math.max(0, strength)),
              }
            : null;
        }).filter((item: RequestedLora | null): item is RequestedLora => item !== null)
      : [];
    const totalLoraStrength = requestedLoras.reduce(
      (sum: number, item: RequestedLora) => sum + item.strength_model,
      0,
    );
    const loraScale = totalLoraStrength > 1 ? 1 / totalLoraStrength : 1;
    const normalizedLoras = requestedLoras.map((item: RequestedLora) => ({
      ...item,
      strength_model: Number((item.strength_model * loraScale).toFixed(3)),
      strength_clip: Number((item.strength_clip * loraScale).toFixed(3)),
    }));

    try {
      const requestedLora = lora?.filename || body.lora_name || null;
      const loraSan = sanitizeLoraForVolume(requestedLora, {
        fallback: 'flux_style_photoreal_v1.safetensors',
      });
      if (loraSan.changed && requestedLora) {
        logger.warn('[comfy] lora not on volume, fallback', {
          requested: requestedLora,
          using: loraSan.lora_name,
          reason: loraSan.reason,
        });
      }
      const generationOptions = {
        prompt,
        negative_prompt: negative,
        width,
        height,
        num_inference_steps: steps,
        guidance_scale: cfgScale,
        sampler_name: samplerName,
        scheduler,
        num_images: effectiveInputImage ? 1 : imageCount,
        seed: seed >= 0 ? seed : undefined,
        input_image: effectiveInputImage,
        denoising_strength: effectiveDenoise,
        ckpt_name: body.ckpt_name || ckpt?.filename,
        lora_name: normalizedLoras.length ? null : loraSan.lora_name,
        lora_strength_model: loraStrength,
        lora_strength_clip: loraStrength,
        loras: normalizedLoras,
        endpoint_id: endpointId,
      };
      let result;
      try {
        result = await runpodClient.generate(generationOptions);
      } catch (generationError) {
        // A stale volume inventory can make Comfy reject the whole prompt when a
        // selected LoRA was removed or renamed on RunPod. Keep generation usable
        // by retrying once without optional LoRAs; checkpoint generation remains
        // the source of truth and the failure is still recorded in server logs.
        if (!normalizedLoras.length) throw generationError;
        logger.warn('[comfy] LoRA workflow failed, retrying without LoRA', {
          error: generationError instanceof Error ? generationError.message : String(generationError),
          loras: normalizedLoras.map((item) => item.name),
        });
        result = await runpodClient.generate({
          ...generationOptions,
          lora_name: null,
          loras: [],
        });
      }

      const assets: Array<Record<string, unknown>> = [];
      for (let i = 0; i < result.images.length; i++) {
        const raw = result.images[i];
        const { key, url } = await uploadImageBase64(
          raw,
          folder,
          'image/png',
        );

        const row = {
          created_by: admin.user!.id,
          kind,
          girlfriend_id: girlfriendId,
          storage_key: key,
          url,
          prompt,
          negative_prompt: negative,
          workflow_id: workflowId || null,
          endpoint_id: endpointId,
          ckpt_name: body.ckpt_name || ckpt?.filename || null,
          lora_name: normalizedLoras.length
            ? normalizedLoras.map((item: RequestedLora) => item.name).join(',')
            : loraSan.lora_name,
          width,
          height,
          steps,
          cfg: cfgScale,
          seed: seed >= 0 ? seed : null,
          meta: {
            job_id: result.job_id,
            execution_time: result.execution_time,
            lora_strength: loraStrength,
            loras: normalizedLoras,
            requested_lora_total_strength: totalLoraStrength,
            denoise: effectiveDenoise ?? 1,
            character_consistency: characterConsistency,
            consistency_reference: body.input_image
              ? 'uploaded_reference'
              : consistencyReference
                ? 'girlfriend_card'
                : 'prompt_traits_only',
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
