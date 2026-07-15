import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import {
  isCivitaiConfigured,
  searchCivitaiModels,
  getCivitaiModel,
  normalizeModel,
  type CivitaiModelType,
} from '@/lib/civitai';
import {
  loadModelLibrary,
  saveModelLibrary,
  libraryItemFromCivitai,
  buildLoraUrlsTxt,
  type LibraryItem,
  type ModelLibrary,
} from '@/lib/model-library';
import { LORA_CATALOG, groupLorasByCategory } from '@/lib/comfy-console/lora-catalog';
import { getInstalledLoraSet } from '@/lib/runpod-loras';
import { FLUX_PARAM_PRESETS, FLUX_SCENE_PRESETS } from '@/lib/prompt/flux-presets';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const RL = { maxRequests: 60, windowMs: 60 * 60 * 1000 };

/**
 * GET /api/admin/model-library
 *   ?view=library|search|export|presets|catalog|status
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const sp = new URL(req.url).searchParams;
  const view = sp.get('view') || 'library';

  if (view === 'status') {
    return NextResponse.json({
      civitai_configured: isCivitaiConfigured(),
      token_env: isCivitaiConfigured() ? 'set' : 'missing CIVITAI_API_TOKEN',
      volume: LORA_CATALOG.target_volume,
      region: LORA_CATALOG.region,
      catalog_version: LORA_CATALOG.version,
    });
  }

  if (view === 'catalog') {
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
      loras: LORA_CATALOG.loras,
    });
  }

  if (view === 'presets') {
    return NextResponse.json({
      param_presets: FLUX_PARAM_PRESETS,
      scene_presets: FLUX_SCENE_PRESETS,
    });
  }

  if (view === 'export') {
    const lib = await loadModelLibrary(admin.supabase);
    const status = sp.get('status'); // queued|wishlist|all
    let items = lib.items;
    if (status && status !== 'all') {
      items = items.filter((i) => i.status === status);
    } else {
      items = items.filter((i) => i.status === 'queued' || i.status === 'wishlist');
    }
    const text = buildLoraUrlsTxt(items);
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="lora-urls.txt"',
      },
    });
  }

  if (view === 'search') {
    const rl = await checkRateLimitAsync(`civitai-search:${admin.user!.id}`, RL);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many Civitai searches' },
        { status: 429, headers: rateLimitHeaders(rl, RL) },
      );
    }

    const query = sp.get('query') || sp.get('q') || '';
    const type = (sp.get('type') || 'LORA') as CivitaiModelType;
    const nsfw = sp.get('nsfw') !== '0';
    const limit = Math.min(Number(sp.get('limit') || 24), 48);
    const sort = (sp.get('sort') || 'Most Downloaded') as
      | 'Most Downloaded'
      | 'Highest Rated'
      | 'Newest';
    const base = sp.get('base') || 'Flux.1 D';

    try {
      const result = await searchCivitaiModels({
        query: query || 'woman',
        types: [type],
        baseModels: base ? [base] : ['Flux.1 D'],
        nsfw,
        sort,
        limit,
      });
      return NextResponse.json({
        ...result,
        civitai_configured: isCivitaiConfigured(),
        query,
        type,
        base,
      });
    } catch (e) {
      logger.error('[model-library] search failed', { err: e });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Search failed' },
        { status: 502 },
      );
    }
  }

  // default library
  const lib = await loadModelLibrary(admin.supabase);
  return NextResponse.json({
    library: lib,
    civitai_configured: isCivitaiConfigured(),
    catalog_version: LORA_CATALOG.version,
    categories: LORA_CATALOG.categories,
  });
}

/**
 * POST /api/admin/model-library
 * actions: add_civitai | add_manual | update | remove | bulk_status | import_catalog
 */
