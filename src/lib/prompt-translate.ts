/**
 * 提示词自动翻译（中文/日韩等 -> 英文）
 * 后台 ComfyUI 控制台 / 捏脸系统 / 对话生图共用同一套逻辑：
 * 仅翻译润色、保留全部概念；无中文或失败时返回 null，调用方走原文。
 */

import { loadAiModules } from '@/lib/ai-modules';
import { invokeChat } from '@/lib/ai-modules/invoke';
import type { MembershipTier } from '@/lib/ai-modules/types';
import { pickImagePromptEndpoint, sanitizeLlmPrompt } from '@/lib/image-prompt-llm';
import { compactFluxPrompt } from '@/lib/comfy-console/studio-profile';
import { logger } from '@/lib/logger';

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3000-\u303f\uff00-\uffef]/g;

/** 是否包含中文（≥2 个 CJK 字符才触发翻译，避免误伤单个符号） */
export function hasCjkPrompt(text: string): boolean {
  const raw = String(text || '').trim();
  if (!raw) return false;
  const m = raw.match(CJK_RE);
  return Boolean(m && m.length >= 2);
}

export async function translatePromptToEnglish(opts: {
  text: string;
  intensity: number;
  mode: 'positive' | 'negative';
  supabase?: { from: (t: string) => any };
  userId?: string;
  membershipTier?: MembershipTier;
}): Promise<string | null> {
  const raw = String(opts.text || '').trim();
  if (!raw || !hasCjkPrompt(raw)) return null;
  const intensity = Math.max(1, Math.min(5, Math.round(Number(opts.intensity) || 1)));
  const channel: 'sfw' | 'nsfw' = intensity >= 3 ? 'nsfw' : 'sfw';
  try {
    const aiModules = await loadAiModules(opts.supabase);
    const picked = pickImagePromptEndpoint(aiModules, channel);
    if (!picked.primary) return null;
    const boundary =
      channel === 'nsfw'
        ? `Consensual adult content allowed at intensity ${intensity}. ` +
          (intensity === 3
            ? 'Full nudity, no sexual act.'
            : intensity === 4
              ? 'Solo masturbation before climax, no visible fluids.'
              : 'Explicit consensual adult action with coherent anatomy.')
        : intensity === 2
          ? 'Lingerie/nightwear only, nipples and genitals covered, no sexual act.'
          : 'Fully clothed, no nudity, no explicit content.';
    const system =
      opts.mode === 'positive'
        ? 'You are a translation engine for FLUX/WAN image prompts. Translate the RAW PROMPT into a fluent English image-generation prompt as comma-separated descriptive clauses. Keep every concept, keyword and intent exactly; NEVER invent or add new subjects, scenes, outfits, poses, actions or objects. Keep identity consistent when a reference is used. Respect the CONTENT BOUNDARY exactly. Output ONLY the English prompt, no markdown, labels or explanations.'
        : 'You are a translation engine for negative image prompts. Translate the RAW PROMPT into a fluent English negative prompt as comma-separated undesired qualities. Keep every concept exactly; do not add unrelated negatives. Respect the CONTENT BOUNDARY exactly. Output ONLY the English negative prompt, no markdown, labels or explanations.';
    const result = await invokeChat({
      endpoint: picked.primary,
      fallbackEndpoints: picked.fallback,
      messages: [
        {
          role: 'system' as const,
          content: system,
        },
        {
          role: 'user' as const,
          content: `RAW PROMPT: ${raw.slice(0, 800)}\n\nCONTENT BOUNDARY: ${boundary}\n\nOUTPUT: the translated prompt now.`,
        },
      ],
      temperature: 0.4,
      maxTokens: Math.min(320, picked.primary.max_tokens || 320),
      userId: opts.userId,
      taskType: 'prompt_translation',
      membershipTier: opts.membershipTier || 'free',
      scene: 'image_generation',
      routeReason: channel === 'nsfw' ? 'nsfw_prompt_llm' : 'sfw_prompt_llm',
    });
    const out = compactFluxPrompt(sanitizeLlmPrompt(result.content), 600);
    if (out) {
      logger.info('[prompt-translate] prompt translated to english', {
        mode: opts.mode,
        channel,
        model: result.model,
        fromLen: raw.length,
        toLen: out.length,
      });
    }
    return out || null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('[prompt-translate] translation failed, keep raw', {
      err: message,
      channel,
      mode: opts.mode,
    });
    return null;
  }
}
