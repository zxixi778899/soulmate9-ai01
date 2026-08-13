/**
 * Hidden image prompt engine.
 *
 * Builds the FLUX/Comfy generation prompt from:
 *   - intimacy level (1-5) + SFW/NSFW channel determination
 *   - the current chat context + user request
 *   - the girlfriend's identity sheet (character consistency)
 *
 * The prompt-crafting LLM is routed by content: SFW turns use SFW-capable
 * models, NSFW turns use NSFW-capable (RunPod / OpenRouter) models. The final
 * prompt is only persisted for audit, never returned to the browser.
 */

import type {
  AiModulesConfig,
  MembershipTier,
  ModelEndpoint,
} from '@/lib/ai-modules/types';
import { invokeChat } from '@/lib/ai-modules/invoke';
import { isEndpointConfigured } from '@/lib/ai-modules/resolve';
import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import { compactFluxPrompt } from '@/lib/comfy-console/studio-profile';
import type { ChatContextLine } from '@/lib/chat-image-intent';
import {
  buildSceneCastPrompt,
  type ImageSceneSemantics,
} from '@/lib/image-scene-semantics';
import type { IntimacyGenerationPolicy } from '@/lib/intimacy-policy';
import { logger } from '@/lib/logger';

export type ImagePromptChannel = 'sfw' | 'nsfw';

export type ImagePromptLlmResult = {
  prompt: string;
  usedLlm: boolean;
  channel: ImagePromptChannel;
  endpointId: string | null;
  modelId: string | null;
  provider: string | null;
  reason: string;
};

/** Terms that must never appear in an SFW prompt. */
const SFW_FORBIDDEN =
  /\b(nude|naked|topless|bottomless|explicit|pussy|penis|cock|vagina|bare breasts|genitals)\b/gi;

/** Adult intent hints drawn from the request + recent chat context. */
const INTENT_ADULT_RE =
  /nude|naked|undress|strip|nsfw|explicit|sex|sexy|lingerie|topless|bottomless|masturbat|orgasm|erotic|horny|breast|nipple|thong|bikini|撩|裸体|脱光|内衣|色情|自慰|高潮|性爱|乳头|乳房|一丝不挂/i;

/**
 * Decide the prompt channel from intimacy + the actual request/context.
 * Intimacy level directly drives the NSFW intensity: levels 1-2 stay SFW,
 * levels 3-5 unlock NSFW. adultMention is returned for diagnostics/safety.
 */
export function resolveImagePromptChannel(input: {
  intimacyPolicy: IntimacyGenerationPolicy;
  userRequest: string;
  chatContext?: ChatContextLine[];
}): { channel: ImagePromptChannel; nsfwIntensity: NsfwIntensity; adultMention: boolean } {
  const { adultAllowed, nsfwIntensity } = input.intimacyPolicy;
  // Intimacy level directly determines the NSFW channel: levels 1–2 stay SFW,
  // levels 3–5 unlock the NSFW channel so the image matches the relationship.
  // Explicit adult language is returned for diagnostics / safety.
  const blob = `${input.userRequest || ''} ${(input.chatContext || [])
    .map((line) => line.content)
    .join(' ')}`.slice(0, 2000);
  const adultMention = INTENT_ADULT_RE.test(blob);
  return {
    channel: adultAllowed ? 'nsfw' : 'sfw',
    nsfwIntensity: nsfwIntensity as NsfwIntensity,
    adultMention,
  };
}

/** Compact identity sheet so the LLM never drifts away from the character. */
export function buildIdentitySheet(
  gf: Record<string, unknown>,
  _category: CompanionCategory,
  renderStyle: AnimeRenderStyle,
): string {
  const card =
    gf.character_card && typeof gf.character_card === 'object'
      ? (gf.character_card as Record<string, unknown>)
      : {};
  const appearance =
    card.appearance && typeof card.appearance === 'object'
      ? (card.appearance as Record<string, unknown>)
      : {};
  const parts: string[] = [];
  const name = String(gf.name || card.name || 'her').trim();
  parts.push(`Name: ${name}`);
  if (gf.age) parts.push(`Age: ${String(gf.age)}`);
  const ethnicity = String(gf.ethnicity || gf.appearance_race || appearance.race || '').trim();
  if (ethnicity) parts.push(`Ethnicity: ${ethnicity}`);
  const hair = [gf.appearance_hair_color, gf.appearance_hair]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .trim();
  if (hair) parts.push(`Hair: ${hair}`);
  if (gf.appearance_eyes) parts.push(`Eyes: ${String(gf.appearance_eyes)}`);
  if (gf.appearance_face) parts.push(`Face: ${String(gf.appearance_face)}`);
  if (gf.appearance_body) parts.push(`Body: ${String(gf.appearance_body)}`);
  if (gf.appearance_skin) parts.push(`Skin: ${String(gf.appearance_skin)}`);
  if (gf.appearance_style) parts.push(`Style: ${String(gf.appearance_style)}`);
  if (gf.distinguishing_features)
    parts.push(`Distinguishing features: ${String(gf.distinguishing_features)}`);
  const cardOutfit =
    card.outfit && typeof card.outfit === 'object'
      ? (card.outfit as Record<string, unknown>).name
      : '';
  const outfit = String(
    gf.equipped_outfit_name || cardOutfit || appearance.outfit || appearance.clothing || '',
  ).trim();
  if (outfit) parts.push(`Outfit: ${outfit}`);
  const style =
    renderStyle === '2d'
      ? '2D anime key visual'
      : renderStyle === '3d'
        ? '3D animated film frame'
        : 'photorealistic editorial photo';
  parts.push(`Render style: ${style}`);
  return parts.filter(Boolean).join('\n');
}

