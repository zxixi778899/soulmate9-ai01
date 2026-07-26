import type { CompanionCategory } from '@/lib/companion-category';

export const IMAGE_PAIRINGS = ['solo', 'female_male', 'male_male', 'female_female', 'trans_pair', 'group_4i'] as const;
export const IMAGE_PROTAGONISTS = ['female', 'male', 'transgender', 'femboy', 'ensemble'] as const;
export const IMAGE_POWER_DYNAMICS = ['neutral', 'male_dominant', 'male_submissive', 'sm'] as const;

export type ImagePairing = (typeof IMAGE_PAIRINGS)[number];
export type ImageProtagonist = (typeof IMAGE_PROTAGONISTS)[number];
export type ImagePowerDynamic = (typeof IMAGE_POWER_DYNAMICS)[number];
export type ImageSceneSemantics = {
  pairing: ImagePairing;
  protagonist: ImageProtagonist;
  powerDynamic: ImagePowerDynamic;
  tags: string[];
  source: 'llm' | 'rules';
};

const includesAny = (text: string, values: string[]): boolean => values.some((value) => text.includes(value));

export function classifyImageScene(sourceText: string, category: CompanionCategory = 'female'): ImageSceneSemantics {
  const text = ` ${sourceText.toLowerCase().replace(/\s+/g, ' ').trim()} `;
  let pairing: ImagePairing = 'solo';
  if (includesAny(text, ['4i', '四人', '多人', 'group scene', 'four adults'])) pairing = 'group_4i';
  else if (includesAny(text, ['男男', '双男', 'male male', 'two men', 'gay couple', ' m/m ', 'mm couple'])) pairing = 'male_male';
  else if (includesAny(text, ['女女', '双女', 'female female', 'two women', 'lesbian couple', ' f/f ', 'ff couple'])) pairing = 'female_female';
  else if (includesAny(text, ['男女', '一男一女', 'female male', 'man and woman', 'hetero couple', ' m/f '])) pairing = 'female_male';
  else if (includesAny(text, ['跨性别伴侣', 'trans pair', 'transgender couple'])) pairing = 'trans_pair';

  let protagonist: ImageProtagonist = category === 'male' ? 'male' : category === 'transgender' ? 'transgender' : 'female';
  if (includesAny(text, ['伪娘', '男娘', 'femboy', 'feminine boy', 'feminine man'])) protagonist = 'femboy';
  else if (includesAny(text, ['跨性别', 'transgender', 'trans woman', 'trans man', 'mtf', 'ftm'])) protagonist = 'transgender';
  else if (includesAny(text, ['男主', 'male lead', 'male protagonist', 'hero'])) protagonist = 'male';
  else if (includesAny(text, ['女主', 'female lead', 'female protagonist', 'heroine'])) protagonist = 'female';
  else if (pairing === 'group_4i') protagonist = 'ensemble';

  let powerDynamic: ImagePowerDynamic = 'neutral';
  if (includesAny(text, [' sm ', 's&m', 'bdsm', '束缚', '调教', '支配', '臣服'])) powerDynamic = 'sm';
  else if (includesAny(text, ['男攻', 'male dominant', 'dominant man', 'top man'])) powerDynamic = 'male_dominant';
  else if (includesAny(text, ['男受', 'male submissive', 'submissive man', 'bottom man'])) powerDynamic = 'male_submissive';

  const tags = [pairing !== 'solo' ? pairing : '', protagonist, powerDynamic !== 'neutral' ? powerDynamic : ''].filter(Boolean);
  return { pairing, protagonist, powerDynamic, tags, source: 'rules' };
}

const isMember = <T extends readonly string[]>(values: T, value: unknown): value is T[number] => typeof value === 'string' && values.includes(value);

export function normalizeLlmImageScene(value: unknown, fallback: ImageSceneSemantics): ImageSceneSemantics {
  if (!value || typeof value !== 'object') return fallback;
  const record = value as Record<string, unknown>;
  return {
    pairing: isMember(IMAGE_PAIRINGS, record.pairing) ? record.pairing : fallback.pairing,
    protagonist: isMember(IMAGE_PROTAGONISTS, record.protagonist) ? record.protagonist : fallback.protagonist,
    powerDynamic: isMember(IMAGE_POWER_DYNAMICS, record.power_dynamic) ? record.power_dynamic : fallback.powerDynamic,
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) : fallback.tags,
    source: 'llm',
  };
}

export function isComplexAdultScene(scene: ImageSceneSemantics): boolean {
  return scene.pairing !== 'solo' || scene.powerDynamic !== 'neutral';
}

export function buildSceneCastPrompt(scene: ImageSceneSemantics): string {
  const pairings: Record<ImagePairing, string> = {
    solo: 'The frame contains one clearly defined adult subject.',
    female_male: 'The frame contains one adult woman and one adult man, with distinct anatomy and consistent identities.',
    male_male: 'The frame contains two adult men, each with distinct faces, bodies, and clear spatial separation.',
    female_female: 'The frame contains two adult women, each with distinct faces, bodies, and clear spatial separation.',
    trans_pair: 'The frame contains consenting adult partners, including a clearly presented transgender adult.',
    group_4i: 'The frame contains exactly four consenting adults, with readable poses and no merged bodies.',
  };
  const protagonists: Record<ImageProtagonist, string> = {
    female: 'The adult woman is the visual lead.', male: 'The adult man is the visual lead.',
    transgender: 'The transgender adult is the visual lead; preserve the requested feminine and masculine traits consistently.',
    femboy: 'The visual lead is an adult feminine man with a clearly masculine identity and feminine presentation.',
    ensemble: 'All adult subjects share visual emphasis.',
  };
  const dynamics: Record<ImagePowerDynamic, string> = {
    neutral: 'The interaction is natural and mutually engaged.',
    male_dominant: 'The adult man leads the consensual pose through confident body language.',
    male_submissive: 'The adult man takes the consensual receptive role through relaxed body language.',
    sm: 'The scene uses clearly consensual adult BDSM styling, controlled posing, and safe-looking props.',
  };
  return `${pairings[scene.pairing]} ${protagonists[scene.protagonist]} ${dynamics[scene.powerDynamic]}`;
}
