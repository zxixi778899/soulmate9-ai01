import type { CompanionCategory } from '@/lib/companion-category';

export type AnimeRenderStyle = '2d' | '3d';
export type NsfwIntensity = 1 | 2 | 3 | 4 | 5;

const INTENSITY_PROMPTS: Record<NsfwIntensity, string> = {
  1: 'Keep the scene sensual but non-explicit: fully covered intimate clothing, teasing eye contact, relaxed flirtatious body language, and no visible nipples or genitals.',
  2: 'Create an erotic boudoir scene with lingerie or strategic covering, partial nudity, intimate posing, and strong adult tension, while keeping genitals covered.',
  3: 'Create an explicitly nude adult scene with a direct erotic pose, visible mature anatomy, confident eye contact, and a clearly readable body silhouette.',
  4: 'Create a highly explicit consensual adult scene with fully visible mature anatomy, proactive erotic body language, close intimate staging, and physically coherent contact.',
  5: 'Use maximum consensual adult intensity: full nudity, fully visible mature anatomy, an unmistakable sexual pose, close direct staging, and visible sexual fluids only when the described action implies climax. Do not soften the scene into glamour or lingerie.',
};

const CATEGORY_PROMPTS: Record<CompanionCategory, string> = {
  female: 'An adult woman age 25 or older with a feminine face, natural breasts, a narrow waist, rounded hips, and an anatomically correct visible vulva and vaginal opening in nude scenes.',
  male: 'An adult man age 25 or older with a masculine face, broad shoulders, a defined torso, and coherent external male genital anatomy, including an anatomically correct large penis and testicles in nude scenes, with visible semen only when the action implies ejaculation.',
  transgender: 'An adult transgender woman age 25 or older with a feminine face, developed breasts, a narrow waist, rounded hips, and coherent external male genital anatomy, including an anatomically correct large penis and testicles in nude scenes, with visible semen only when the action implies ejaculation.',
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
    'Show one anatomically consistent consenting adult with a clear face, hands, torso, and pelvis.',
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

export function loraUsageZh(lora: { id?: string; label?: string; filename?: string; category?: string; usage?: string }): string {
  const identity = `${lora.id || ''} ${lora.label || ''} ${lora.filename || ''}`.toLowerCase();
  if (/transgender/.test(identity)) return '跨性别身体：稳定乳房、女性曲线与男性生殖特征同时存在；建议强度 0.5-0.7。';
  if (/anime[-_ ]?2d|2d.*anime/.test(identity)) return '二次元 2D：用于线稿、赛璐璐上色和动漫五官；不要与写实或 3D LoRA 同用。';
  if (/anime[-_ ]?3d|3d.*anime|3d cgi/.test(identity)) return '二次元 3D：用于 CGI 角色建模、PBR 材质、发丝和电影灯光；不要与 2D LoRA 同用。';
  if (/curvy|pear|pawg|breast/.test(identity)) return '女性身材：强化自然乳房、腰臀曲线或丰满体型；建议强度 0.45-0.65。';
  if (/athletic|muscular|male.*body/.test(identity)) return '男性身材：强化肩背、胸腹肌和成年男性体型；建议强度 0.45-0.65。';
  if (/pose.*nsfw|nsfw.*pose|dynamic/.test(identity)) return '成人动作：增强姿势、肢体接触和镜头可读性；需配合动作描述，建议强度 0.4-0.65。';
  if (/ahegao/.test(identity)) return '成人表情：强化阿黑颜面部表情；容易过度变形，建议低强度 0.3-0.5。';
  if (/lingerie/.test(identity)) return '服装：生成内衣造型与对应裸露范围；建议强度 0.45-0.7。';
  if (/bunny/.test(identity)) return '服装：生成兔女郎服装、丝袜和配饰；建议强度 0.45-0.7。';
  if (/maid/.test(identity)) return '服装：生成女仆装、围裙和配饰；建议强度 0.45-0.7。';
  if (/bikini/.test(identity)) return '服装：生成比基尼及泳装轮廓；建议强度 0.45-0.7。';
  if (/latex|bondage/.test(identity)) return '服装：生成乳胶或束缚主题服装；注意与姿势 LoRA 的总强度。';
  if (/school|uniform/.test(identity)) return '服装：生成成年角色的学院风制服；提示词必须明确角色年龄 25 岁以上。';
  if (/hand/.test(identity)) return '细节修复：改善手指数量、关节和手部清晰度；建议强度 0.3-0.5。';
  if (/skin.*plastic|nplastic|no.?plastic/.test(identity)) return '皮肤修复：减少塑料感和蜡感，保留自然毛孔与肤质；建议强度 0.3-0.5。';
  if (/skin|detail|upgrader/.test(identity)) return '细节增强：改善皮肤、面部和局部纹理；建议低强度 0.3-0.55。';
  if (/photoreal|realistic adult/.test(identity)) return '写实风格：增强真实摄影质感与成年人物表现；不要与动漫 LoRA 同用。';
  if (/cinematic/.test(identity)) return '电影风格：增强构图、景深和电影灯光；适合写实或 3D 场景。';
  if (/hyperreal|aidma/.test(identity)) return '超写实风格：增强真实材质和高细节；强度过高可能产生锐化或塑料感。';
  if (lora.usage && !lora.usage.startsWith('同步盘已验证文件')) return lora.usage;
  const category = String(lora.category || '');
  const map: Record<string, string> = {
    body: '身材控制：调整成年人物身体比例；建议强度 0.45-0.65。',
    action: '成人动作控制：调整姿势和镜头；需配合对应动作描述，建议强度 0.4-0.7。',
    outfit: '服装控制：改变服装或裸露方式；与身材 LoRA 同用时降低总强度。',
    detail: '细节增强：改善皮肤、面部或局部结构；建议强度 0.3-0.55。',
    style: '画风控制：改变整体视觉风格；不要叠加互相冲突的风格 LoRA。',
    prop: '道具控制：增加指定物件或主题场景；需在提示词中写出对应道具。',
  };
  return map[category] || '用途尚未识别：请根据模型页面的触发词，以 0.4 强度开始测试。';
}
