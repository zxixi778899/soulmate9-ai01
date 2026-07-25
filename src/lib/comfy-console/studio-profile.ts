import type { CompanionCategory } from '@/lib/companion-category';

export type AnimeRenderStyle = '2d' | '3d';
export type NsfwIntensity = 1 | 2 | 3 | 4 | 5;

const INTENSITY_ACTIONS: Record<NsfwIntensity, Record<CompanionCategory, string>> = {
  1: {
    female: 'She remains fully clothed and poses flirtatiously without exposing her breasts or vulva.',
    male: 'He remains fully clothed and poses flirtatiously without exposing his penis.',
    transgender: 'She remains fully clothed and poses flirtatiously without exposing her breasts or penis.',
    anime: 'The adult character remains fully clothed and poses flirtatiously without exposed nipples or genitals.',
  },
  2: {
    female: 'She wears lingerie, reveals part of her breasts, and slowly touches her body while keeping her vulva covered.',
    male: 'He wears low underwear, reveals his chest, and slowly touches his body while keeping his penis covered.',
    transgender: 'She wears lingerie, reveals her breasts, and slowly touches her body while keeping her penis covered.',
    anime: 'The adult character wears revealing underwear and touches their body while nipples and genitals remain covered.',
  },
  3: {
    female: 'She poses fully nude with her natural breasts and vulva clearly visible, without performing a sexual act.',
    male: 'He poses fully nude with his muscular torso, large penis, and testicles clearly visible, without performing a sexual act.',
    transgender: 'She poses fully nude with developed breasts, feminine curves, a large penis, and testicles clearly visible, without performing a sexual act.',
    anime: 'The adult character poses fully nude with mature stylized anatomy clearly visible, without performing a sexual act.',
  },
  4: {
    female: 'She masturbates with one hand on her clearly visible vulva, before climax and without visible sexual fluids.',
    male: 'He masturbates his clearly visible large penis, before climax and without visible semen.',
    transgender: 'She masturbates her clearly visible large penis while her developed breasts and feminine curves remain in frame, before climax and without visible semen.',
    anime: 'The adult character performs clearly visible solo masturbation, before climax and without visible sexual fluids.',
  },
  5: {
    female: 'She masturbates to climax with her natural breasts and vulva clearly visible and a small amount of anatomically coherent sexual fluid.',
    male: 'He masturbates his large penis to climax with his masculine body, testicles, and visible semen clearly shown.',
    transgender: 'She masturbates her large penis to climax while her developed breasts and feminine curves remain clearly visible, with visible semen shown coherently.',
    anime: 'The adult character performs explicit solo masturbation to climax with mature stylized anatomy and restrained visible sexual fluids.',
  },
};

const CATEGORY_SUBJECTS: Record<CompanionCategory, string> = {
  female: 'The subject is a consenting adult woman age 25 or older with a feminine face, natural breasts, a narrow waist, rounded hips, and female anatomy.',
  male: 'The subject is a consenting adult man age 25 or older with a masculine face, broad shoulders, a defined torso, and male anatomy.',
  transgender: 'The subject is a consenting adult transgender woman age 25 or older with a feminine face, developed breasts, a narrow waist, rounded hips, a large penis, and testicles.',
  anime: 'The subject is an unmistakably adult anime character age 25 or older with mature proportions and coherent stylized anatomy.',
};

const RENDER_PROMPTS: Record<AnimeRenderStyle, string> = {
  '2d': 'Render it as a high-resolution 2D anime frame with clean line art, consistent cel shading, expressive eyes, and no photographic or 3D elements.',
  '3d': 'Render it as a high-resolution 3D animated film frame with a coherent modeled character, PBR materials, detailed hair, and cinematic lighting, with no flat line art.',
};

function compactScene(scene?: string): string {
  const clean = String(scene || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 320) return 'The scene takes place on a modern sofa in a private living room.';
  return `The scene direction is: ${clean.replace(/[.]+$/, '')}.`;
}

export function buildStudioPromptEnhancement(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  scene?: string;
}): string {
  const quality = input.category === 'anime'
    ? RENDER_PROMPTS[input.animeStyle || '2d']
    : 'Capture it as a sharp high-resolution 4K real photograph with natural skin texture, realistic anatomy, and soft cinematic light.';
  return [
    CATEGORY_SUBJECTS[input.category],
    compactScene(input.scene),
    INTENSITY_ACTIONS[input.intensity][input.category],
    quality,
  ].join(' ');
}

export function studioLoraStrengthScale(intensity: NsfwIntensity): number {
  return ({ 1: 0.72, 2: 0.84, 3: 0.96, 4: 1.08, 5: 1.18 } as const)[intensity];
}

export function studioIntensityLabel(intensity: NsfwIntensity): string {
  return ({
    1: '完整穿着 · 挑逗姿势 · 不露点',
    2: '内衣局部裸露 · 生殖器遮挡',
    3: '全裸展示 · 无性行为',
    4: '明确自慰 · 未高潮 · 无体液',
    5: '自慰高潮 · 对应身体特征与体液',
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
