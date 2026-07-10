/**
 * Girlfriend card image prompt preset — optimized for FLUX.1
 *
 * FLUX notes:
 * - Prefers clear natural-language captions (not SD1.5 tag spam)
 * - Heavy negative prompts often cause black / washed frames → keep empty or minimal
 * - Avoid "soft / bokeh / shallow DOF" in positive (reads as blur)
 */
import {
  sanitizeBlurKeywords,
  joinParts,
  type AssembledPrompt,
  type PresetContext,
} from './shared';

/** Photoreal quality — sharp, bright, FLUX-friendly */
export const GIRLFRIEND_QUALITY_PREFIX =
  'RAW photo, masterpiece, best quality, ultra photorealistic, 8k uhd, ' +
  'highly detailed face and eyes, detailed skin texture, natural skin pores, ' +
  'sharp focus, crisp details, professional photography, ' +
  'shot on Canon EOS R5, 50mm lens, bright clear lighting, well-lit subject';

/**
 * Fixed sensual / figure tokens — always applied for girlfriend cards.
 */
export const GIRLFRIEND_BODY_FIXED =
  'large breasts, full bust, wide hips, big round butt, thick thighs, ' +
  'hourglass figure, sexy body, seductive allure, feminine charm';

/** Framing: 3/4 body (not cropped headshot, not full feet) */
export const GIRLFRIEND_FRAMING =
  'three-quarter body portrait, head to mid-thighs, ' +
  'upper body and hips clearly visible, standing pose, looking at viewer, ' +
  'centered composition, clean background';

/**
 * FLUX: keep negatives short or empty.
 * Long SD-style negatives (blur/bokeh/dof spam) frequently yield black images.
 */
export const GIRLFRIEND_NEGATIVE =
  'blurry, low quality, worst quality, deformed, bad anatomy, extra fingers, ' +
  'child, underage, watermark, text, logo, cartoon, anime';

/** Prefer empty negative for pure FLUX workers that ignore/break on CFG negatives */
export const GIRLFRIEND_NEGATIVE_FLUX = '';

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
 * Written as a readable sentence for FLUX.
 */
export function buildSubjectClause(s: GirlfriendSubject): string {
  const name = s.name?.trim() || 'a stunningly beautiful young woman';
  const parts: string[] = [
    `photorealistic three-quarter portrait of ${name}`,
    'gorgeous young adult woman age 23-28',
  ];

  if (s.race) parts.push(`${s.race} ethnicity`);
  if (s.hair || s.hairColor) {
    parts.push(
      `beautiful ${[s.hairColor, s.hair].filter(Boolean).join(' ')} hair`.trim(),
    );
  }
  if (s.eyes) parts.push(`${s.eyes} eyes`);
  if (s.body) parts.push(`${s.body} figure`);
  if (s.style) parts.push(`wearing ${s.style}`);
  if (s.occupation) parts.push(String(s.occupation));
  if (s.personality) {
    const p = String(s.personality).slice(0, 100);
    parts.push(`${p} expression`);
  }
  if (s.appearance) {
    const a = sanitizeBlurKeywords(s.appearance);
    if (a) parts.push(a);
  }

  const tags = normalizeTags(s.tags).slice(0, 5);
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
    race: (row.appearance_race as string) || cardApp.race || undefined,
    hair:
      (row.appearance_hair as string) ||
      cardApp.hair_style ||
      cardApp.hair ||
      undefined,
    hairColor:
      (row.appearance_hair_color as string) || cardApp.hair_color || undefined,
    eyes: (row.appearance_eyes as string) || cardApp.eyes || undefined,
    body: (row.appearance_body as string) || cardApp.body || undefined,
    style: (row.appearance_style as string) || cardApp.style || undefined,
    personality:
      (row.personality as string) || (card.personality as string) || undefined,
    tags: (row.tags as string[] | string) || (card.tags as string[]) || undefined,
    appearance:
      (row.appearance as string) || (row.image_prompt as string) || undefined,
    occupation:
      (card.occupation as string) || (card.role_label as string) || undefined,
  };
}

/**
 * Assemble full girlfriend card prompt (traits + fixed body + 3/4 framing).
 */
export function assembleGirlfriendPrompt(
  ctx: PresetContext,
  subject: GirlfriendSubject,
  opts?: { useEmptyNegative?: boolean },
): AssembledPrompt {
  const subjectClause = buildSubjectClause(subject);
  const cleanedRaw = sanitizeBlurKeywords(ctx.rawPrompt || '');

  const extra =
    cleanedRaw &&
    !subjectClause.toLowerCase().includes(cleanedRaw.toLowerCase().slice(0, 40))
      ? cleanedRaw
      : '';

  // FLUX works better with slightly shorter, clearer prompts
  let positive = joinParts([
    GIRLFRIEND_QUALITY_PREFIX,
    subjectClause,
    GIRLFRIEND_BODY_FIXED,
    GIRLFRIEND_FRAMING,
    extra,
    'seductive expression, soft parted lips, looking at viewer, vibrant colors, high contrast clear image',
  ]);

  // Soft cap ~900 chars — very long prompts can degrade FLUX
  if (positive.length > 900) {
    positive = positive.slice(0, 900);
    const lastComma = positive.lastIndexOf(',');
    if (lastComma > 700) positive = positive.slice(0, lastComma);
  }

  const negative =
    opts?.useEmptyNegative === false ? GIRLFRIEND_NEGATIVE : GIRLFRIEND_NEGATIVE_FLUX;

  return { positive, negative };
}

/**
 * Convenience: build prompt directly from a girlfriend list/DB row.
 * Defaults to empty negative for FLUX stability.
 */
export function assembleGirlfriendFromRow(
  row: Record<string, unknown>,
  rawPrompt = '',
): AssembledPrompt {
  return assembleGirlfriendPrompt(
    { rawPrompt },
    subjectFromGirlfriendRow(row),
    { useEmptyNegative: true },
  );
}
