import type { AnimeRenderStyle } from '@/lib/comfy-console/studio-profile';

export const CHARACTER_ASSET_ROLES = [
  'identity-front',
  'identity-profile',
  'identity-half',
  'identity-full',
  'character-art',
  'scene',
  'pose-reference',
  'style-reference',
  'composition-reference',
] as const;

export type CharacterAssetRole = (typeof CHARACTER_ASSET_ROLES)[number];

export type CharacterProductionPreset = {
  role: CharacterAssetRole;
  label: string;
  shortLabel: string;
  description: string;
  scene: string;
  width: number;
  height: number;
  consistency: boolean;
  referenceRole: 'identity' | 'pose' | 'style' | 'composition';
};

export const CHARACTER_PRODUCTION_PRESETS: CharacterProductionPreset[] = [
  {
    role: 'identity-front',
    label: '角色 ID · 正脸',
    shortLabel: '正脸',
    description: '清晰记录脸型、五官、发型和肤色，作为主身份参考。',
    scene: 'a neutral front-facing identity portrait, head and shoulders centered, both eyes fully visible, relaxed expression, plain unobtrusive background, even identity-document lighting',
    width: 832,
    height: 1216,
    consistency: false,
    referenceRole: 'identity',
  },
  {
    role: 'identity-profile',
    label: '角色 ID · 侧脸',
    shortLabel: '侧脸',
    description: '记录鼻梁、下颌、发际线和侧面轮廓。',
    scene: 'a clean three-quarter profile identity portrait, face turned about sixty degrees, complete head in frame, visible nose bridge and jawline, neutral background and even lighting',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'identity-half',
    label: '角色 ID · 半身',
    shortLabel: '半身',
    description: '锁定肩颈、上身比例、常用服装和自然姿态。',
    scene: 'a waist-up identity reference, complete head and torso visible, relaxed shoulders, arms naturally separated from the body, simple fitted clothing, neutral studio background',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'identity-full',
    label: '角色 ID · 全身',
    shortLabel: '全身',
    description: '锁定身高感、体型、四肢比例和站姿。',
    scene: 'a full-body identity turnaround reference, complete head, hands and feet inside frame, standing naturally with shifted weight, fitted simple clothing showing body proportions, clean studio floor',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'character-art',
    label: '角色立绘',
    shortLabel: '立绘',
    description: '用于角色卡、详情页和运营展示的标准主视觉。',
    scene: 'a polished full-height character key art image, confident natural pose, recognizable signature outfit, clean readable silhouette, layered environment with restrained detail and clear face lighting',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'scene',
    label: '场景资源',
    shortLabel: '场景',
    description: '保持角色身份，在新的动作、服装和环境中生成内容。',
    scene: 'the established character in a newly composed environment, performing the requested action naturally, candid asymmetrical body language, coherent contact with furniture and props',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'pose-reference',
    label: '动作参考',
    shortLabel: '动作',
    description: '供后续图片复用的清晰动作与肢体关系。',
    scene: 'a clear readable full-body pose reference, limbs separated, balanced anatomy, visible hands and feet, minimal background, natural weight distribution',
    width: 832,
    height: 1216,
    consistency: false,
    referenceRole: 'pose',
  },
  {
    role: 'style-reference',
    label: '风格参考',
    shortLabel: '风格',
    description: '记录统一材质、用光、色彩和渲染语言。',
    scene: 'a style reference image with a consistent color script, material treatment, lighting language and rendering finish, simple composition that does not obscure the subject',
    width: 1024,
    height: 1024,
    consistency: false,
    referenceRole: 'style',
  },
  {
    role: 'composition-reference',
    label: '构图参考',
    shortLabel: '构图',
    description: '记录镜头高度、景别和画面重心。',
    scene: 'a composition reference with clear camera height, subject placement, foreground separation, readable negative space and a strong focal hierarchy',
    width: 1024,
    height: 1024,
    consistency: false,
    referenceRole: 'composition',
  },
];

export const CHARACTER_ID_PACK: CharacterAssetRole[] = [
  'identity-front',
  'identity-profile',
  'identity-half',
  'identity-full',
  'character-art',
];

export function normalizeCharacterAssetRole(value: unknown): CharacterAssetRole {
  const role = String(value || '');
  return CHARACTER_ASSET_ROLES.includes(role as CharacterAssetRole)
    ? role as CharacterAssetRole
    : 'scene';
}

export function getCharacterProductionPreset(role: CharacterAssetRole): CharacterProductionPreset {
  return CHARACTER_PRODUCTION_PRESETS.find((preset) => preset.role === role)
    || CHARACTER_PRODUCTION_PRESETS[5];
}

export function styleProductionHint(style: AnimeRenderStyle): string {
  if (style === '2d') {
    return 'Render only as coherent 2D animation art with stable linework and cel shading; do not use photography or 3D CGI.';
  }
  if (style === '3d') {
    return 'Render only as coherent 3D animation with consistent character materials and cinematic CGI lighting; do not use 2D line art or live photography.';
  }
  return 'Render only as a believable real camera photograph with natural skin, lens behavior and practical lighting; do not use illustration or CGI.';
}
