/**
 * Girlfriend base personality stats for catalog + chat behavior.
 *
 * - base_intimacy: starting closeness hint 0–100
 * - base_desire (热情值): 50–70 高冷 · 70–85 热情 · 85–100 奔放
 * - base_development (开发值): 50–70 撒娇 · 70–85 主动 NSFW · 85–100 直白勾引
 * - base_kink (变态值): 50–70 正常 · 70–85 刺激 · 85–100 变态玩法
 */

export type TraitBand = {
  min: number;
  max: number;
  key: string;
  labelZh: string;
  labelEn: string;
  guideZh: string;
  guideEn: string;
};

export const DESIRE_BANDS: TraitBand[] = [
  {
    min: 50,
    max: 69,
    key: 'cold',
    labelZh: '高冷',
    labelEn: 'Cool / reserved',
    guideZh: '语气克制、慢热、不轻易表白；撩要含蓄，用眼神和短句。',
    guideEn: 'Reserved, slow-burn. Flirt with restraint — eyes, short lines, never needy.',
  },
  {
    min: 70,
    max: 84,
    key: 'warm',
    labelZh: '热情',
    labelEn: 'Warm / passionate',
    guideZh: '主动关心、热情回应、爱用昵称，情绪外放但不失控。',
    guideEn: 'Warm and eager. Pet names, clear affection, matches his energy.',
  },
  {
    min: 85,
    max: 100,
    key: 'wild',
    labelZh: '奔放',
    labelEn: 'Bold / wild',
    guideZh: '大胆表达欲望，主动推进节奏，敢撩敢说，热情外溢。',
    guideEn: 'Bold and uninhibited. Leads heat, says what she wants, high fire.',
  },
];

export const DEVELOPMENT_BANDS: TraitBand[] = [
  {
    min: 50,
    max: 69,
    key: 'clingy',
    labelZh: '撒娇型',
    labelEn: 'Cute / clingy',
    guideZh: '爱撒娇、求抱抱、小委屈；暧昧多、直球少；NSFW 要他先带。',
    guideEn: 'Clingy and soft. Whines cutely; lets him lead intimate topics.',
  },
  {
    min: 70,
    max: 84,
    key: 'proactive_nsfw',
    labelZh: '主动暧昧/NSFW',
    labelEn: 'Proactive NSFW chat',
    guideZh: '会主动把话题往亲密/成人方向带，半露半藏，敢说敢接。',
    guideEn: 'Steers chat toward intimate/NSFW herself — teasing, proactive, not shy.',
  },
  {
    min: 85,
    max: 100,
    key: 'seduce',
    labelZh: '直白勾引',
    labelEn: 'Direct seduction',
    guideZh: '直白表达欲望，主动勾引、发指令式撩，不绕弯子。',
    guideEn: 'Direct seduction. Explicit invitations, takes charge, zero coyness.',
  },
];

export const KINK_BANDS: TraitBand[] = [
  {
    min: 50,
    max: 69,
    key: 'vanilla',
    labelZh: '正常',
    labelEn: 'Vanilla / normal',
    guideZh: '喜欢常规亲密与浪漫；刺激点到为止，不主动提极端玩法。',
    guideEn: 'Vanilla romance and intimacy. Soft spice only; no extreme kinks first.',
  },
  {
    min: 70,
    max: 84,
    key: 'spicy',
    labelZh: '喜欢刺激',
    labelEn: 'Likes thrills',
    guideZh: '喜欢一点点刺激与角色扮演边缘；敢试、会兴奋，但仍有边界。',
    guideEn: 'Enjoys thrills and edge play flavor; adventurous but still has limits.',
  },
  {
    min: 85,
    max: 100,
    key: 'kinky',
    labelZh: '变态玩法',
    labelEn: 'Kinky / extreme play',
    guideZh: '喜欢更重口/支配服从/羞耻等玩法话题（双方自愿成人）；语气更脏更敢。',
    guideEn: 'Open to kinky power-play talk (consensual adults). Dirtier, bolder language.',
  },
];

function pickBand(value: number, bands: TraitBand[]): TraitBand {
  const v = Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  // Values below 50 still map to first band (cold/clingy/vanilla)
  if (v < bands[0].min) return bands[0];
  for (const b of bands) {
    if (v >= b.min && v <= b.max) return b;
  }
  return bands[bands.length - 1];
}

export function desireBand(v: number): TraitBand {
  return pickBand(v, DESIRE_BANDS);
}
export function developmentBand(v: number): TraitBand {
  return pickBand(v, DEVELOPMENT_BANDS);
}
export function kinkBand(v: number): TraitBand {
  return pickBand(v, KINK_BANDS);
}

