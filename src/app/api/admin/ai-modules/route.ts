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

    // Validate endpoint refs
    const ids = new Set(next.endpoints.map((e) => e.id));
    for (const t of ['free', 'pro', 'unlimited'] as const) {
      const r = next.chat.tiers[t];
      if (!ids.has(r.sfw_endpoint_id)) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.sfw_endpoint_id not found: ${r.sfw_endpoint_id}` },
          { status: 400 },
        );
      }
      if (r.nsfw_endpoint_id && !ids.has(r.nsfw_endpoint_id)) {
        return NextResponse.json(
          { error: `chat.tiers.${t}.nsfw_endpoint_id not found: ${r.nsfw_endpoint_id}` },
          { status: 400 },
        );
      }
    }

    const { source } = await saveAiModules(next, admin.supabase);
    invalidateAiModulesCache();

    return NextResponse.json({ success: true, source, config: next });
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
