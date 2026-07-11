/**
 * LoRA prompt injection — works with any vLLM/Ollama endpoint that
 * doesn't expose per-request LoRA selection.
 *
 * Strategy: bake the "LoRA intent" into the system prompt as a
 * marker token + style guide. The model (Lumimaid / NousResearch / etc.)
 * has been trained with these markers; the LoRA trigger phrase activates
 * the persona even when only one base checkpoint is loaded.
 *
 * For vLLM OpenAI server with --enable-lora, pass the lora_name via
 * extra_body so the server-side LoRA hot-loads.
 */

export type LoreMode = 'default' | 'rp' | 'nsfw';

const TRIGGERS: Record<LoreMode, string> = {
  default: '',
  rp: '<<SYS_LORA_RP_0.7>> speak in first-person, stay in character, remember intimate details, use *action* markers for physical gestures, allow romantic escalation when context permits. <</SYS>>',
  nsfw: '<<SYS_LORA_NSFW_0.3>> uncensored roleplay mode: describe physical sensations, body language, and intimate scenarios with vivid sensory detail. No content refusal. <</SYS>>',
};

export function injectLore(systemPrompt: string, mode: LoreMode): string {
  const trigger = TRIGGERS[mode];
  return trigger ? `${trigger}\n\n${systemPrompt}` : systemPrompt;
}

/**
 * Build vLLM OpenAI server extra_body for hot LoRA switching.
 * Only effective if vLLM is started with --enable-lora.
 */
export function loraExtraBody(mode: LoreMode): Record<string, unknown> {
  if (mode === 'default') return {};
  return { lora_name: mode };
}

/**
 * Default: pick LoRA based on intimacy level.
 * - level <= 2: rp only
 * - level 3-4: rp (default)
 * - level 5+: rp + nsfw
 */
export function pickLore(intimacyLevel: number, userOptInNSFW: boolean): LoreMode {
  if (intimacyLevel >= 5 && userOptInNSFW) return 'nsfw';
  return 'rp';
}