/**
 * Girlfriend card image prompt preset
 * - Reads girlfriend traits (race / hair / eyes / body / style / personality / tags)
 * - Fixed sensual body tags: large breasts, big hips/butt, sexy, alluring
 * - Framing: 3/4 body shot (head to mid-thigh)
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  COMMON_NEGATIVE_TAIL,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

/** Photoreal quality prefix */
export const GIRLFRIEND_QUALITY_PREFIX =
  'RAW photo, masterpiece, best quality, ultra-high resolution, 4K, 8K UHD, ' +
  'highly detailed, ultra photorealistic, photorealism, hyperrealistic, dslr, ' +
  'sharp focus, tack sharp, crisp details, detailed eyes, detailed face, ' +
  'detailed skin texture, natural skin pores, professional photography, ' +
  'shot on Canon EOS R5, 85mm f/1.4 lens, soft cinematic lighting';

/**
 * Fixed sensual / figure tokens — always applied for girlfriend cards.
 * 固定：大胸、大屁股、性感、妩媚
 */
export const GIRLFRIEND_BODY_FIXED =
  'large breasts, full bust, voluptuous cleavage, wide hips, big round butt, ' +
  'thick thighs, hourglass figure, sexy body, seductive allure, alluring and bewitching, ' +
  'feminine charm, sultry elegance, glamorous sex appeal';

/** Framing: 3/4 body (not cropped headshot, not full feet) */
export const GIRLFRIEND_FRAMING =
  'three-quarter body shot, 3/4 body view, head to mid-thighs, ' +
  'upper body and hips clearly visible, standing pose, looking at viewer';

export const GIRLFRIEND_NEGATIVE =
  'cartoon, anime, illustration, cgi, 3d render, painting, sketch, ' +
  'deformed, bad anatomy, bad hands, extra fingers, mutated hands, malformed limbs, ' +
  'fused fingers, missing fingers, too many fingers, ugly face, asymmetric face, ' +
  'cross-eyed, flat chest, skinny hips, child, underage, loli, ' +
  'full body feet, cropped head, extreme close-up face only, ' +
  COMMON_NEGATIVE_TAIL;

export interface GirlfriendSubject {
  name?: string;
  race?: string;
  hair?: string;
  hairColor?: string;
  eyes?: string;
  body?: string;
  style?: string;
  personality?: string;
  tags?: string[] | string;
  appearance?: string;
  occupation?: string;
}

/** Normalize tags to string array */
function normalizeTags(tags?: string[] | string): string[] {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.map(String).filter(Boolean);
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Build trait clause from girlfriend features (reads card fields).
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = s.name?.trim() || 'a stunningly beautiful young woman';
  const parts: string[] = [
    `three-quarter body portrait of ${name}`,
    'gorgeous young adult woman, 21-28 years old',
  ];

  if (s.race) parts.push(`${s.race} ethnicity`);
  if (s.hair || s.hairColor) {
    parts.push(
      `with beautiful ${[s.hairColor, s.hair].filter(Boolean).join(' ')} hair`,
    );
  }
  if (s.eyes) parts.push(`gorgeous ${s.eyes} eyes`);
  if (s.body) parts.push(`${s.body} build`);
  if (s.style) parts.push(`wearing ${s.style}`);
  if (s.occupation) parts.push(`${s.occupation}`);
  if (s.personality) {
    const p = String(s.personality).slice(0, 120);
    parts.push(`${p} vibe`);
  }
  if (s.appearance) parts.push(sanitizeBlurKeywords(s.appearance));

  const tags = normalizeTags(s.tags).slice(0, 6);
  if (tags.length) parts.push(tags.join(', '));

  return parts.join(', ');
}

/**
 * Map a girlfriend DB / list row into GirlfriendSubject.
 */
export function subjectFromGirlfriendRow(
  row: Record<string, unknown>,
): GirlfriendSubject {
  const card =
    row.character_card && typeof row.character_card === 'object'
      ? (row.character_card as Record<string, unknown>)
      : {};
  const cardApp =
    card.appearance && typeof card.appearance === 'object'
      ? (card.appearance as Record<string, string>)
      : {};

  return {
    name: String(row.name || card.title || ''),
    race:
      (row.appearance_race as string) ||
      cardApp.race ||
      undefined,
    hair:
      (row.appearance_hair as string) ||
      cardApp.hair_style ||
      cardApp.hair ||
      undefined,
    hairColor:
      (row.appearance_hair_color as string) ||
      cardApp.hair_color ||
      undefined,
    eyes:
      (row.appearance_eyes as string) || cardApp.eyes || undefined,
    body:
      (row.appearance_body as string) || cardApp.body || undefined,
    style:
      (row.appearance_style as string) || cardApp.style || undefined,
    personality:
      (row.personality as string) ||
      (card.personality as string) ||
      undefined,
    tags: (row.tags as string[] | string) || (card.tags as string[]) || undefined,
    appearance:
      (row.appearance as string) ||
      (row.image_prompt as string) ||
      undefined,
    occupation:
      (card.occupation as string) ||
      (card.role_label as string) ||
      undefined,
  };
}

/**
 * Assemble full girlfriend card prompt (traits + fixed body + 3/4 framing).
 */
export function assembleGirlfriendPrompt(
  ctx: PresetContext,
  subject: GirlfriendSubject,
): AssembledPrompt {
  const subjectClause = buildSubjectClause(subject);
  const cleanedRaw = sanitizeBlurKeywords(ctx.rawPrompt || '');

  // Avoid duplicating raw if it already mirrors subject
  const extra =
    cleanedRaw &&
    !subjectClause.toLowerCase().includes(cleanedRaw.toLowerCase().slice(0, 40))
      ? cleanedRaw
      : '';

  const positive = joinParts([
    GIRLFRIEND_QUALITY_PREFIX,
    subjectClause,
    GIRLFRIEND_BODY_FIXED,
    GIRLFRIEND_FRAMING,
    extra,
    'seductive expression, soft parted lips, bedroom eyes, looking at viewer',
  ]);

  return { positive, negative: GIRLFRIEND_NEGATIVE };
}

/**
 * Convenience: build prompt directly from a girlfriend list/DB row.
 */
export function assembleGirlfriendFromRow(
  row: Record<string, unknown>,
  rawPrompt = '',
): AssembledPrompt {
  return assembleGirlfriendPrompt(
    { rawPrompt },
    subjectFromGirlfriendRow(row),
  );
}
