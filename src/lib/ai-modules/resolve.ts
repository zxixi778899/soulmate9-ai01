import type { AiModulesConfig, AppLocale, MembershipTier, ModelEndpoint, ResolveChatContext, ResolveImageContext, ResolvedChatCall, ResolvedImageCall } from './types';
import { createDefaultAiModules } from './defaults';

const NSFW_KEYWORDS = /\b(sex|sexy|nude|naked|fuck|cock|pussy|dick|cum|orgasm|blowjob|anal|breast|nipple|horny|moan|undress|make love|bdsm|spank|ride me|strip|lingerie|aroused|climax)\b/i;
const COMPLEX_HINTS = /remember|last time|you promised|relationship|feelings?|why did|story|continue|roleplay|conflict|memory|还记得|上次|答应|感情|心情|继续|剧情|矛盾|覚えて|recuerd|souviens|erinner/i;

export function detectNsfwIntent(message?: string): boolean { return !!message && NSFW_KEYWORDS.test(message); }
export function isGatewayV2Enrolled(userId: string | undefined, tier: MembershipTier, percent: number): boolean {
  if (tier === 'free') return true;
  const safePercent = Math.max(0, Math.min(100, Math.floor(percent)));
  if (safePercent === 100) return true;
  if (!userId || safePercent === 0) return false;
  let hash = 2166136261;
  for (const char of userId) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) % 100 < safePercent;
}
export function scoreChatComplexity(ctx: ResolveChatContext): number {
  const text = ctx.message?.trim() || '';
  let score = text.length > 500 ? 4 : text.length > 180 ? 2 : text.length > 70 ? 1 : 0;
  if (COMPLEX_HINTS.test(text)) score += 3;
  if ((ctx.memoryCount || 0) > 0) score += 2;
  if ((ctx.contextMessageCount || 0) >= 16) score += 1;
  return Math.min(10, score);
}
function tierOf(tier?: MembershipTier): 'free' | 'pro' | 'unlimited' { return tier === 'admin' || tier === 'unlimited' ? 'unlimited' : tier === 'pro' ? 'pro' : 'free'; }
function endpoint(cfg: AiModulesConfig, id?: string | null): ModelEndpoint | null { return id ? cfg.endpoints.find((item) => item.id === id) || null : null; }
function baseUrl(ep: ModelEndpoint): string { return ep.api_base_url || (ep.api_base_env ? process.env[ep.api_base_env] || '' : '') || (ep.provider === 'runpod' ? process.env.RUNPOD_VLLM_URL || '' : ''); }
export function isEndpointConfigured(ep?: ModelEndpoint | null): boolean {
  if (!ep || ep.health_status === 'disabled') return false;
  const key = ep.api_key_env ? process.env[ep.api_key_env] : ep.provider === 'together' ? process.env.TOGETHER_API_KEY : ep.provider === 'runpod' ? process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY : ep.provider === 'openai' ? process.env.OPENAI_API_KEY : '';
  return !!key && (ep.provider !== 'runpod' || !!baseUrl(ep));
}
function ordered(cfg: AiModulesConfig, ids: Array<string | null | undefined>): ModelEndpoint[] {
  const found: ModelEndpoint[] = [];
  for (const id of ids) { const item = endpoint(cfg, id); if (item && !found.some((v) => v.id === item.id)) found.push(item); }
  return found;
}
function choose(cfg: AiModulesConfig, ids: Array<string | null | undefined>): { primary: ModelEndpoint; fallback: ModelEndpoint[] } {
  const candidates = ordered(cfg, ids);
  const ready = candidates.filter(isEndpointConfigured);
  const primary = ready[0] || candidates[0] || cfg.endpoints[0] || createDefaultAiModules().endpoints[0];
  return { primary, fallback: (ready.length ? ready : candidates).filter((item) => item.id !== primary.id) };
}
function estimate(ep: ModelEndpoint, maxTokens: number, message?: string): number { const input = Math.max(1, Math.ceil((message?.length || 0) / 4)); return (input / 1000) * ep.cost_per_1k_input + (maxTokens / 1000) * ep.cost_per_1k_output; }
function resolved(cfg: AiModulesConfig, ctx: ResolveChatContext, ids: Array<string | null | undefined>, channel: 'sfw' | 'nsfw', reason: string, suffix: string, allowNsfw: boolean, blockedReason?: string): ResolvedChatCall {
  const tier = tierOf(ctx.tier); const route = cfg.chat.tiers[tier]; const picked = choose(cfg, ids);
  const maxTokens = Math.min(route.max_tokens, picked.primary.max_tokens || route.max_tokens);
  return { channel, endpoint: picked.primary, fallbackChain: picked.fallback, routeReason: reason, estimatedCost: estimate(picked.primary, maxTokens, ctx.message), qualityTier: picked.primary.quality_tier || (tier === 'free' ? 'economy' : tier === 'pro' ? 'standard' : 'premium'), complexityScore: scoreChatComplexity(ctx), temperature: picked.primary.temperature, maxTokens, contextMessages: route.context_messages, systemLanguageSuffix: suffix, allowNsfw, blockedReason };
}
export function resolveChatCall(input: AiModulesConfig | null | undefined, ctx: ResolveChatContext): ResolvedChatCall {
  const cfg = input || createDefaultAiModules(); const tier = tierOf(ctx.tier); const route = cfg.chat.tiers[tier]; const complexity = scoreChatComplexity(ctx); const threshold = cfg.chat.complexity_threshold ?? 5;
  const locale = (ctx.locale || cfg.language.default_locale) as AppLocale;
  const language = cfg.language.enabled && cfg.language.force_reply_language ? cfg.language.reply_instructions[locale] || cfg.language.reply_instructions[cfg.language.fallback_locale] || '' : '';
  const suffix = [cfg.chat.global_system_suffix, language].filter(Boolean).join('\n');
  const wantsAdult = ctx.preferNsfw === true || (cfg.chat.nsfw_detection === 'keywords' && detectNsfwIntent(ctx.message));
  const fallbackIds = route.fallback_endpoint_ids || [cfg.chat.fallback_endpoint_id];
  const softBudget = route.daily_cost_soft_limit_usd; const overBudget = softBudget !== undefined && (ctx.dailyCostUsd || 0) >= softBudget;
  const rolloutPercent = ctx.rolloutPercent ?? Number(process.env.AI_GATEWAY_V2_ROLLOUT_PERCENT || 10);
  const enrolled = isGatewayV2Enrolled(ctx.userId, ctx.tier, rolloutPercent);
  if (!cfg.chat.enabled) return resolved(cfg, ctx, [cfg.chat.fallback_endpoint_id], 'sfw', 'module_disabled', suffix, false, 'chat_module_disabled');
  if (!enrolled) {
    const controlIds = [route.default_endpoint_id || route.sfw_endpoint_id, ...(route.fallback_endpoint_ids || []), cfg.chat.fallback_endpoint_id];
    if (wantsAdult) return resolved(cfg, ctx, controlIds, 'sfw', 'v1_control_adult_downgrade', suffix + '\nKeep the reply romantic and suggestive, but fade to black.', false, 'v2_rollout_control');
    return resolved(cfg, ctx, controlIds, 'sfw', 'v1_control_group', suffix, false, 'v2_rollout_control');
  }
  if (wantsAdult) {
    if (!route.allow_nsfw || !route.nsfw_endpoint_id) return resolved(cfg, ctx, [route.default_endpoint_id || route.sfw_endpoint_id, ...fallbackIds], 'sfw', 'nsfw_tier_downgrade', `${suffix}\nKeep the reply romantic and suggestive, but fade to black.`, false, 'tier_no_nsfw');
    if ((ctx.intimacyLevel || 1) < cfg.chat.nsfw_min_intimacy) return resolved(cfg, ctx, [route.default_endpoint_id || route.sfw_endpoint_id, ...fallbackIds], 'sfw', 'nsfw_intimacy_downgrade', `${suffix}\nKeep the reply teasing but not explicit until intimacy unlocks.`, false, 'intimacy_locked');
    if (ctx.adultCharacterVerified === false) return resolved(cfg, ctx, [route.default_endpoint_id || route.sfw_endpoint_id, ...fallbackIds], 'sfw', 'adult_verification_failed', suffix, false, 'adult_character_not_verified');
    return resolved(cfg, ctx, [route.nsfw_endpoint_id, ...fallbackIds], 'nsfw', 'adult_isolated_runpod', suffix, true);
  }
  const preferred = overBudget ? route.default_endpoint_id || route.sfw_endpoint_id : complexity >= threshold ? route.complex_endpoint_id || route.sfw_endpoint_id : route.default_endpoint_id || route.sfw_endpoint_id;
  return resolved(cfg, ctx, [preferred, ...fallbackIds, cfg.chat.fallback_endpoint_id], 'sfw', overBudget ? 'daily_cost_soft_limit_downgrade' : complexity >= threshold ? 'complex_or_memory_upgrade' : 'standard_chat', suffix, route.allow_nsfw);
}
export function resolveImageCall(input: AiModulesConfig | null | undefined, ctx: ResolveImageContext): ResolvedImageCall {
  const cfg = input || createDefaultAiModules(); const tier = tierOf(ctx.tier); const scene = ctx.scene in cfg.image.scenes ? ctx.scene : 'girlfriend_portrait'; const item = cfg.image.scenes[scene];
  const logicalEndpointId = ctx.adult && tier !== 'free' ? item.adult_endpoint_ids?.[tier as 'pro' | 'unlimited'] || item.tier_endpoint_ids?.[tier] || item.endpoint_id : item.tier_endpoint_ids?.[tier] || item.endpoint_id;
  const runpodEndpointEnv = cfg.image.scene_endpoint_env?.[scene] || cfg.image.runpod_endpoint_env || 'RUNPOD_ENDPOINT_ID'; const runpodApiKeyEnv = cfg.image.runpod_api_key_env || 'RUNPOD_API_KEY';
  const endpointId = process.env[runpodEndpointEnv] || process.env.RUNPOD_ENDPOINT_ID || ''; const apiKeyPresent = !!(process.env[runpodApiKeyEnv] || process.env.RUNPOD_API_KEY || process.env.RUNPOD_COMFYUI_API_KEY);
  const daily = item.daily_limit_override ?? (tier === 'unlimited' ? cfg.image.unlimited_daily_images : tier === 'pro' ? cfg.image.pro_daily_images : cfg.image.free_daily_images);
  let blockedReason: string | undefined; if (!cfg.image.enabled) blockedReason = 'image_module_disabled'; else if (ctx.adult && tier === 'free') blockedReason = 'tier_no_adult_images'; else if (!apiKeyPresent || !endpointId) blockedReason = 'runpod_not_configured';
  return { scene, config: item, runpodEndpointEnv, runpodApiKeyEnv, defaultNegative: cfg.image.default_negative, tokenCost: item.token_cost, endpointId, logicalEndpointId, fallbackChain: item.fallback_endpoint_ids || [], routeReason: ctx.adult ? 'adult_isolated_runpod' : tier === 'free' ? 'free_economy_image' : tier === 'pro' ? 'pro_consistent_image' : 'unlimited_premium_image', estimatedCost: tier === 'free' ? 0.003 : tier === 'pro' ? 0.015 : 0.04, qualityTier: tier === 'free' ? 'economy' : tier === 'pro' ? (item.quality_tier || 'standard') : 'premium', referenceMode: item.reference_mode || (tier === 'free' ? 'single' : 'multi'), maxReferences: tier === 'free' ? 1 : Math.min(3, item.max_references ?? 3), apiKeyPresent, dailyLimit: daily, enabled: cfg.image.enabled && !blockedReason, blockedReason };
}
export function resolveImageDailyLimit(cfg: AiModulesConfig | null | undefined, tier: MembershipTier, scene?: keyof AiModulesConfig['image']['scenes']): number | null { return resolveImageCall(cfg, { scene: scene || 'chat_selfie', tier }).dailyLimit; }
export function getLanguageInstruction(cfg: AiModulesConfig | null | undefined, locale?: string): string { const c = cfg || createDefaultAiModules(); if (!c.language.enabled || !c.language.force_reply_language) return ''; const loc = (locale || c.language.default_locale) as AppLocale; return c.language.reply_instructions[loc] || c.language.reply_instructions[c.language.fallback_locale] || ''; }
export function listEndpointsByCapability(cfg: AiModulesConfig, nsfwOnly?: boolean): ModelEndpoint[] { return cfg.endpoints.filter((item) => nsfwOnly ? item.nsfw_capable : true); }