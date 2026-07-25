import type { CompanionCategory } from '@/lib/companion-category';

export type AnimeRenderStyle = '2d' | '3d';
export type NsfwIntensity = 1 | 2 | 3 | 4 | 5;

const INTENSITY_PROMPTS: Record<NsfwIntensity, string> = {
  1: 'Keep the scene sensual but non-explicit: fully covered intimate clothing, teasing eye contact, relaxed flirtatious body language, and no visible nipples or genitals.',
  2: 'Create an erotic boudoir scene with lingerie or strategic covering, partial nudity, intimate posing, and strong adult tension, while keeping genitals covered.',
  3: 'Create an explicitly nude adult scene with a direct erotic pose, visible mature anatomy, confident eye contact, and a clearly readable body silhouette.',
  4: 'Create a highly explicit consensual adult scene with fully visible mature anatomy, proactive erotic body language, close intimate staging, and physically coherent contact.',
  5: 'Use maximum consensual adult intensity at the most explicit level supported by the image workflow: full nudity, fully readable mature anatomy, an unmistakable sexual pose, close direct staging, and precise visual storytelling. Do not soften the scene into glamour or lingerie.',
};

const CATEGORY_PROMPTS: Record<CompanionCategory, string> = {
  female: 'An unmistakably adult woman age 25 or older with coherent feminine anatomy and natural proportions.',
  male: 'An unmistakably adult man age 25 or older with coherent masculine anatomy, broad shoulders, and a defined adult physique.',
  transgender: 'An unmistakably adult transgender woman age 25 or older. Preserve both feminine traits and her transgender anatomy: feminine face, developed breasts, curvy waist and hips, plus clearly coherent external male genital anatomy when the scene exposes it. Keep one consistent person and avoid duplicated or conflicting anatomy.',
  anime: 'An unmistakably adult anime character age 25 or older with mature facial structure, adult proportions, and coherent stylized anatomy.',
};

const RENDER_PROMPTS: Record<AnimeRenderStyle, string> = {
  '2d': 'Render as premium 2D adult anime illustration: clean confident line art, controlled cel shading, expressive eyes, layered hair shapes, deliberate highlights, and no photoreal skin.',
  '3d': 'Render as polished 3D adult anime CGI: high-quality stylized character model, coherent PBR materials, subsurface skin shading, detailed hair cards, cinematic volumetric lighting, and no flat line-art look.',
};

export function buildStudioPromptEnhancement(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
}): string {
  const render = input.category === 'anime'
    ? RENDER_PROMPTS[input.animeStyle || '2d']
    : 'Use FLUX natural-language photographic direction, realistic skin response, controlled cinematic light, and a coherent single adult subject.';
  return [
    CATEGORY_PROMPTS[input.category],
    INTENSITY_PROMPTS[input.intensity],
    render,
    'Keep hands, face, torso, pelvis, and visible anatomy internally consistent. Show only consenting adults.',
  ].join(' ');
}

export function studioLoraStrengthScale(intensity: NsfwIntensity): number {
  return ({ 1: 0.72, 2: 0.84, 3: 0.96, 4: 1.08, 5: 1.18 } as const)[intensity];
}

export function studioIntensityLabel(intensity: NsfwIntensity): string {
  return ({
    1: '性感但不露点',
    2: '情趣内衣与局部裸露',
    3: '明确成人全裸',
    4: '高强度成人亲密场景',
    5: '最高强度成人显式场景',
  } as const)[intensity];
}

export function studioNegativePrompt(category: CompanionCategory, animeStyle: AnimeRenderStyle = '2d'): string {
  const shared = 'child, teen, underage, youthful face, ambiguous age, duplicate person, extra limbs, fused anatomy, malformed hands, malformed genitals, censored bar, mosaic, watermark, text';
  if (category === 'transgender') {
    return `${shared}, duplicated genitals, detached genitals, female-only anatomy, male-only silhouette, caricature, fetish stereotype`;
  }
  if (category === 'anime') {
    return animeStyle === '2d'
      ? `${shared}, photorealistic, photograph, 3d render, plastic CGI, muddy line art`
      : `${shared}, flat 2d drawing, sketch, broken mesh, wax figure, low-poly model`;
  }
  return `${shared}, plastic skin, waxy face, broken pelvis, bad anatomy`;
}

export function recommendedStudioLoras(
  category: CompanionCategory,
  animeStyle: AnimeRenderStyle = '2d',
): Array<{ id: string; strength: number; reasonZh: string }> {
  if (category === 'transgender') {
    return [
      { id: 'body-transgender-flux', strength: 0.62, reasonZh: '稳定女性外观与跨性别身体特征' },
      { id: 'detail-skin-flux', strength: 0.42, reasonZh: '增强真实皮肤和局部细节' },
      { id: 'pose-nsfw-dynamic', strength: 0.48, reasonZh: '增强成人动作可读性' },
    ];
  }
  if (category === 'anime') {
    return animeStyle === '2d'
      ? [
          { id: 'style-anime-2d-flux', strength: 0.72, reasonZh: '稳定 2D 线稿与赛璐璐上色' },
          { id: 'pose-nsfw-dynamic', strength: 0.38, reasonZh: '辅助成人动作构图' },
        ]
      : [
          { id: 'style-anime-3d-flux', strength: 0.68, reasonZh: '稳定 3D 动漫材质和角色建模' },
          { id: 'pose-nsfw-dynamic', strength: 0.4, reasonZh: '辅助成人动作构图' },
        ];
  }
  return category === 'male'
    ? [
        { id: 'body-athletic-flux', strength: 0.58, reasonZh: '强化男性体型' },
        { id: 'detail-skin-flux', strength: 0.42, reasonZh: '增强皮肤细节' },
      ]
    : [
        { id: 'body-curvy-flux', strength: 0.58, reasonZh: '强化女性曲线' },
        { id: 'detail-skin-flux', strength: 0.42, reasonZh: '增强皮肤细节' },
      ];
}

export function loraUsageZh(lora: { id?: string; category?: string; usage?: string }): string {
  const id = String(lora.id || '');
  if (id.includes('transgender')) return '跨性别人物身体结构：兼顾女性外观与跨性别性征，建议强度 0.5–0.7。';
  if (id.includes('anime-2d')) return '二次元 2D：稳定线稿、赛璐璐上色和动漫五官，避免混入写实皮肤。';
  if (id.includes('anime-3d')) return '二次元 3D：稳定 CGI 角色、PBR 材质、发丝和电影灯光。';
  const category = String(lora.category || '');
  const map: Record<string, string> = {
    body: '调整成年人物身材比例；与动作 LoRA 叠加时建议降低到 0.45–0.65。',
    action: '控制成人动作和镜头姿态；必须配合对应触发词，建议强度 0.4–0.7。',
    outfit: '控制服装或裸露方式；与身材 LoRA 同用时避免总强度过高。',
    detail: '增强皮肤、面部或局部细节；通常使用低强度 0.3–0.55。',
    style: '控制整体画风；不要与冲突的写实/动漫风格 LoRA 同时使用。',
    prop: '增加指定道具或场景物件，适合商品图和主题场景。',
  };
  return map[category] || lora.usage || '辅助控制生成效果，请根据预览逐步调整强度。';
}
