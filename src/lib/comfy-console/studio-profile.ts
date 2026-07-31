import type { CompanionCategory } from '@/lib/companion-category';
import { getCatalogLoraById } from '@/lib/comfy-console/lora-catalog';
import { isLoraInstalled } from '@/lib/runpod-loras';

export type AnimeRenderStyle = 'realistic' | '2d' | '3d';
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
    female: 'She has clearly visible, consensual intercourse with another unmistakably adult partner; the requested sexual position and body contact are anatomically coherent and fully readable.',
    male: 'He has clearly visible, consensual intercourse with another unmistakably adult partner; the requested sexual position and body contact are anatomically coherent and fully readable.',
    transgender: 'She has clearly visible, consensual intercourse with another unmistakably adult partner; her established feminine identity and anatomy remain consistent and the requested sexual position is fully readable.',
    anime: 'The unmistakably adult character has clearly visible, consensual intercourse with another unmistakably adult partner, with mature stylized anatomy and coherent body contact.',
  },
};

const CATEGORY_SUBJECTS: Record<CompanionCategory, string> = {
  female: 'The subject is a consenting adult woman age 25 or older with a feminine face, natural breasts, a narrow waist, rounded hips, and female anatomy.',
  male: 'The subject is a consenting adult man age 25 or older with a masculine face, broad shoulders, a defined torso, and male anatomy.',
  transgender: 'The subject is a consenting adult transgender woman age 25 or older with a feminine face, developed breasts, a narrow waist, rounded hips, a large penis, and testicles.',
  anime: 'The subject is an unmistakably adult anime character age 25 or older with mature proportions and coherent stylized anatomy.',
};

const RENDER_PROMPTS: Record<AnimeRenderStyle, string> = {
  'realistic': 'Photograph it as a candid real-camera editorial frame with neutral white balance and accurate, varied skin tones. Use restrained saturation, gentle highlight roll-off, readable shadow detail, practical or window light, real fabric texture and moderate depth of field. Keep a relaxed asymmetrical posture with believable weight, a subtle micro-expression, natural gaze, and hands resting on or interacting with the environment. Preserve pores, fine facial texture and small human imperfections without beauty filtering or cinematic teal-magenta grading.',
  '2d': 'Render it as a high-resolution 2D anime frame with clean line art, consistent cel shading, expressive eyes, and no photographic or 3D elements.',
  '3d': 'Render it as a high-resolution 3D animated film frame with a coherent modeled character, PBR materials, detailed hair, and cinematic lighting, with no flat line art.',
};

function compactIdentity(identity?: string): string {
  const clean = String(identity || '').replace(/\s+/g, ' ').trim();
  return clean
    ? ' This is the same established character in every image. Preserve exactly these identity details: ' + clean.slice(0, 420) + '. Do not replace them with a generic face or body.'
    : '';
}

function compactScene(scene?: string): string {
  const clean = String(scene || '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 320) return 'The scene takes place on a modern sofa in a private living room.';
  return `The scene direction is: ${clean.replace(/[.]+$/, '')}.`;
}

export type StudioPromptSections = {
  identity: string;
  scene: string;
  exposureAndAction: string;
  composition: string;
  quality: string;
};

export function buildStudioPromptSections(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  scene?: string;
  identity?: string;
}): StudioPromptSections {
  const composition = input.intensity >= 4
    ? 'Use a readable head-to-knee or full-body composition that keeps every participating adult face identifiable, the complete action visible, hands and contact points anatomically coherent, and the camera angle free of accidental obstruction.'
    : input.intensity === 3
      ? 'Use a candid head-to-knee or full-body view with the complete head, face, torso and pelvis in frame; keep both hands visible, weight distribution natural and anatomy unobstructed.'
      : input.category === 'transgender'
        ? 'Use a relaxed three-quarter view that clearly preserves her feminine face, chest, waist and hips without a centered mannequin pose or an ambiguous body silhouette.'
        : 'Keep the pose readable with relaxed shoulders, natural weight distribution, expressive eye contact and an unforced candid moment.';
  return {
    identity: CATEGORY_SUBJECTS[input.category] + compactIdentity(input.identity),
    scene: compactScene(input.scene),
    exposureAndAction: INTENSITY_ACTIONS[input.intensity][input.category],
    composition,
    quality: RENDER_PROMPTS[input.animeStyle || 'realistic'],
  };
}

export function buildStudioPromptEnhancement(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  scene?: string;
  identity?: string;
}): string {
  const sections = buildStudioPromptSections(input);
  return [
    sections.identity,
    sections.scene,
    sections.exposureAndAction,
    sections.composition,
    sections.quality,
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
    5: '明确性交动作 · 仅限自愿成年角色',
  } as const)[intensity];
}