export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body?.action) {
    return NextResponse.json({ error: 'action required' }, { status: 400 });
  }

  try {
    const lib = await loadModelLibrary(admin.supabase);
    const action = String(body.action);

  if (action === 'add_civitai') {
    const rl = await checkRateLimitAsync(`civitai-add:${admin.user!.id}`, RL);
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    let itemPayload = body.item as Record<string, unknown> | undefined;
    const modelId = Number(body.model_id || itemPayload?.model_id || 0);
    const versionId = Number(body.version_id || itemPayload?.version_id || 0);

    // If only ids given, fetch full model
    if ((!itemPayload || !itemPayload.filename) && modelId) {
      try {
        const model = await getCivitaiModel(modelId);
        const norm = normalizeModel(model, versionId || undefined);
        if (!norm) {
          return NextResponse.json({ error: 'Could not normalize Civitai model' }, { status: 400 });
        }
        itemPayload = norm as unknown as Record<string, unknown>;
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Fetch model failed' },
          { status: 502 },
        );
      }
    }

    if (!itemPayload) {
      return NextResponse.json({ error: 'item or model_id required' }, { status: 400 });
    }

    // Accept already-normalized search hit
    const normalized = {
      model_id: Number(itemPayload.model_id),
      version_id: Number(itemPayload.version_id),
      name: String(itemPayload.name || 'Untitled'),
      version_name: String(itemPayload.version_name || ''),
      type: String(itemPayload.type || 'LORA'),
      base_model: String(itemPayload.base_model || ''),
      nsfw: !!itemPayload.nsfw,
      tags: Array.isArray(itemPayload.tags) ? (itemPayload.tags as string[]) : [],
      trigger_words: Array.isArray(itemPayload.trigger_words)
        ? (itemPayload.trigger_words as string[])
        : [],
      filename: String(itemPayload.filename || ''),
      download_url: String(itemPayload.download_url || ''),
      page_url: String(itemPayload.page_url || ''),
      preview_url: (itemPayload.preview_url as string) || null,
      size_kb: (itemPayload.size_kb as number) ?? null,
      creator: (itemPayload.creator as string) || null,
      stats: (itemPayload.stats as { downloads?: number }) || {},
    };

    if (!normalized.filename || !normalized.version_id) {
      return NextResponse.json({ error: 'Invalid Civitai item' }, { status: 400 });
    }

    // Optional rename filename for Comfy consistency
    if (typeof body.filename === 'string' && body.filename.trim()) {
      normalized.filename = body.filename.trim().replace(/[^\w.\-]+/g, '_');
      if (!normalized.filename.endsWith('.safetensors')) {
        normalized.filename += '.safetensors';
      }
    }

    const entry = libraryItemFromCivitai(normalized, {
      category: typeof body.category === 'string' ? body.category : undefined,
      strength: body.strength != null ? Number(body.strength) : undefined,
      status: (body.status as LibraryItem['status']) || 'queued',
    });

    const idx = lib.items.findIndex((i) => i.id === entry.id || i.filename === entry.filename);
    if (idx >= 0) {
      lib.items[idx] = {
        ...lib.items[idx],
        ...entry,
        created_at: lib.items[idx].created_at,
        updated_at: new Date().toISOString(),
      };
    } else {
      lib.items.unshift(entry);
    }

    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, item: entry, library: lib });
  }

  if (action === 'add_manual') {
    const now = new Date().toISOString();
    const filename = String(body.filename || '').trim();
    if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
    const entry: LibraryItem = {
      id: `manual:${filename}`,
      kind: (body.kind as LibraryItem['kind']) || 'lora',
      label: String(body.label || filename),
      filename,
      category: String(body.category || 'style'),
      default_strength: Number(body.strength ?? 0.7),
      nsfw: !!body.nsfw,
      trigger_words: Array.isArray(body.trigger_words)
        ? (body.trigger_words as string[])
        : String(body.trigger_words || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      usage: String(body.usage || 'Manual entry'),
      source: 'manual',
      page_url: typeof body.page_url === 'string' ? body.page_url : undefined,
      download_url: typeof body.download_url === 'string' ? body.download_url : undefined,
      base_model: String(body.base_model || 'FLUX.1'),
      preview_url: null,
      status: (body.status as LibraryItem['status']) || 'wishlist',
      notes: typeof body.notes === 'string' ? body.notes : undefined,
      created_at: now,
      updated_at: now,
    };
    lib.items.unshift(entry);
    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, item: entry, library: lib });
  }

  if (action === 'update') {
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const idx = lib.items.findIndex((i) => i.id === id);
    if (idx < 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const patch = (body.patch || body) as Partial<LibraryItem>;
    const allowed: (keyof LibraryItem)[] = [
      'label',
      'filename',
      'category',
      'default_strength',
      'nsfw',
      'trigger_words',
      'usage',
      'status',
      'notes',
      'page_url',
      'download_url',
    ];
    const next = { ...lib.items[idx] };
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        (next as Record<string, unknown>)[k] = patch[k];
      }
    }
    next.updated_at = new Date().toISOString();
    lib.items[idx] = next;
    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, item: next, library: lib });
  }

  if (action === 'remove') {
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    lib.items = lib.items.filter((i) => i.id !== id);
    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, library: lib });
  }

  if (action === 'bulk_status') {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const status = body.status as LibraryItem['status'];
    if (!ids.length || !status) {
      return NextResponse.json({ error: 'ids and status required' }, { status: 400 });
    }
    const set = new Set(ids);
    lib.items = lib.items.map((i) =>
      set.has(i.id) ? { ...i, status, updated_at: new Date().toISOString() } : i,
    );
    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, library: lib });
  }

  if (action === 'sync_installed') {
    const lib = await loadModelLibrary(admin.supabase);
    const installed = getInstalledLoraSet();
    let updated = 0;
    const now = new Date().toISOString();
    for (const it of lib.items) {
      const fn = String(it.filename || '').trim();
      if (!fn) continue;
      if (installed.has(fn) && it.status !== 'downloaded') {
        it.status = 'downloaded';
        it.updated_at = now;
        updated += 1;
      } else if (!installed.has(fn) && it.status === 'downloaded' && body.demote_missing) {
        it.status = 'wishlist';
        it.updated_at = now;
        updated += 1;
      }
    }
    lib.updated_at = now;
    await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({
      ok: true,
      updated,
      installed: [...installed].sort(),
      library: lib,
    });
  }

  if (action === 'import_catalog') {
    // re-seed missing catalog entries
    const { source } = await saveModelLibrary(lib, admin.supabase);
    return NextResponse.json({ success: true, source, library: lib });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });

  } catch (e) {
    const msg = e instanceof Error ? e.message : '操作失败';
    logger.error('[model-library] POST failed', { action: body.action, err: msg });
    // Distinguish DB/filesystem errors from validation errors
    if (/保存失败|EROFS|EACCES|upsert|site_settings/i.test(msg)) {
      return NextResponse.json(
        { error: `保存失败：${msg}。请检查 Supabase site_settings 表是否存在。` },
        { status: 500 },
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
