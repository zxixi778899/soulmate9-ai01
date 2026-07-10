import type {
  AiModulesConfig,
  AppLocale,
  MembershipTier,
  ModelEndpoint,
  ResolveChatContext,
  ResolveImageContext,
  ResolvedChatCall,
  ResolvedImageCall,
} from './types';
import { createDefaultAiModules } from './defaults';

const NSFW_KEYWORDS =
  /\b(sex|sexy|nude|naked|fuck|cock|pussy|dick|cum|orgasm|blowjob|handjob|anal|boob|breast|nipple|horny|moan|kiss me hard|undress|make love|bed with me|wet|threesome|bdsm|spank|ride me)\b/i;

export function detectNsfwIntent(message?: string): boolean {
  if (!message) return false;
  return NSFW_KEYWORDS.test(message);
}

function findEndpoint(cfg: AiModulesConfig, id: string | null | undefined): ModelEndpoint | null {
  if (!id) return null;
  return cfg.endpoints.find((e) => e.id === id) || null;
}

function normalizeTier(tier?: MembershipTier): 'free' | 'pro' | 'unlimited' {
  if (tier === 'admin' || tier === 'unlimited') return 'unlimited';
  if (tier === 'pro') return 'pro';
  return 'free';
}

/**
 * Resolve which chat model/channel to use for a request.
 */
export function resolveChatCall(
  cfg: AiModulesConfig | null | undefined,
  ctx: ResolveChatContext,
): ResolvedChatCall {
  const config = cfg || createDefaultAiModules();
  const tier = normalizeTier(ctx.tier);
  const route = config.chat.tiers[tier];
  const fallback =
    findEndpoint(config, config.chat.fallback_endpoint_id) ||
    config.endpoints[0] ||
    createDefaultAiModules().endpoints[0];

  const locale = (ctx.locale || config.language.default_locale) as AppLocale;
  const langHint =
    config.language.enabled && config.language.force_reply_language
      ? config.language.reply_instructions[locale] ||
        config.language.reply_instructions[config.language.fallback_locale] ||
        ''
      : '';

  const systemLanguageSuffix = [config.chat.global_system_suffix, langHint]
    .filter(Boolean)
    .join('\n');

  if (!config.chat.enabled) {
    return {
      channel: 'sfw',
      endpoint: fallback,
      temperature: fallback.temperature,
      maxTokens: route.max_tokens,
      contextMessages: route.context_messages,
      systemLanguageSuffix,
      allowNsfw: false,
      blockedReason: 'chat_module_disabled',
    };
  }

  const wantsNsfw =
    ctx.preferNsfw === true ||
    (config.chat.nsfw_detection === 'keywords' && detectNsfwIntent(ctx.message));

  const intimacy = ctx.intimacyLevel ?? 1;
  const intimacyOk = intimacy >= (config.chat.nsfw_min_intimacy || 4);

  if (wantsNsfw) {
    if (!route.allow_nsfw || !route.nsfw_endpoint_id) {
      return {
        channel: 'sfw',
        endpoint: findEndpoint(config, route.sfw_endpoint_id) || fallback,
        temperature: (findEndpoint(config, route.sfw_endpoint_id) || fallback).temperature,
        maxTokens: route.max_tokens,
        contextMessages: route.context_messages,
        systemLanguageSuffix:
          systemLanguageSuffix +
          '\n[SYSTEM] User requested intimate content but their plan does not allow NSFW. Stay flirty but fade-to-black; gently invite upgrade if appropriate.',
        allowNsfw: false,
        blockedReason: 'tier_no_nsfw',
      };
    }
    if (!intimacyOk) {
      const ep = findEndpoint(config, route.sfw_endpoint_id) || fallback;
      return {
        channel: 'sfw',
        endpoint: ep,
        temperature: ep.temperature,
        maxTokens: route.max_tokens,
        contextMessages: route.context_messages,
        systemLanguageSuffix:
          systemLanguageSuffix +
          `\n[SYSTEM] Intimacy level ${intimacy} is below NSFW unlock (${config.chat.nsfw_min_intimacy}). Keep chemistry but do not go fully explicit yet.`,
        allowNsfw: false,
        blockedReason: 'intimacy_locked',
      };
    }
    const nsfwEp = findEndpoint(config, route.nsfw_endpoint_id);
    if (nsfwEp?.nsfw_capable) {
      return {
        channel: 'nsfw',
        endpoint: nsfwEp,
        temperature: nsfwEp.temperature,
        maxTokens: Math.min(route.max_tokens, nsfwEp.max_tokens || route.max_tokens),
        contextMessages: route.context_messages,
        systemLanguageSuffix,
        allowNsfw: true,
      };
    }
  }

  const sfwEp = findEndpoint(config, route.sfw_endpoint_id) || fallback;
  return {
    channel: 'sfw',
    endpoint: sfwEp,
    temperature: sfwEp.temperature,
    maxTokens: Math.min(route.max_tokens, sfwEp.max_tokens || route.max_tokens),
    contextMessages: route.context_messages,
    systemLanguageSuffix,
    allowNsfw: route.allow_nsfw,
  };
}

export function resolveImageCall(
  cfg: AiModulesConfig | null | undefined,
  ctx: ResolveImageContext,
): ResolvedImageCall {
  const config = cfg || createDefaultAiModules();
  const sceneCfg = config.image.scenes[ctx.scene] || config.image.scenes.girlfriend_portrait;
  return {
    scene: ctx.scene,
    config: sceneCfg,
    runpodEndpointEnv: config.image.runpod_endpoint_env,
    runpodApiKeyEnv: config.image.runpod_api_key_env,
    defaultNegative: config.image.default_negative,
    tokenCost: sceneCfg.token_cost,
  };
}

export function getLanguageInstruction(
  cfg: AiModulesConfig | null | undefined,
  locale?: string,
): string {
  const config = cfg || createDefaultAiModules();
  if (!config.language.enabled || !config.language.force_reply_language) return '';
  const loc = (locale || config.language.default_locale) as AppLocale;
  return (
    config.language.reply_instructions[loc] ||
    config.language.reply_instructions[config.language.fallback_locale] ||
    ''
  );
}

export function listEndpointsByCapability(cfg: AiModulesConfig, nsfwOnly?: boolean): ModelEndpoint[] {
  return cfg.endpoints.filter((e) => (nsfwOnly ? e.nsfw_capable : true));
}