export function studioNegativePrompt(category: CompanionCategory, animeStyle: AnimeRenderStyle = 'realistic'): string {
  const shared = 'score_4, score_5, score_6, worst quality, low quality, blur, soft focus, motion blur, excessive film grain, chromatic noise, jpeg artifacts, low resolution, oversaturated, neon color cast on skin, magenta skin, cyan skin, orange skin, teal-orange grading, crushed blacks, blown highlights, HDR halo, excessive contrast, beauty filter, airbrushed skin, plastic skin, waxy face, uncanny valley, doll-like face, synthetic eyes, dead eyes, mannequin pose, frozen gesture, rigid symmetry, perfectly centered symmetry, mirrored limbs, floating hands, disconnected contact with props, over-smoothed skin, vacant expression, cropped head, head out of frame, headless body, cut-off face, child, teen, underage, childlike face, adolescent features, ambiguous adult age, duplicate person, extra limbs, fused anatomy, malformed hands, malformed genitals';
  const anatomy = category === 'transgender'
    ? 'cisgender woman, vagina, flat chest, cropped pelvis, genital area out of frame, duplicated genitals, detached genitals, male-only silhouette, caricature, fetish stereotype'
    : category === 'male'
      ? 'woman, female body, feminine breasts, vagina, transgender woman, feminine silhouette, narrow female shoulders, broken pelvis, bad anatomy'
      : category === 'female'
        ? 'man, male body, penis, testicles, transgender woman, masculine face, broad masculine torso, broken pelvis, bad anatomy'
        : 'broken pelvis, bad anatomy';
  const style = animeStyle === '2d'
    ? 'photorealistic, photograph, 3d render, plastic CGI, muddy line art'
    : animeStyle === '3d'
      ? 'flat 2d drawing, sketch, broken mesh, wax figure, low-poly model'
      : 'illustration, anime, cartoon, CGI, 3d render';
  return shared + ', ' + anatomy + ', ' + style;
}

export function recommendedStudioLoras(
  category: CompanionCategory,
  animeStyle: AnimeRenderStyle = 'realistic',
): Array<{ id: string; strength: number; reasonZh: string }> {
  const subjectCategory = category === 'anime' ? 'female' : category;
  const genderLoras = subjectCategory === 'transgender'
    ? [
        { id: 'detail-skin', strength: 0.28, reasonZh: '\u4ec5\u589e\u5f3a\u771f\u5b9e\u76ae\u80a4\u7ec6\u8282\uff0c\u4e0d\u5e72\u9884\u8de8\u6027\u522b\u8eab\u4f53\u7ed3\u6784' },
      ]
    : subjectCategory === 'male'
      ? [
          { id: 'body-masculine-flux', strength: 0.62, reasonZh: '\u5f3a\u5316\u6210\u5e74\u7537\u6027\u4f53\u578b\u4e0e\u89e3\u5256' },
          { id: 'detail-skin', strength: 0.36, reasonZh: '\u589e\u5f3a\u771f\u5b9e\u76ae\u80a4\u7ec6\u8282' },
        ]
      : [
          { id: 'body-curvy-flux', strength: 0.58, reasonZh: '\u5f3a\u5316\u6210\u5e74\u5973\u6027\u81ea\u7136\u66f2\u7ebf' },
          { id: 'detail-skin', strength: 0.36, reasonZh: '\u589e\u5f3a\u771f\u5b9e\u76ae\u80a4\u7ec6\u8282' },
        ];
  const styleLora = animeStyle === '2d'
    ? { id: 'style-anime-2d-flux', strength: 0.68, reasonZh: '\u7a33\u5b9a 2D \u7ebf\u7a3f\u4e0e\u8d5b\u7490\u7490\u4e0a\u8272' }
    : animeStyle === '3d'
      ? { id: 'style-anime-3d-flux', strength: 0.64, reasonZh: '\u7a33\u5b9a 3D \u52a8\u753b\u6750\u8d28\u4e0e\u89d2\u8272\u5efa\u6a21' }
      : null;
  if (!styleLora) return [genderLoras[0]];
  return [styleLora];
}

export type CategoryLoraControl = {
  id: string;
  filename: string;
  strength: number;
  triggerWords: string[];
  reasonZh: string;
};

export function resolveCategoryLoraControls(
  category: CompanionCategory,
  intensity: NsfwIntensity,
  animeStyle: AnimeRenderStyle = 'realistic',
): { selected: CategoryLoraControl[]; missing: Array<{ id: string; reasonZh: string }> } {
  const scale = studioLoraStrengthScale(intensity);
  const selected: CategoryLoraControl[] = [];
  const missing: Array<{ id: string; reasonZh: string }> = [];
  for (const recommendation of recommendedStudioLoras(category, animeStyle)) {
    const catalog = getCatalogLoraById(recommendation.id);
    if (!catalog?.filename || !isLoraInstalled(catalog.filename)) {
      missing.push({ id: recommendation.id, reasonZh: recommendation.reasonZh });
      continue;
    }
    selected.push({
      id: recommendation.id,
      filename: catalog.filename,
      strength: Number(Math.min(0.9, recommendation.strength * scale).toFixed(2)),
      triggerWords: catalog.trigger_words || [],
      reasonZh: recommendation.reasonZh,
    });
  }
  return { selected: selected.slice(0, 3), missing };
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