function isChatLlm(ep: ModelEndpoint): boolean {
  return ep.max_tokens > 0 && !/^flux|^sdxl|^pony|^illustrious/i.test(ep.model_id);
}

/**
 * Content-based LLM routing: NSFW prompts use uncensored models
 * (RunPod / OpenRouter), SFW prompts use the quality SFW model.
 */
export function pickImagePromptEndpoint(
  aiModules: AiModulesConfig,
  channel: ImagePromptChannel,
): { primary: ModelEndpoint | null; fallback: ModelEndpoint[] } {
  const all = (aiModules.endpoints || []).filter(isChatLlm);
  const ready = all.filter(isEndpointConfigured);
  const pool = ready.length ? ready : all;
  const byPriority = (list: ModelEndpoint[]) =>
    [...list].sort(
      (a, b) => (a.priority ?? 99) - (b.priority ?? 99) || a.cost_per_1k_input - b.cost_per_1k_input,
    );
  if (channel === 'nsfw') {
    const nsfw = byPriority(pool.filter((ep) => ep.nsfw_capable));
    const primary = nsfw[0] || null;
    const fallback = byPriority([...nsfw.slice(1), ...pool.filter((ep) => !nsfw.includes(ep))]);
    return { primary, fallback };
  }
  const sfw = byPriority(pool.filter((ep) => !ep.nsfw_capable));
  return { primary: sfw[0] || null, fallback: sfw.slice(1) };
}

function channelBoundary(input: {
  channel: ImagePromptChannel;
  intensity: NsfwIntensity;
  intimacyPolicy: IntimacyGenerationPolicy;
}): string {
  if (input.channel === 'nsfw') {
    return (
      `Consensual adult content is unlocked (intimacy level ${input.intimacyPolicy.level}). ` +
      `${input.intimacyPolicy.sceneDirection} ` +
      'All characters are adults 25+. Keep the scene consensual and anatomically coherent.'
    );
  }
  return input.intensity >= 2
    ? 'SFW with sensual lingerie styling: lingerie/nightwear allowed, nipples and genitals stay covered, no sexual act.'
    : 'SFW: fully clothed, flirtatious, no nudity, no exposed skin beyond a normal outfit.';
}

