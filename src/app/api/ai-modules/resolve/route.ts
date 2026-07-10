import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { loadAiModules, resolveChatCall, resolveImageCall } from '@/lib/ai-modules';
import type { MembershipTier } from '@/lib/ai-modules';

export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-modules/resolve
 * Runtime resolve for chat clients / image UI (auth optional for public defaults).
 * Body: { kind: 'chat'|'image', tier?, intimacyLevel?, message?, locale?, scene? }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthUser(request).catch(() => null);
  const config = await loadAiModules(auth?.client || undefined);

  try {
    const body = await request.json();
    const kind = body.kind || 'chat';

    // Infer tier from profile if logged in
    let tier: MembershipTier = body.tier || 'free';
    if (auth?.user && auth.client && !body.tier) {
      try {
        const { data: profile } = await auth.client
          .from('profiles')
          .select('membership_tier, subscription_tier, plan')
          .eq('id', auth.user.id)
          .maybeSingle();
        const raw =
          profile?.membership_tier ||
          profile?.subscription_tier ||
          profile?.plan ||
          'free';
        const t = String(raw).toLowerCase();
        if (t.includes('unlimit') || t === 'admin') tier = 'unlimited';
        else if (t.includes('pro') || t.includes('plus') || t.includes('premium')) tier = 'pro';
        else tier = 'free';
      } catch {
        /* free */
      }
    }

    if (kind === 'image') {
      const resolved = resolveImageCall(config, {
        scene: body.scene || 'chat_selfie',
        tier,
      });
      return NextResponse.json({
        kind: 'image',
        tier,
        resolved: {
          scene: resolved.scene,
          width: resolved.config.width,
          height: resolved.config.height,
          steps: resolved.config.steps,
          cfg: resolved.config.cfg,
          count: resolved.config.count,
          token_cost: resolved.tokenCost,
          use_consistency_default: resolved.config.use_consistency_default,
          allow_llm_prompt_polish: resolved.config.allow_llm_prompt_polish,
          default_negative: resolved.defaultNegative,
        },
      });
    }

    const resolved = resolveChatCall(config, {
      tier,
      intimacyLevel: Number(body.intimacyLevel || 1),
      message: body.message || '',
      preferNsfw: !!body.preferNsfw,
      locale: body.locale || config.language.default_locale,
    });

    return NextResponse.json({
      kind: 'chat',
      tier,
      resolved: {
        channel: resolved.channel,
        provider: resolved.endpoint.provider,
        model_id: resolved.endpoint.model_id,
        endpoint_id: resolved.endpoint.id,
        label: resolved.endpoint.label,
        temperature: resolved.temperature,
        max_tokens: resolved.maxTokens,
        context_messages: resolved.contextMessages,
        allow_nsfw: resolved.allowNsfw,
        blocked_reason: resolved.blockedReason || null,
        // do not leak api keys
      },
      language: {
        default_locale: config.language.default_locale,
        supported: config.language.supported_locales,
        force_reply_language: config.language.force_reply_language,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Resolve failed' },
      { status: 500 },
    );
  }
}
