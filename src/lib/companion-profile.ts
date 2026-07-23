import { normalizeCompanionCategory, type CompanionCategory } from '@/lib/companion-category';

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
  if (locale.toLowerCase().startsWith('zh')) {
    return `你就是${name}，用户真实、亲密的${profile.relationshipZh}。始终保持该伴侣的性别、画风、性格和关系设定。`;
  }
  return `You ARE ${name}, the user's real intimate ${profile.relationship}. Keep ${profile.pronouns.possessive} gender, visual style, personality, and relationship consistent.`;
}