export function buildImagePromptMessages(input: {
  channel: ImagePromptChannel;
  intensity: NsfwIntensity;
  intimacyPolicy: IntimacyGenerationPolicy;
  identitySheet: string;
  userRequest: string;
  chatContext?: ChatContextLine[];
  sceneSemantics: ImageSceneSemantics;
  moodTag?: string;
  poseTag?: string;
  envTag?: string;
}): Array<{ role: 'system' | 'user'; content: string }> {
  const ctx =
    (input.chatContext || [])
      .slice(-6)
      .map((line) => `${line.role === 'assistant' ? 'She' : 'He'}: ${line.content.slice(0, 240)}`)
      .join('\n') || '(conversation just started)';
  const boundary = channelBoundary(input);
  const system = [
    'You are the prompt engineer for a companion portrait generator (FLUX-based).',
    'Your ONLY output is ONE English image prompt: a single paragraph of comma-separated descriptive clauses (subject, pose, outfit, scene, lighting, mood, framing).',
    'NEVER output markdown fences, labels, explanations, or anything but the prompt itself.',
    '',
    'HARD CONSTRAINTS:',
    '- The person in the image MUST be the exact same woman described in CHARACTER below. Never change her face, hair, eyes, body, skin, or style.',
    '- The CONTENT BOUNDARY is absolute; never write anything past it.',
    '- Do not add generic quality boilerplate (masterpiece / best quality are added automatically).',
  ].join('\n');
  const user = [
    'CHARACTER (identity must stay identical):',
    input.identitySheet,
    '',
    'CONTENT BOUNDARY:',
    boundary,
    '',
    'RECENT CONVERSATION:',
    ctx,
    '',
    `USER REQUEST: ${input.userRequest.slice(0, 500)}`,
    ...(input.moodTag ? [`MOOD: ${input.moodTag}`] : []),
    ...(input.poseTag ? [`POSE: ${input.poseTag}`] : []),
    ...(input.envTag ? [`ENVIRONMENT: ${input.envTag}`] : []),
    '',
    'SCENE SEMANTICS:',
    buildSceneCastPrompt(input.sceneSemantics),
    '',
    'OUTPUT: the image prompt now.',
  ].join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

export function sanitizeLlmPrompt(raw: string): string {
  let t = String(raw || '').replace(/```[a-z]*\n?/gi, '').trim();
  t = t.replace(/^["'“”‘’]|["'“”‘’]$/g, '').trim();
  t = t.replace(/^(here(?:'s| is)(?: the| your)?(?: image| prompt)?:?\s*)/i, '').trim();
  t = t
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .join(', ');
  t = t.replace(/\s*,\s*/g, ', ').replace(/[ \t]{2,}/g, ' ').trim();
  if (t.length < 25) return '';
  if (t.length > 700) t = t.slice(0, 700).replace(/,\s*[^,]*$/, '').trim();
  return t;
}

export async function generateImagePromptWithLlm(input: {
  aiModules: AiModulesConfig;
  channel: ImagePromptChannel;
  intensity: NsfwIntensity;
  intimacyPolicy: IntimacyGenerationPolicy;
  gf: Record<string, unknown>;
  category: CompanionCategory;
  renderStyle: AnimeRenderStyle;
  userRequest: string;
  chatContext?: ChatContextLine[];
  sceneSemantics: ImageSceneSemantics;
  moodTag?: string;
  poseTag?: string;
  envTag?: string;
  tier?: MembershipTier;
  userId?: string;
  girlfriendId?: string;
  timeoutMs?: number;
}): Promise<ImagePromptLlmResult> {
  const empty: ImagePromptLlmResult = {
    prompt: '',
    usedLlm: false,
    channel: input.channel,
    endpointId: null,
    modelId: null,
    provider: null,
    reason: 'llm_prompt_failed',
  };
  const picked = pickImagePromptEndpoint(input.aiModules, input.channel);
  if (!picked.primary) return { ...empty, reason: 'no_prompt_llm_configured' };
  const identitySheet = buildIdentitySheet(input.gf, input.category, input.renderStyle);
  const messages = buildImagePromptMessages({
    channel: input.channel,
    intensity: input.intensity,
    intimacyPolicy: input.intimacyPolicy,
    identitySheet,
    userRequest: input.userRequest,
    chatContext: input.chatContext,
    sceneSemantics: input.sceneSemantics,
    moodTag: input.moodTag,
    poseTag: input.poseTag,
    envTag: input.envTag,
  });
  const started = Date.now();
  try {
    const result = await Promise.race([
      invokeChat({
        endpoint: picked.primary,
        fallbackEndpoints: picked.fallback,
        messages,
        temperature: 0.8,
        maxTokens: Math.min(320, picked.primary.max_tokens || 320),
        userId: input.userId,
        girlfriendId: input.girlfriendId,
        taskType: 'image_prompt',
        membershipTier: input.tier,
        scene: 'chat_selfie',
        routeReason: input.channel === 'nsfw' ? 'nsfw_prompt_llm' : 'sfw_prompt_llm',
      }),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('image_prompt_timeout')), input.timeoutMs ?? 15_000),
      ),
    ]);
    let prompt = sanitizeLlmPrompt(result.content);
    if (input.channel === 'sfw') {
      prompt = prompt.replace(SFW_FORBIDDEN, '').replace(/\s{2,}/g, ' ').trim();
    }
    if (!prompt) return { ...empty, reason: 'llm_prompt_empty' };
    return {
      prompt: compactFluxPrompt(prompt, 500),
      usedLlm: true,
      channel: input.channel,
      endpointId: result.endpoint_id,
      modelId: result.model,
      provider: result.provider,
      reason: 'llm_prompt_success',
    };
  } catch (error) {
    logger.warn('[image-prompt-llm] LLM prompt generation failed, using deterministic fallback', {
      channel: input.channel,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    });
    return empty;
  }
}
