import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import {
  createDefaultAiModules,
  loadAiModules,
  saveAiModules,
  invalidateAiModulesCache,
  resolveChatCall,
  resolveImageCall,
  type AiModulesConfig,
  type MembershipTier,
} from '@/lib/ai-modules';
import { logger } from '@/lib/logger';


function envPresent(name: string | null | undefined): boolean {
  if (!name) return false;
  return !!(process.env[name] && String(process.env[name]).length > 0);
}

function buildEnvStatus(config: AiModulesConfig) {
  const endpointEnvs = Array.from(
    new Set(
      config.endpoints
        .map((e) => e.api_key_env)
        .filter((x): x is string => !!x),
    ),
  );
  const keys: Record<string, boolean> = {};
  for (const k of endpointEnvs) keys[k] = envPresent(k);
  keys[config.image.runpod_api_key_env] = envPresent(config.image.runpod_api_key_env);
  keys[config.image.runpod_endpoint_env] = envPresent(config.image.runpod_endpoint_env);
  keys.RUNPOD_API_KEY = envPresent('RUNPOD_API_KEY');
  keys.RUNPOD_ENDPOINT_ID = envPresent('RUNPOD_ENDPOINT_ID');
  keys.RUNPOD_VLLM_URL = envPresent('RUNPOD_VLLM_URL');
  keys.RUNPOD_VLLM_API_KEY = envPresent('RUNPOD_VLLM_API_KEY');
  keys.TOGETHER_API_KEY = envPresent('TOGETHER_API_KEY');

  const chatReady = {
    free_sfw: !!config.endpoints.find((e) => e.id === config.chat.tiers.free.sfw_endpoint_id),
    pro_nsfw: !!(
      config.chat.tiers.pro.allow_nsfw &&
      config.endpoints.find((e) => e.id === config.chat.tiers.pro.nsfw_endpoint_id)
    ),
    together: keys.TOGETHER_API_KEY,
    runpod_vllm: keys.RUNPOD_VLLM_URL && (keys.RUNPOD_VLLM_API_KEY || keys.RUNPOD_API_KEY),
  };
  const imageReady =
    keys[config.image.runpod_api_key_env] || keys.RUNPOD_API_KEY
      ? keys[config.image.runpod_endpoint_env] || keys.RUNPOD_ENDPOINT_ID
      : false;

  return {
    keys,
    chatReady,
    imageReady: !!imageReady && config.image.enabled,
    warnings: [
      !keys.TOGETHER_API_KEY ? '缺少 TOGETHER_API_KEY：Free/Pro SFW 聊天可能失败' : null,
      !(keys.RUNPOD_VLLM_URL && (keys.RUNPOD_VLLM_API_KEY || keys.RUNPOD_API_KEY))
        ? '缺少 RUNPOD_VLLM_URL / API key：NSFW 自建 LLM 不可用'
        : null,
      !imageReady ? '缺少 RunPod 出图 Endpoint/Key：生图会 503' : null,
    ].filter(Boolean),
  };
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/ai-modules
 *   ?preview=1&tier=pro&message=hi&intimacy=4&scene=chat_selfie
 * Returns full module config + optional resolve preview.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin.error) return admin.error;

  try {
    const config = await loadAiModules(admin.supabase);
    const { searchParams } = new URL(request.url);

        const payload: Record<string, unknown> = {
      config,
      scheme: {
        summary:
          'Chat: Free→8B SFW · Pro→70B SFW + Lumimaid NSFW · Unlimited→Noromaid. Image: FLUX scenes with token costs. Language: force reply locale.',
        channels: ['sfw', 'nsfw'],
        scenes: Object.keys(config.image.scenes),
      },
      env: buildEnvStatus(config),
    };

    if (searchParams.get('preview') === '1') {
      const tier = (searchParams.get('tier') || 'pro') as MembershipTier;
      const message = searchParams.get('message') || '';
      const intimacy = Number(searchParams.get('intimacy') || 4);
      const locale = searchParams.get('locale') || config.language.default_locale;
      const scene = (searchParams.get('scene') || 'chat_selfie') as keyof typeof config.image.scenes;

      payload.preview = {
        chat: resolveChatCall(config, {
          tier,
          message,
          intimacyLevel: intimacy,
          locale,
        }),
        image: resolveImageCall(config, { scene, tier }),
      };
    }

    return NextResponse.json(payload);
  } catch (e) {
    logger.error('admin/ai-modules GET', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Load failed' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/ai-modules
 * Body: partial AiModulesConfig or { config: AiModulesConfig, replace?: boolean }
 */
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json();
    const current = await loadAiModules(admin.supabase);

    let next: AiModulesConfig;
    if (body.replace && body.config) {
      next = body.config as AiModulesConfig;
    } else {
      const patch = (body.config || body) as Partial<AiModulesConfig>;
      next = mergeConfig(current, patch);
    }

    // Validate endpoint refs + NSFW capability
    const ids = new Set(next.endpoints.map((e) => e.id));
    const byId = new Map(next.endpoints.map((e) => [e.id, e]));
    if (!next.endpoints.length) {
      return NextResponse.json({ error: 'endpoints cannot be empty' }, { status: 400 });
    }
    if (!ids.has(next.chat.fallback_endpoint_id)) {
      return NextResponse.json(
        { error: `chat.fallback_endpoint_id not found: ${next.chat.fallback_endpoint_id}` },
        { status: 400 },
      );
    }
    for (const t of ['free', 'pro', 'unlimited'] as const) {
      const r = next.chat.tiers[t];
      if (!ids.has(r.sfw_endpoint_id)) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.sfw_endpoint_id not found: ${r.sfw_endpoint_id}` },
          { status: 400 },
        );
      }
      if (r.nsfw_endpoint_id) {
        if (!ids.has(r.nsfw_endpoint_id)) {
          return NextResponse.json(
            { error: `chat.tiers.${t}.nsfw_endpoint_id not found: ${r.nsfw_endpoint_id}` },
            { status: 400 },
          );
        }
        const nsfwEp = byId.get(r.nsfw_endpoint_id);
        if (r.allow_nsfw && nsfwEp && !nsfwEp.nsfw_capable) {
          return NextResponse.json(
            {
              error: `chat.tiers.${t}.nsfw_endpoint_id must be nsfw_capable: ${r.nsfw_endpoint_id}`,
            },
            { status: 400 },
          );
        }
      }
      if (r.allow_nsfw && !r.nsfw_endpoint_id) {
        return NextResponse.json(
          { error: `chat.tiers.${t}: allow_nsfw=true requires nsfw_endpoint_id` },
          { status: 400 },
        );
      }
      if (r.max_tokens < 64 || r.max_tokens > 8192) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.max_tokens out of range (64-8192)` },
          { status: 400 },
        );
      }
      if (r.context_messages < 2 || r.context_messages > 80) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.context_messages out of range (2-80)` },
          { status: 400 },
        );
      }
    }
    for (const [scene, sc] of Object.entries(next.image.scenes)) {
      if (sc.width < 256 || sc.height < 256 || sc.width > 2048 || sc.height > 2048) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: width/height must be 256-2048` },
          { status: 400 },
        );
      }
      if (sc.steps < 4 || sc.steps > 60) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: steps must be 4-60` },
          { status: 400 },
        );
      }
      if (sc.cfg < 1 || sc.cfg > 3.5) {
        return NextResponse.json(
          { error: `image.scenes.${scene}: cfg must be 1.0-3.5 for FLUX` },
          { status: 400 },
        );
      }
    }

    const { source } = await saveAiModules(next, admin.supabase);
    invalidateAiModulesCache();

    return NextResponse.json({ success: true, source, config: next, env: buildEnvStatus(next) });
  } catch (e) {
    logger.error('admin/ai-modules PATCH', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Save failed' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/ai-modules
 * Body: { action: 'reset' | 'seed_models' }
 * reset → factory defaults
 * seed_models → upsert endpoints into ai_model_configs table
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || 'reset';

    if (action === 'reset') {
      const defaults = createDefaultAiModules();
      const { source } = await saveAiModules(defaults, admin.supabase);
      invalidateAiModulesCache();
      return NextResponse.json({ success: true, action: 'reset', source, config: defaults });
    }

    if (action === 'seed_models') {
      const config = await loadAiModules(admin.supabase);
      const rows = config.endpoints
        .filter((e) => e.provider !== 'runpod' || e.model_id.includes('llama') || e.max_tokens > 0)
        .map((e, i) => ({
          provider: e.provider,
          model_id: e.model_id,
          display_name: e.label,
          task_type: e.nsfw_capable ? 'nsfw_chat' : e.id.includes('emotion') ? 'emotion' : 'chat',
          is_active: true,
          api_base_url: e.api_base_url || null,
          api_key_env: e.api_key_env || null,
          temperature: e.temperature,
          max_tokens: e.max_tokens || 1024,
          cost_per_1k_input: e.cost_per_1k_input,
          cost_per_1k_output: e.cost_per_1k_output,
          priority: 100 - i * 10,
          nsfw_capable: e.nsfw_capable,
          min_tier: e.nsfw_capable ? 'pro' : 'free',
          notes: e.notes || `seeded from ai_modules:${e.id}`,
        }));

      let inserted = 0;
      for (const row of rows) {
        try {
          const { error } = await admin.supabase.from('ai_model_configs').upsert(row, {
            onConflict: 'provider,model_id',
            ignoreDuplicates: false,
          });
          // if unique constraint different, try insert only
          if (error) {
            const ins = await admin.supabase.from('ai_model_configs').insert(row);
            if (!ins.error) inserted++;
          } else {
            inserted++;
          }
        } catch {
          /* skip */
        }
      }

      return NextResponse.json({
        success: true,
        action: 'seed_models',
        attempted: rows.length,
        inserted,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    logger.error('admin/ai-modules POST', { e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Action failed' },
      { status: 500 },
    );
  }
}

function mergeConfig(base: AiModulesConfig, patch: Partial<AiModulesConfig>): AiModulesConfig {
  const next = { ...base, ...patch } as AiModulesConfig;
  if (patch.endpoints) next.endpoints = patch.endpoints;
  if (patch.chat) {
    next.chat = {
      ...base.chat,
      ...patch.chat,
      tiers: {
        free: { ...base.chat.tiers.free, ...(patch.chat.tiers?.free || {}) },
        pro: { ...base.chat.tiers.pro, ...(patch.chat.tiers?.pro || {}) },
        unlimited: { ...base.chat.tiers.unlimited, ...(patch.chat.tiers?.unlimited || {}) },
      },
    };
  }
  if (patch.image) {
    next.image = {
      ...base.image,
      ...patch.image,
      scenes: {
        ...base.image.scenes,
        ...(patch.image.scenes || {}),
      },
    };
  }
  if (patch.language) {
    next.language = {
      ...base.language,
      ...patch.language,
      reply_instructions: {
        ...base.language.reply_instructions,
        ...(patch.language.reply_instructions || {}),
      },
    };
  }
  return next;
}
