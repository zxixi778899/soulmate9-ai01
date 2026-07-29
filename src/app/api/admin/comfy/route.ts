import { NextRequest, NextResponse } from 'next/server';
import { sanitizeLoraForVolume, verifyLoraHealth, checkLoraAuthenticity, getVerifiedInstalledLoraSet, getInstalledLoraSet, LORA_REGISTRY } from '@/lib/runpod-loras';
import { requireAdmin } from '@/lib/require-admin';
import {
  loadComfyConfig,
  saveComfyConfig,
  invalidateComfyCache,
  type ComfyConsoleConfig,
} from '@/lib/comfy-console/store';
import { createDefaultComfyConfig } from '@/lib/comfy-console/defaults';
import { LORA_CATALOG, catalogToLoraAssets, groupLorasByCategory } from '@/lib/comfy-console/lora-catalog';
import { loraUsageZh } from '@/lib/comfy-console/studio-profile';
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
import { captureException } from '@/lib/sentry';
import { loadAiModules } from '@/lib/ai-modules/store';
import { resolveChatCall } from '@/lib/ai-modules/resolve';
import { invokeChat } from '@/lib/ai-modules/invoke';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { COMPACT_ADULT_NEGATIVE, COMPANION_CATEGORIES, normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';
import { resolveImageGenerationRoute, type ImageSurface } from '@/lib/image-generation-routing';
import { buildSceneCastPrompt, classifyImageScene, normalizeLlmImageScene } from '@/lib/image-scene-semantics';
import { resolveModelLoraPlan } from '@/lib/model-lora-routing';
import { isLoraAllowedForContext } from '@/lib/lora-scope';
import { buildStudioPromptEnhancement, recommendedStudioLoras, studioLoraStrengthScale, studioNegativePrompt, type AnimeRenderStyle, type NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { buildReferenceGenerationPlan, companionIdentityAssets, type ReferenceAsset, type ReferenceControlSettings } from '@/lib/reference-generation-plan';
import { getCharacterProductionPreset, identityReferenceRolePriority, identityTurnaroundDenoise, normalizeCharacterAssetRole, styleProductionHint } from '@/lib/character-asset-production';
import { buildCompanionGenerationPrompt, buildCompanionIdentityBrief } from '@/lib/companion-generation';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const GEN_LIMIT = { maxRequests: 40, windowMs: 60 * 60 * 1000 };

function assetFolder(girlfriendId?: string | null, assetRole?: unknown): string {
  const id = (girlfriendId || '').trim();
  if (id) return `girlfriends/${id}/${normalizeCharacterAssetRole(assetRole)}`;
  return 'comfy-outputs';
}


function mergeInstalledLoras(config: ComfyConsoleConfig): ComfyConsoleConfig {
  const installed = getVerifiedInstalledLoraSet();
  if (!installed.size) return config;
  const catalog = catalogToLoraAssets();
  const existingFiles = new Set(config.loras.map((item) => item.filename).filter(Boolean));
  const catalogByFile = new Map(catalog.filter((item) => item.filename).map((item) => [item.filename, item]));
  const registryByFile = new Map(LORA_REGISTRY.map((item) => [item.file, item]));
  const verifiedLoras = config.loras.map((item) => installed.has(item.filename)
    ? {
        ...item,
        label: item.label.startsWith('[同步盘已验证]') ? item.label : `[同步盘已验证] ${item.label}`,
        usage: `同步盘 models/loras 已存在此文件。${loraUsageZh(item)}`,
        source: 'runpod-volume',
      }
    : item);
  const additions = [...installed].filter((file) => !existingFiles.has(file)).map((file) => {
    const known = catalogByFile.get(file);
    if (known) return { ...known, label: `[同步盘已验证] ${known.label}`, source: 'runpod-volume' };
    const registry = registryByFile.get(file);
    const stem = file.replace(/\.safetensors$/i, '');
    return {
      id: `volume:${stem.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`,
      label: `[同步盘已验证] ${registry?.label || stem}`,
      filename: file,
      default_strength: registry?.strength ?? 0.55,
      category: registry?.category === 'pose' ? 'action' : registry?.category || 'style',
      nsfw: registry?.category === 'pose' || /nsfw|ahegao|lingerie|bikini|latex|bunny/i.test(file),
      usage: loraUsageZh({
        id: stem,
        label: registry?.label || stem,
        filename: file,
        category: registry?.category === 'pose' ? 'action' : registry?.category || 'style',
      }),
      trigger_words: registry?.trigger_words || [],
      workflows: ['wf-girlfriend'],
      source: 'runpod-volume',
    };
  });
  return { ...config, loras: [...verifiedLoras, ...additions] };
}

/**
 * GET /api/admin/comfy
 *   ?view=config | assets | help | loras
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  const view = new URL(req.url).searchParams.get('view') || 'config';
  const storedCfg = await loadComfyConfig(admin.supabase);
  const cfg = mergeInstalledLoras(storedCfg);

  if (view === 'volume' || view === 'installed') {
    const { getVerifiedInstalledLoraSet } = await import('@/lib/runpod-loras');
    const installed = [...getVerifiedInstalledLoraSet()].sort();
    return NextResponse.json({
      volume: cfg.network_volume,
      target_volume: LORA_CATALOG.target_volume,
      region: LORA_CATALOG.region,
      base_model: LORA_CATALOG.base_model,
      installed_loras: installed,
      code_allowlist: installed,
      inventory_source: installed.length ? 'runtime-volume' : 'unavailable',
      env_override: !!(process.env.RUNPOD_INSTALLED_LORAS || process.env.COMFY_INSTALLED_LORAS),
      paths: {
        loras: cfg.network_volume?.loras_dir || 'models/loras',
        checkpoints: cfg.network_volume?.checkpoints_dir || 'models/checkpoints',
      },
      note:
        '只有 RUNPOD_INSTALLED_LORAS 提供的运行卷清单会标记为真实盘上；注册表仅用于配置和回退。',
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
    const assetRole = normalizeCharacterAssetRole(form.get('asset_role'));
    const folder = assetFolder(girlfriendId, assetRole);
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
          meta: {
            source: 'admin_upload',
            original_name: file.name,
            asset_role: assetRole,
            reference_role: assetRole.startsWith('identity-') || assetRole === 'avatar-closeup'
              ? 'identity'
              : assetRole === 'pose-reference'
                ? 'pose'
                : assetRole === 'style-reference'
                  ? 'style'
                  : assetRole === 'composition-reference'
                    ? 'composition'
                    : 'identity',
          },
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

  if (body.action === 'optimize_prompt') {
    const rl = await checkRateLimitAsync(`comfy-optimize:${admin.user!.id}`, { maxRequests: 30, windowMs: 60 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many prompt optimization requests' }, { status: 429 });
    }
    const rawCategory = String(body.companion_category || 'female');
    const category: CompanionCategory = rawCategory === 'anime'
      ? 'female'
      : COMPANION_CATEGORIES.includes(rawCategory as CompanionCategory)
        ? rawCategory as CompanionCategory
        : 'female';
    const intensity = Math.min(5, Math.max(1, Math.round(Number(body.nsfw_intensity || 3)))) as NsfwIntensity;
    const animeStyle: AnimeRenderStyle = body.anime_render_style === '3d' ? '3d' : body.anime_render_style === '2d' ? '2d' : 'realistic';
    const currentPrompt = String(body.prompt || '').trim();
    const generationMode = body.gen_mode === 'img2video' ? 'img2video' : body.gen_mode === 'img2img' ? 'img2img' : 'txt2img';
    const requestedAssetRole = normalizeCharacterAssetRole(body.asset_role);
    const companion = body.companion && typeof body.companion === 'object'
      ? body.companion as Record<string, unknown>
      : {};
    const profile = JSON.stringify(companion).slice(0, 5000);
    const identity = [
      companion.name,
      companion.appearance_race,
      companion.appearance_hair_color,
      companion.appearance_hair,
      companion.appearance_eyes,
      companion.appearance_body,
      companion.appearance,
    ].filter(Boolean).map(String).join(', ');
    const systemPrompt = `Analyze the requested adults-only image and return strict JSON only. Keys: "prompt", "negative", "pairing", "protagonist", "power_dynamic", "tags". pairing must be solo|female_male|male_male|female_female|trans_pair|group_4i. protagonist must be female|male|transgender|femboy|ensemble. power_dynamic must be neutral|male_dominant|male_submissive|sm. Interpret Chinese role labels: \u7537\u5973, \u7537\u7537, \u5973\u5973, \u5973\u4e3b, \u7537\u4e3b, \u8de8\u6027\u522b, 4i, \u4f2a\u5a18, SM, \u7537\u653b, \u7537\u53d7. The prompt is one concise natural-English setting/action/framing description for consenting adults. For img2img, describe only the requested scene, action, wardrobe, framing and lighting while preserving the supplied identity. For img2video, describe coherent motion originating from the supplied still image, stable identity, stable camera and temporal continuity. Never infer minors or non-consent.`;
    const userPrompt = [
      `Selected category: ${category}`,
      `Render style: ${animeStyle}`,
      `Selected NSFW intensity: ${intensity}/5`,
      `Generation mode: ${generationMode}`,
      `Asset role: ${requestedAssetRole}`,
      `Companion profile, used only to infer a fitting location: ${profile}`,
      `Current prompt, used only to preserve its location or framing: ${currentPrompt || 'a modern sofa in a private living room'}`,
      'Return a short setting such as "on a modern sofa in a private living room, medium full-body framing".',
      `Negative prompt must be concise and include: ${studioNegativePrompt(category, animeStyle)}`,
    ].join('\n');
    try {
      const aiConfig = await loadAiModules(admin.supabase);
      const resolved = resolveChatCall(aiConfig, {
        tier: 'admin',
        userId: admin.user!.id,
        message: userPrompt,
        preferNsfw: true,
        intimacyLevel: 5,
        adultCharacterVerified: true,
        locale: 'en',
        rolloutPercent: 100,
      });
      const result = await invokeChat({
        endpoint: resolved.endpoint,
        fallbackEndpoints: resolved.fallbackChain,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.72,
        maxTokens: 900,
        userId: admin.user!.id,
        taskType: 'prompt_optimization',
        membershipTier: 'admin',
        scene: 'admin_comfy_prompt',
        routeReason: resolved.routeReason,
      });
      const raw = result.content;
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      const fallbackSemantics = classifyImageScene(`${currentPrompt} ${profile}`, category);
      const sceneSemantics = normalizeLlmImageScene(parsed, fallbackSemantics);
      const optimizedScene = String(parsed.prompt || '').trim();
      if (!optimizedScene) throw new Error('LLM returned an empty scene');
      const modeInstruction = generationMode === 'img2video'
        ? 'Animate the exact supplied still for five seconds with stable facial identity, coherent natural motion, subtle hair and fabric movement, smooth temporal continuity, no morphing and no scene cuts.'
        : generationMode === 'img2img'
          ? 'Use the supplied avatar and identity turnaround references to preserve the exact face, hair, body proportions and distinguishing features; change only the requested scene, action, wardrobe, framing and lighting.'
          : 'Create the complete frame from the companion profile and requested scene.';
      const optimizedPrompt = buildStudioPromptEnhancement({
        category,
        intensity,
        animeStyle,
        scene: `${optimizedScene}. ${buildSceneCastPrompt(sceneSemantics)}. ${modeInstruction}`,
        identity,
      });
      const generationRoute = resolveImageGenerationRoute({
        surface: 'companion', category, renderStyle: animeStyle, nsfwIntensity: intensity, sceneSemantics,
      });
      const cfg = mergeInstalledLoras(await loadComfyConfig(admin.supabase));
      const installed = getInstalledLoraSet();
      const scale = studioLoraStrengthScale(intensity);
      const recommendations = recommendedStudioLoras(category, animeStyle);
      const loras = recommendations
        .map((item) => {
          const asset = cfg.loras.find((candidate) => candidate.id === item.id);
          return asset?.filename && installed.has(asset.filename)
            ? { id: asset.id, strength: Number(Math.min(1.05, item.strength * scale).toFixed(2)) }
            : null;
        })
        .filter((item): item is { id: string; strength: number } => item !== null);
      return NextResponse.json({
        success: true,
        source: 'llm',
        scene_semantics: sceneSemantics,
        generation_preset: generationRoute,
        prompt: `${generationRoute.promptPrefix} ${optimizedPrompt}`,
        negative: String(parsed.negative || studioNegativePrompt(category, animeStyle)).trim(),
        loras,
        pipeline: {
          identitySource: identity ? 'companion_record' : 'manual_prompt',
          identity,
          category,
          intensity,
          prompt: optimizedPrompt,
          loras,
        },
        missing_loras: recommendations
          .filter((item) => !loras.some((selected) => selected.id === item.id))
          .map((item) => ({ id: item.id, reasonZh: item.reasonZh })),
      });
    } catch (error) {
      captureException(error, { tags: { route: 'admin-comfy', action: 'optimize_prompt' } });
      logger.error('[comfy] LLM prompt optimization failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({ error: 'LLM prompt optimization failed. No preset fallback was used.' }, { status: 502 });
    }
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

if (body.action === 'finalize') {
    // submit_only 架构下 generate 的保存分支不会触发，ComfyConsole 轮询
    // /api/runpod/status 到 COMPLETED 后调用本接口补存：把图片从临时
    // generated-images 目录搬到正确资产目录，并写入 generation_assets。
    const jobId = String(body.job_id || '');
    const imageUrls: string[] = Array.isArray(body.images)
      ? (body.images as unknown[]).filter(
          (u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u),
        )
      : [];
    if (!imageUrls.length) {
      return NextResponse.json({ error: 'images required' }, { status: 400 });
    }

    const girlfriendId = String(body.girlfriend_id || body.girlfriendId || '').trim() || null;
    const assetRole = normalizeCharacterAssetRole(body.asset_role);
    const folder = assetFolder(girlfriendId, assetRole);
    const kind = String(body.kind || 'custom');

    const cfg = await loadComfyConfig(admin.supabase);
    const ckpt = cfg.checkpoints.find((c) => c.id === String(body.ckpt_id || '')) || null;
    const loraNames: string[] = Array.isArray(body.loras)
      ? (body.loras as Array<Record<string, unknown>>)
          .map((item) => cfg.loras.find((l) => l.id === String(item?.id || ''))?.filename)
          .filter((name): name is string => !!name)
      : [];
    if (!loraNames.length && body.lora_id) {
      const single = cfg.loras.find((l) => l.id === String(body.lora_id));
      if (single?.filename) loraNames.push(single.filename);
    }

    const assets: Array<Record<string, unknown>> = [];
    for (const imageUrl of imageUrls.slice(0, 4)) {
      try {
        const existingKey = extractKeyFromUrl(imageUrl) || '';
        let key = existingKey;
        let url = imageUrl;
        if (!existingKey.startsWith(`${folder}/`)) {
          const resp = await fetch(imageUrl);
          if (!resp.ok) throw new Error(`download ${resp.status}`);
          const contentType = resp.headers.get('content-type') || 'image/png';
          const b64 = `data:${contentType};base64,${Buffer.from(await resp.arrayBuffer()).toString('base64')}`;
          const uploaded = await uploadImageBase64(b64, folder, contentType);
          key = uploaded.key;
          url = uploaded.url;
        }

        const row = {
          created_by: admin.user!.id,
          kind,
          girlfriend_id: girlfriendId,
          storage_key: key,
          url,
          prompt: String(body.prompt || ''),
          negative_prompt: String(body.negative || ''),
          workflow_id: body.workflow_id || null,
          endpoint_id: body.endpoint_id || null,
          ckpt_name: body.ckpt_name || ckpt?.filename || null,
          lora_name: loraNames.length ? loraNames.join(',') : null,
          width: body.width != null ? Number(body.width) : null,
          height: body.height != null ? Number(body.height) : null,
          steps: body.steps != null ? Number(body.steps) : null,
          cfg: body.cfg != null ? Number(body.cfg) : null,
          seed: body.seed != null && Number(body.seed) >= 0 ? Number(body.seed) : null,
          meta: {
            job_id: jobId,
            finalized: true,
            asset_role: assetRole,
            reference_role: body.reference_role || 'identity',
            ...(body.meta && typeof body.meta === 'object' ? (body.meta as object) : {}),
          },
        };

        const { data: saved, error: insErr } = await admin.supabase
          .from('generation_assets')
          .insert(row)
          .select('*')
          .single();

        if (insErr) {
          logger.warn('[comfy] finalize insert failed', { err: insErr.message });
          assets.push({ ...row, id: null, warning: insErr.message });
        } else {
          assets.push(saved);
          // 清理 status 端点上传的临时文件
          const tempKey = extractKeyFromUrl(imageUrl);
          if (tempKey && tempKey.startsWith('generated-images/') && tempKey !== key) {
            try { await deleteFile(tempKey); } catch { /* best effort */ }
          }
        }
      } catch (e) {
        logger.warn('[comfy] finalize image failed', {
          url: imageUrl,
          e: e instanceof Error ? e.message : String(e),
        });
        // 保底：至少保留轮询拿到的 URL，不至于丢图
        assets.push({
          id: null,
          url: imageUrl,
          storage_key: extractKeyFromUrl(imageUrl) || '',
          warning: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({ success: true, assets, job_id: jobId });
  }

if (body.action === 'verify_loras') {
    // Accept optional file_sizes map from volume scan: { "filename.safetensors": bytes }
    const fileSizes: Record<string, number> | undefined =
      body.file_sizes && typeof body.file_sizes === 'object' ? body.file_sizes : undefined;
    const report = verifyLoraHealth(fileSizes);
    // If specific files requested, check each (with size when available)
    const files: string[] = Array.isArray(body.files) ? body.files : [];
    const fileChecks = files.map((f) => ({
      file: f,
      issue: checkLoraAuthenticity(f, fileSizes?.[f]),
    }));
    const verifyConfig = await loadComfyConfig(admin.supabase);
    const installed = new Set(report.entries.filter((entry) => entry.status === 'ok').map((entry) => entry.file));
    const catalogChecks = verifyConfig.loras
      .filter((lora) => Boolean(lora.filename))
      .map((lora) => ({
        id: lora.id,
        label: lora.label,
        file: lora.filename,
        purpose_zh: loraUsageZh(lora),
        status: installed.has(lora.filename)
          ? 'ok'
          : report.inventorySource === 'runtime-volume'
            ? 'missing'
            : 'unknown',
        size_bytes: fileSizes?.[lora.filename],
        source_url: lora.page_url || null,
      }));
    return NextResponse.json({
      success: true,
      health: report,
      catalog_checks: catalogChecks,
      file_checks: fileChecks.length ? fileChecks : undefined,
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
    // Unified endpoint: all generation goes to wozrrlcdipyl3p
    const endpointId =
      body.endpoint_id ||
      process.env.RUNPOD_ENDPOINT_ID ||
      'wozrrlcdipyl3p';

    let width = Number(body.width || wf?.defaults.width || 832);
    let height = Number(body.height || wf?.defaults.height || 1216);
    const categoryForParams = String(body.companion_category || 'female');
    const minimumSteps = categoryForParams === 'transgender' ? 32 : 28;
    const steps = Math.max(minimumSteps, Number(body.steps || wf?.defaults.steps || minimumSteps));
    const cfgScale = Math.min(2, Math.max(1, Number(body.cfg || wf?.defaults.cfg || 1.4)));
    const allowedSamplers = new Set(['euler', 'euler_ancestral', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_sde']);
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
        : body.denoising_strength != null
          ? Number(body.denoising_strength)
          : body.input_image
            ? Number(wf?.defaults.denoise ?? 0.55)
            : 1;
    let negative = String(
      body.negative || wf?.defaults.negative || 'blurry, low quality, watermark',
    );
    const kind = body.kind || wf?.kind || 'custom';
    const girlfriendId = String(body.girlfriend_id || body.girlfriendId || '').trim() || null;
    const assetRole = normalizeCharacterAssetRole(body.asset_role);
    const characterConsistency = body.character_consistency === true;
    let consistencyReference = '';
    let databaseCompanion: Record<string, unknown> | null = null;
    if (girlfriendId) {
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
        databaseCompanion = girlfriend as Record<string, unknown>;
        // Keep the category-selected prompt; only reuse the image for identity.
        // Rebuilding from storage here used to restore the original gender.
        consistencyReference = String(
          girlfriend.portrait_url || girlfriend.avatar_url || girlfriend.card_url || '',
        ).trim();
      }
    }
    const rawCategory = String(body.companion_category || 'female');
    let category: CompanionCategory = rawCategory === 'anime'
      ? 'female'
      : COMPANION_CATEGORIES.includes(rawCategory as CompanionCategory)
        ? rawCategory as CompanionCategory
        : 'female';
    const rawIntensity = Math.round(Number(body.nsfw_intensity || 5));
    const nsfwIntensity = Math.min(5, Math.max(1, rawIntensity)) as NsfwIntensity;
    const animeStyle: AnimeRenderStyle = body.anime_render_style === '3d' ? '3d' : body.anime_render_style === '2d' ? '2d' : 'realistic';
    const isIdentityAsset = assetRole === 'avatar-closeup' || assetRole.startsWith('identity-');
    const generationIntensity: NsfwIntensity = isIdentityAsset ? 1 : nsfwIntensity;
    if (isIdentityAsset) {
      if (!databaseCompanion) {
        return NextResponse.json({ error: 'Companion database record is required for identity generation' }, { status: 400 });
      }
      // Keep prompt SHORT — FLUX loses coherence with overly long prompts.
      // Scene presets already include quality/composition cues.
      const productionPreset = getCharacterProductionPreset(assetRole);
      const briefIdentity = buildCompanionIdentityBrief(databaseCompanion);
      prompt = `${productionPreset.scene}, ${briefIdentity}`;
      // Composition forbids differ per role: avatar = half-body, turnaround = 3-view sheet, others = full-body.
      negative = assetRole === 'avatar-closeup'
        ? '3D render, CG, mannequin, doll, plastic skin, wireframe, close-up, headshot, face only, cropped shoulders, bokeh, blurry'
        : assetRole === 'identity-turnaround'
          ? '3D render, CG, mannequin, doll, plastic skin, wireframe, single view, one view only, headshot, half-body, portrait, collage, overlapping figures, bokeh, blurry'
          : '3D render, CG, mannequin, doll, plastic skin, wireframe, T-pose, close-up, headshot, half-body, bokeh, blurry';
      category = normalizeCompanionCategory({
        gender: String(databaseCompanion.gender || ''),
        style: String(databaseCompanion.style || ''),
        tags: databaseCompanion.tags,
      });
    }
    const surface = (body.generation_surface || (kind === 'girlfriend' ? 'companion' : kind) || 'companion') as ImageSurface;
    const sceneSemantics = classifyImageScene(prompt, category);
    const generationRoute = resolveImageGenerationRoute({ surface, category, renderStyle: animeStyle, nsfwIntensity: generationIntensity, sceneSemantics });
    if (body.width == null) width = generationRoute.width;
    if (body.height == null) height = generationRoute.height;
    // Identity assets skip the portrait promptPrefix — composition instruction is already first
    if (!isIdentityAsset) {
      prompt = `${generationRoute.promptPrefix} ${buildSceneCastPrompt(sceneSemantics)} ${prompt}`;
    }
    if (surface === 'companion' && body.prompt_profile_applied !== true && !isIdentityAsset) {
      prompt = buildStudioPromptEnhancement({
        category,
        intensity: generationIntensity,
        animeStyle,
        scene: prompt,
      });
    }
    if (surface === 'companion' && !isIdentityAsset) {
      negative = `${studioNegativePrompt(category, animeStyle)}, ${COMPACT_ADULT_NEGATIVE}`;
    }

    const suppliedReference = String(body.input_image || '').trim();
    const storedIdentityUrls: string[] = [];
    if (girlfriendId && characterConsistency) {
      const { data: storedIdentityRows, error: storedIdentityError } = await admin.supabase
        .from('generation_assets')
        .select('url, meta, created_at')
        .eq('girlfriend_id', girlfriendId)
        .order('created_at', { ascending: false })
        .limit(40);
      if (storedIdentityError) {
        logger.warn('[comfy] identity asset lookup failed', {
          girlfriend_id: girlfriendId,
          error: storedIdentityError.message,
        });
      } else {
        const rolePriority = identityReferenceRolePriority(assetRole);
        for (const role of rolePriority) {
          const match = (storedIdentityRows || []).find((row) => {
            const meta = row.meta && typeof row.meta === 'object'
              ? row.meta as Record<string, unknown>
              : {};
            return String(meta.asset_role || '') === role && typeof row.url === 'string' && row.url.trim();
          });
          if (match?.url) storedIdentityUrls.push(String(match.url).trim());
        }
      }
    }
    const requiresTurnaroundReference = assetRole === 'character-art' || assetRole === 'album' || assetRole === 'scene';
    const identityReferenceUrls = [...storedIdentityUrls, ...(requiresTurnaroundReference ? [] : [consistencyReference])].filter(Boolean);

    // ─── Scene-only prompt: identity controlled by reference image ───────────
    // When identity reference images are available, the prompt should ONLY
    // describe scene + action + quality. Character appearance is preserved
    // by the reference image via img2img / IP-Adapter, not by text.
    if (requiresTurnaroundReference && identityReferenceUrls.length > 0 && databaseCompanion) {
      const productionPreset = getCharacterProductionPreset(assetRole);
      const sceneOnlyResult = buildCompanionGenerationPrompt(databaseCompanion, {
        action: `${productionPreset.scene}. ${styleProductionHint(animeStyle)}`,
        adult: generationIntensity >= 3,
        sceneOnly: true,
      });
      prompt = `${generationRoute.promptPrefix} ${sceneOnlyResult.positive}`;
      negative = sceneOnlyResult.negative;
      category = sceneOnlyResult.category;
    }

    const identityAssets = girlfriendId && identityReferenceUrls.length
      ? companionIdentityAssets(girlfriendId, identityReferenceUrls, {
          category,
          renderStyle: animeStyle,
          modelFamily: generationRoute.modelFamily,
        })
      : [];
    const manualAssets: ReferenceAsset[] = suppliedReference
      ? [{
          id: 'manual-reference',
          url: suppliedReference,
          role: girlfriendId && characterConsistency ? 'identity' : 'pose',
          companionId: girlfriendId && characterConsistency ? girlfriendId : undefined,
          category,
          renderStyle: animeStyle,
          modelFamily: generationRoute.modelFamily,
          qualityScore: 100,
        }]
      : [];
    const requestedReferenceControls =
      body.reference_controls && typeof body.reference_controls === 'object'
        ? body.reference_controls as Partial<ReferenceControlSettings>
        : cfg.reference_control;
    const referencePlan = buildReferenceGenerationPlan({
      surface,
      category,
      renderStyle: animeStyle,
      modelFamily: generationRoute.modelFamily,
      companionId: girlfriendId || undefined,
      nsfwLevel: generationIntensity,
      controls: requestedReferenceControls,
      assets: [...identityAssets, ...manualAssets, ...(cfg.reference_assets || [])],
    });
    if (referencePlan.promptHints.length > 0) {
      prompt = `${prompt} ${referencePlan.promptHints.join('. ')}`;
    }
    // Determine the effective input image for img2img.
    // Pipeline explicitly sends input_image for stages that need it (turnaround, character-art).
    // If not supplied, fall back to the reference plan's best identity asset.
    const effectiveInputImage =
      referencePlan.primaryIdentity?.url ||
      referencePlan.selected.find((asset) => asset.id === 'manual-reference')?.url;
    const effectiveDenoise = effectiveInputImage
      ? characterConsistency
        ? identityTurnaroundDenoise(assetRole, denoise)
        : Math.min(0.95, Math.max(0.5, denoise))
      : undefined;
    // IP-Adapter: face reference without composition lock (from request body or auto-resolved)
    // Only pass through when worker has ComfyUI_IPAdapter_plus installed
    const ipAdapterEnabled = process.env.RUNPOD_IPADAPTER_INSTALLED === '1';
    const ipAdapterImage = ipAdapterEnabled
      ? (String(body.ip_adapter_image || '').trim() || undefined)
      : undefined;
    const ipAdapterWeight = ipAdapterEnabled && body.ip_adapter_weight != null
      ? Math.min(1.0, Math.max(0.3, Number(body.ip_adapter_weight)))
      : undefined;
    const folder = assetFolder(girlfriendId, assetRole);
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
      ? body.loras.slice(0, 3).map((item: unknown) => {
          const value = item && typeof item === 'object'
            ? item as Record<string, unknown>
            : {};
          const asset = cfg.loras.find((candidate) => candidate.id === String(value.id || ''));
          if (asset && !isLoraAllowedForContext(asset, { surface, category, modelFamily: generationRoute.modelFamily })) return null;
          const baseStrength = Number(value.strength ?? asset?.default_strength ?? 0.7);
          const strength = baseStrength * studioLoraStrengthScale(generationIntensity);
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
    const loraScale = totalLoraStrength > 1.55 ? 1.55 / totalLoraStrength : 1;
    const normalizedLoras = requestedLoras.map((item: RequestedLora) => ({
      ...item,
      strength_model: Number((item.strength_model * loraScale).toFixed(3)),
      strength_clip: Number((item.strength_clip * loraScale).toFixed(3)),
    }));
    const compatibleLoraPlan = resolveModelLoraPlan({
      modelFamily: generationRoute.modelFamily,
      category,
      intensity: generationIntensity,
      animeStyle,
      requested: normalizedLoras,
      maxLoras: generationIntensity >= 3 ? 3 : 2,
    });
    const effectiveLoras = compatibleLoraPlan.selected;
    if (compatibleLoraPlan.triggerWords.length > 0) {
      prompt = `${compatibleLoraPlan.triggerWords.join(', ')}. ${prompt}`;
    }

    try {
      const singleLoraAllowed = lora ? isLoraAllowedForContext(lora, { surface, category, modelFamily: generationRoute.modelFamily }) : false;
      const requestedLora = singleLoraAllowed ? lora?.filename || null : null;
      const loraSan = sanitizeLoraForVolume(requestedLora, {
        fallback: generationRoute.modelFamily === 'flux' ? 'flux_style_photoreal_v1.safetensors' : null,
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
        num_inference_steps: isIdentityAsset
          ? Math.max(28, body.steps ? steps : 28)
          : Math.max(generationRoute.steps, body.steps ? steps : generationRoute.steps),
        guidance_scale: generationRoute.modelFamily === 'flux'
          ? Math.min(3.5, Math.max(isIdentityAsset ? 3.0 : 1, Number(body.cfg || generationRoute.cfg)))
          : Math.min(9, Math.max(3, Number(body.cfg || generationRoute.cfg))),
        sampler_name: generationRoute.modelFamily === 'flux' && body.sampler_name ? samplerName : generationRoute.sampler,
        scheduler: generationRoute.modelFamily === 'flux' && body.scheduler ? scheduler : generationRoute.scheduler,
        clip_skip: generationRoute.clipSkip,
        num_images: effectiveInputImage ? 1 : imageCount,
        seed: seed >= 0 ? seed : undefined,
        input_image: effectiveInputImage,
        denoising_strength: effectiveDenoise,
        ckpt_name: body.ckpt_name || generationRoute.checkpoint || ckpt?.filename,
        model_family: generationRoute.modelFamily,
        lora_name: effectiveLoras.length ? null : loraSan.lora_name,
        lora_strength_model: loraStrength,
        lora_strength_clip: loraStrength,
        loras: effectiveLoras,
        ip_adapter_image: ipAdapterImage,
        ip_adapter_weight: ipAdapterWeight,
        endpoint_id: body.endpoint_id || generationRoute.endpointId || endpointId,
        submit_only: true,
      };
      const result = await runpodClient.generate(generationOptions);

      // If still pending, return job_id for client-side polling
      if (result.pending) {
        return NextResponse.json({
          success: true,
          pending: true,
          job_id: result.job_id,
          endpoint_id: result.endpoint_id || generationOptions.endpoint_id,
          status: result.status || 'IN_QUEUE',
          message: 'Generation in queue. Poll /api/runpod/status?job_id=' + result.job_id,
          generation_trace: {
            category,
            intensity: generationIntensity,
            identitySource: isIdentityAsset ? 'girlfriends_database_live' : girlfriendId ? 'companion_record' : 'manual_prompt',
            identitySnapshot: isIdentityAsset && databaseCompanion ? {
              id: databaseCompanion.id,
              name: databaseCompanion.name,
              age: databaseCompanion.age,
              gender: databaseCompanion.gender,
              hairColor: databaseCompanion.appearance_hair_color,
              hairstyle: databaseCompanion.appearance_hair,
              eyes: databaseCompanion.appearance_eyes,
              body: databaseCompanion.appearance_body,
              race: databaseCompanion.appearance_race,
              style: databaseCompanion.appearance_style,
            } : undefined,
            prompt,
            negative,
            loras: effectiveLoras.length
              ? effectiveLoras
              : loraSan.lora_name
                ? [{ name: loraSan.lora_name, strength_model: loraStrength, strength_clip: loraStrength }]
                : [],
            checkpoint: body.ckpt_name || ckpt?.filename,
            steps,
            cfg: cfgScale,
            sampler: samplerName,
            scheduler: body.scheduler ? scheduler : generationRoute.scheduler,
            referenceDenoise: effectiveDenoise ?? null,
            referencePlan: referencePlan.trace,
            referenceRoles: referencePlan.selected.map((asset) => asset.role),
          },
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
          endpoint_id: body.endpoint_id || generationRoute.endpointId || endpointId,
          ckpt_name: body.ckpt_name || ckpt?.filename || null,
          lora_name: effectiveLoras.length
            ? effectiveLoras.map((item) => item.name).join(',')
            : loraSan.lora_name,
          width,
          height,
          steps,
          cfg: cfgScale,
          seed: seed >= 0 ? seed : null,
          meta: {
            job_id: result.job_id,
            execution_time: result.execution_time,
            asset_role: assetRole,
            reference_role: body.reference_role || 'identity',
            lora_strength: loraStrength,
            loras: effectiveLoras,
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