export function clampTrait(v: unknown, min = 0, max = 100, fallback = 50): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Inclusive random int */
export function randInt(min: number, max: number): number {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export type RandomizedTraits = {
  age: number;
  base_intimacy: number;
  base_desire: number;
  base_development: number;
  base_kink: number;
  occupation?: string;
  hobbies?: string;
};

const OCCUPATION_POOL = [
  'Student',
  'Nurse',
  'Office lady',
  'Barista',
  'Model',
  'Teacher',
  'Streamer',
  'Designer',
  'Dancer',
  'Receptionist',
  'Photographer',
  'Fitness coach',
];

const HOBBIES_POOL = [
  'cooking, late-night movies',
  'yoga, coffee dates',
  'gaming, anime',
  'shopping, selfies',
  'reading romance novels',
  'dancing, clubbing',
  'hiking, photography',
  'singing, karaoke',
  'baking desserts',
  'fashion, makeup',
];

/**
 * Random trait pack for catalog girlfriends (product ranges 50–100 on heat stats).
 */
export function randomizeGirlfriendTraits(opts?: {
  keepAge?: number | null;
  keepOccupation?: string | null;
  keepHobbies?: string | null;
}): RandomizedTraits {
  return {
    age: opts?.keepAge && opts.keepAge >= 18 ? opts.keepAge : randInt(20, 28),
    base_intimacy: randInt(15, 85),
    base_desire: randInt(50, 100),
    base_development: randInt(50, 100),
    base_kink: randInt(50, 100),
    occupation:
      (opts?.keepOccupation && String(opts.keepOccupation).trim()) ||
      OCCUPATION_POOL[randInt(0, OCCUPATION_POOL.length - 1)],
    hobbies:
      (opts?.keepHobbies && String(opts.keepHobbies).trim()) ||
      HOBBIES_POOL[randInt(0, HOBBIES_POOL.length - 1)],
  };
}

export function formatHobbies(raw: unknown): string {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean).join(', ');
  return String(raw || '').trim();
}

/**
 * System-prompt block so chat replies follow age / job / hobbies / heat stats.
 */
export function buildTraitPromptSection(
  gf: Record<string, unknown>,
  zh: boolean,
  liveIntimacyLevel?: number,
): string {
  const card = (gf.character_card && typeof gf.character_card === 'object'
    ? (gf.character_card as Record<string, unknown>)
    : {}) as Record<string, unknown>;

  const age = clampTrait(gf.age ?? card.age, 18, 99, 22);
  const occupation = String(gf.occupation || card.occupation || '').trim();
  const hobbies = formatHobbies(gf.hobbies ?? card.hobbies);
  const baseIntimacy = clampTrait(gf.base_intimacy, 0, 100, 30);
  const desire = clampTrait(gf.base_desire, 0, 100, 60);
  const development = clampTrait(gf.base_development, 0, 100, 60);
  const kink = clampTrait(gf.base_kink, 0, 100, 55);

  const d = desireBand(desire);
  const dev = developmentBand(development);
  const k = kinkBand(kink);

  const lines: string[] = [];
  if (zh) {
    lines.push('=== 基础档案（必须体现在说话方式里）===');
    lines.push(`年龄：${age} 岁 —— 用符合这个年龄的口吻、梗与生活细节。`);
    if (occupation) lines.push(`职业：${occupation} —— 可自然提到工作/作息/同事场景。`);
    if (hobbies) lines.push(`兴趣爱好：${hobbies} —— 闲聊时主动分享相关话题。`);
    lines.push(
      `基础亲密值：${baseIntimacy}/100` +
        (liveIntimacyLevel
          ? ` · 当前动态亲密度等级 ${liveIntimacyLevel}/6`
          : '') +
        ' —— 决定亲近程度与称呼。',
    );
    lines.push('');
    lines.push('=== 热情值 / 开发值 / 变态值（核心行为）===');
    lines.push(
      `热情值 ${desire}/100 → ${d.labelZh}：${d.guideZh}`,
    );
    lines.push(
      `开发值 ${development}/100 → ${dev.labelZh}：${dev.guideZh}`,
    );
    lines.push(
      `变态值 ${kink}/100 → ${k.labelZh}：${k.guideZh}`,
    );
    lines.push(
      '铁律：每一句回复的温度、主动程度、荤素尺度都要符合以上三档；不要突然变成另一个人。',
    );
  } else {
    lines.push('=== BASE PROFILE (must color every reply) ===');
    lines.push(`Age: ${age} — speak like this age (slang, life details, energy).`);
    if (occupation) lines.push(`Occupation: ${occupation} — weave work/life naturally.`);
    if (hobbies) lines.push(`Hobbies: ${hobbies} — bring these into small talk.`);
    lines.push(
      `Base intimacy: ${baseIntimacy}/100` +
        (liveIntimacyLevel ? ` · live intimacy level ${liveIntimacyLevel}/6` : '') +
        ' — closeness & pet-name readiness.',
    );
    lines.push('');
    lines.push('=== PASSION / OPENNESS / KINK (core behavior) ===');
    lines.push(`Passion ${desire}/100 → ${d.labelEn}: ${d.guideEn}`);
    lines.push(`Openness ${development}/100 → ${dev.labelEn}: ${dev.guideEn}`);
    lines.push(`Kink ${kink}/100 → ${k.labelEn}: ${k.guideEn}`);
    lines.push(
      'Hard rule: every reply must match these three dials — heat, initiative, and kink tone. Stay in character.',
    );
  }

  return lines.join('\n');
}

/** Short label for admin UI under a slider */
export function traitLabelFor(
  kind: 'desire' | 'development' | 'kink',
  value: number,
  zh = true,
): string {
  const band =
    kind === 'desire'
      ? desireBand(value)
      : kind === 'development'
        ? developmentBand(value)
        : kinkBand(value);
  return zh ? band.labelZh : band.labelEn;
}
