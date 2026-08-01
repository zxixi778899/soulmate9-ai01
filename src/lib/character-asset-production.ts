import type { AnimeRenderStyle } from '@/lib/comfy-console/studio-profile';

export const CHARACTER_ASSET_ROLES = [
  'avatar-closeup',
  'identity-front',
  'identity-profile',
  'identity-back',
  'identity-turnaround',
  'identity-half',
  'identity-full',
  'character-art',
  'album',
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
    role: 'avatar-closeup',
    label: '人设头像 · 半身像',
    shortLabel: '半身头像',
    description: '根据伴侣基础信息生成半身像头像（头到腰部以上），作为立绘与后续所有资产的 IP-Adapter 身份锚点。',
    scene: 'A waist-up studio portrait of the same adult character, head and upper torso fully in frame, relaxed natural expression with warm approachable eye contact, plain warm-gray background, soft diffused daylight, neutral white balance, accurate natural skin tone, gentle contrast',
    width: 832,
    height: 1216,
    consistency: false,
    referenceRole: 'identity',
  },
  {
    role: 'identity-front',
    label: '角色 ID · 正脸',
    shortLabel: '正脸',
    description: '清晰记录脸型、五官、发型和肤色，作为主身份参考。',
    scene: 'Full-body front-facing catalog photograph, person standing straight with arms relaxed at sides, entire head to feet visible with margin, fitted simple white outfit, plain light-gray studio backdrop, flat even lighting, sharp focus, professional fashion catalog shot',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'identity-profile',
    label: '角色 ID · 侧脸',
    shortLabel: '侧脸',
    description: '记录鼻梁、下颌、发际线和侧面轮廓。',
    scene: 'Full-body side-profile catalog photograph, person standing straight with left side facing camera, entire head to feet visible with margin, fitted simple white outfit, plain light-gray studio backdrop, flat even lighting, sharp focus, professional fashion catalog shot',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'identity-back',
    label: '角色 ID · 背面',
    shortLabel: '背面',
    description: '记录后脑、发型背面、肩背轮廓和身体比例，完成标准三视图。',
    scene: 'Full-body rear-view catalog photograph, person standing straight with back facing camera, entire head to feet visible with margin, fitted simple white outfit, plain light-gray studio backdrop, flat even lighting, sharp focus, professional fashion catalog shot',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'identity-turnaround',
    label: '角色 ID · 三视图参考图',
    shortLabel: '三视图',
    description: '单张横图：正面、侧面、背面三个全身视图并排，作为角色一致性的标准三视图参考。',
    scene: 'A single wide horizontal contact sheet divided into exactly three equal vertical panels. Show the same adult character exactly three times at identical scale and baseline: left panel full-body front view, center panel strict left-side profile, right panel full-body back view. Every figure is visible head to toe with space above the head and below the feet, wearing the same simple fitted white outfit, standing naturally against one plain light-gray studio background with flat neutral lighting. No close-up, no portrait crop, no repeated camera angle.',
    width: 1344,
    height: 768,
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
    scene: 'a polished full-height advertising key art of the character, confident natural pose, recognizable signature outfit, clean readable silhouette, cinematic magazine lighting with a clear well-lit face, layered environment with restrained detail',
    width: 832,
    height: 1216,
    consistency: true,
    referenceRole: 'identity',
  },
  {
    role: 'album',
    label: '角色相册',
    shortLabel: '相册',
    description: '调用人设参考图，在新服装、动作与场景中生成保持身份一致的相册图片。',
    scene: 'a polished lifestyle album photograph of the established adult character, preserving the exact face, hair, body proportions and distinguishing features while varying the requested wardrobe, action, environment, camera angle and lighting',
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
  'avatar-closeup',
];

export function identityReferenceRolePriority(role: CharacterAssetRole): CharacterAssetRole[] {
  // The waist-up avatar is the single IP-Adapter identity anchor for every
  // downstream asset (character-art, album, scene, video). Legacy identity-*
  // reference sheets are kept only as secondary fallbacks so existing DB assets
  // still resolve, but new productions never generate them.
  if (role === 'identity-front') return ['avatar-closeup'];
  if (role === 'identity-profile') return ['identity-front', 'avatar-closeup'];
  if (role === 'identity-back') return ['identity-profile', 'identity-front', 'avatar-closeup'];
  return ['avatar-closeup', 'identity-turnaround', 'identity-front', 'identity-profile', 'identity-back'];
}

export function identityTurnaroundDenoise(role: CharacterAssetRole, requested: number): number {
  // Identity reference sheets: moderate denoise (composition is intentionally structured)
  if (role === 'identity-turnaround') return 0.72;
  if (role === 'identity-front') return 0.72;
  if (role === 'identity-profile') return 0.68;
  if (role === 'identity-back') return 0.76;
  // Final products: HIGH denoise — reference is for consistency only, not composition lock.
  // Generate genuinely new images; the reference provides loose structural guidance only.
  if (role === 'character-art') return Math.max(0.9, requested);
  if (role === 'album' || role === 'scene') return Math.max(0.88, requested);
  return Math.min(0.95, Math.max(0.75, requested));
}
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
  return 'Render only as a candid real camera photograph with neutral white balance, accurate skin tone, restrained saturation, gentle highlight roll-off, practical or window light, real fabric texture, and moderate depth of field. Give the subject a relaxed asymmetrical posture, believable weight distribution, natural hands, and a subtle micro-expression; avoid beauty filtering, glossy plastic skin, neon color casts, illustration, and CGI.';
}
