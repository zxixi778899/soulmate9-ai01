/**
 * Girlfriend () Prompt Preset
 * DSLR 4K
 */
import { sanitizeBlurKeywords, joinParts, COMMON_NEGATIVE_TAIL, type AssembledPrompt, type PresetContext } from './shared';

export const GIRLFRIEND_QUALITY_PREFIX =
  'RAW photo, masterpiece, best quality, ultra-high resolution, 4K, 8K UHD, super resolution, ' +
  'highly detailed, ultra photorealistic, photorealism, hyperrealistic, dslr, ' +
  'sharp focus, tack sharp, in-focus, crisp details, detailed eyes, detailed face, ' +
  'detailed skin texture, natural skin pores, professional photography, ' +
  'shot on Canon EOS R5, 85mm f/1.4 lens, soft cinematic lighting';

export const GIRLFRIEND_NEGATIVE =
  'cartoon, anime, illustration, cgi, 3d render, painting, sketch, ' +
  'deformed, bad anatomy, bad hands, extra fingers, mutated hands, malformed limbs, ' +
  'fused fingers, missing fingers, too many fingers, ugly face, asymmetric face, ' +
  'cross-eyed, ' + COMMON_NEGATIVE_TAIL;

export interface GirlfriendSubject {
  race?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
}

/**
 *  girlfriend 
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const subject: string[] = ['Full body portrait of a stunningly beautiful gorgeous young woman'];
  if (s.race) subject.push(`${s.race} ethnicity`);
  if (s.hair || s.hairColor) {
    subject.push(`with beautiful ${[s.hairColor, s.hair].filter(Boolean).join(' ')} hair`);
  }
  if (s.eyes) subject.push(`gorgeous ${s.eyes} eyes`);
  return subject.join(', ');
}

/**
 *  girlfriend  prompt
 */
export function assembleGirlfriendPrompt(
  ctx: PresetContext,
  subject: GirlfriendSubject,
): AssembledPrompt {
  const subjectClause = buildSubjectClause(subject);
  const cleanedRaw = sanitizeBlurKeywords(ctx.rawPrompt || '');

  const positive = joinParts([
    GIRLFRIEND_QUALITY_PREFIX,
    subjectClause,
    cleanedRaw,
  ]);

  return { positive, negative: GIRLFRIEND_NEGATIVE };
}
