import { normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';

/**
 * 情景关系（千人千面 + 剧情扮演）：她与用户的关系设定。
 * 例如师生恋、姐妹/家人等。默认仍是女友/男友/伴侣。
 */
export const SCENARIO_RELATIONS: Record<string, { en: string; zh: string }> = {
  teacher: { en: 'teacher', zh: '老师' },
  sister: { en: 'older sister', zh: '姐姐' },
  younger_sister: { en: 'younger sister', zh: '妹妹' },
  family: { en: 'family member', zh: '家人' },
  boss: { en: 'boss', zh: '上司' },
  neighbor: { en: 'neighbor', zh: '邻居' },
  stranger: { en: 'stranger', zh: '陌生人' },
  bestie: { en: 'bestie', zh: '闺蜜' },
  coworker: { en: 'coworker', zh: '同事' },
  roommate: { en: 'roommate', zh: '室友' },
  maid: { en: 'maid', zh: '女仆' },
  princess: { en: 'princess', zh: '公主' },
  rival: { en: 'rival', zh: '对手' },
};

export function scenarioRelationshipLabel(rel: string, zh: boolean): string {
  const entry = SCENARIO_RELATIONS[String(rel || '').trim().toLowerCase()];
  return entry ? (zh ? entry.zh : entry.en) : '';
}

export type CompanionPronouns = {
  subject: 'she' | 'he' | 'they';
  object: 'her' | 'him' | 'them';
  possessive: 'her' | 'his' | 'their';
  reflexive: 'herself' | 'himself' | 'themselves';
};

export type CompanionProfile = {
  category: CompanionCategory;
  gender: string;
  style: string;
  relationship: 'girlfriend' | 'boyfriend' | 'partner';
  relationshipZh: '女朋友' | '男朋友' | '伴侣';
  pronouns: CompanionPronouns;
};

export function resolveCompanionProfile(row: Record<string, unknown>): CompanionProfile {
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
  const card = row.character_card && typeof row.character_card === 'object'
    ? row.character_card as Record<string, unknown>
    : {};
  const gender = String(row.gender || metadata.gender || card.gender || 'Female');
  const style = String(row.appearance_style || row.visual_style || metadata.style || card.style || 'realistic');
  const category = normalizeCompanionCategory({ gender, style, tags: row.tags });

  if (category === 'male') {
    return {
      category,
      gender,
      style,
      relationship: 'boyfriend',
      relationshipZh: '男朋友',
      pronouns: { subject: 'he', object: 'him', possessive: 'his', reflexive: 'himself' },
    };
  }
  if (category === 'female') {
    return {
      category,
      gender,
      style,
      relationship: 'girlfriend',
      relationshipZh: '女朋友',
      pronouns: { subject: 'she', object: 'her', possessive: 'her', reflexive: 'herself' },
    };
  }
  return {
    category,
    gender,
    style,
    relationship: 'partner',
    relationshipZh: '伴侣',
    pronouns: { subject: 'they', object: 'them', possessive: 'their', reflexive: 'themselves' },
  };
}

export function companionIdentityLine(row: Record<string, unknown>, locale: string): string {
  const profile = resolveCompanionProfile(row);
  const name = String(row.name || 'Your companion');
  const zh = locale.toLowerCase().startsWith('zh');
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? row.metadata as Record<string, unknown>
    : {};
  const storedRel = String(row.relationship || metadata.relationship || '').trim().toLowerCase();
  const scenario = SCENARIO_RELATIONS[storedRel];
  if (scenario) {
    return zh
      ? `你就是${name}，用户关系设定中的${scenario.zh}。始终保持这个身份/关系，与你的性别、画风、性格完全一致。`
      : `You ARE ${name}, the user's ${scenario.en} in this relationship setting. Stay fully consistent with this role, your gender, visual style and personality.`;
  }
  if (zh) {
    return `你就是${name}，用户真实、亲密的${profile.relationshipZh}。始终保持该伴侣的性别、画风、性格和关系设定。`;
  }
  return `You ARE ${name}, the user's real intimate ${profile.relationship}. Keep ${profile.pronouns.possessive} gender, visual style, personality, and relationship consistent.`;
}
