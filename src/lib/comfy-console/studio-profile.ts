import type { CompanionCategory } from '@/lib/companion-category';
import { getCatalogLoraById } from '@/lib/comfy-console/lora-catalog';
import { fluxScenarioPlan } from '@/lib/model-lora-routing';
import { isLoraInstalled } from '@/lib/runpod-loras';

export type AnimeRenderStyle = 'realistic' | '2d' | '3d';
export type NsfwIntensity = 1 | 2 | 3 | 4 | 5;

const INTENSITY_ACTIONS: Record<NsfwIntensity, Record<CompanionCategory, string>> = {
  1: {
    female: 'She wears an everyday sexy outfit and shares a relaxed, flirtatious moment; her nipples and vulva remain covered.',
    male: 'He wears an everyday sexy outfit and shares a relaxed, flirtatious moment; his genitals remain covered.',
    transgender: 'She wears an everyday sexy outfit and shares a relaxed, flirtatious moment; her nipples and genitals remain covered.',
    anime: 'The adult character wears an everyday sexy outfit and poses flirtatiously with nipples and genitals covered.',
  },
  2: {
    female: 'She wears sensual lingerie, a sheer nightdress, or an adult fantasy costume and poses seductively; her genitals remain covered and there is no sexual act.',
    male: 'He wears fitted underwear, sleepwear, or an adult fantasy costume and poses seductively; his genitals remain covered and there is no sexual act.',
    transgender: 'She wears sensual lingerie, a sheer nightdress, or an adult fantasy costume and poses seductively; her genitals remain covered and there is no sexual act.',
    anime: 'The adult character wears lingerie, nightwear, or an adult fantasy costume and poses seductively with genitals covered and no sexual act.',
  },
  3: {
    female: 'She poses fully nude, bare natural breasts and exposed vulva clearly visible, full frontal nude body, no clothing, without performing a sexual act.',
    male: 'He poses fully nude with his muscular torso, large penis, and testicles clearly visible, without performing a sexual act.',
    transgender: 'She poses fully nude with developed breasts, feminine curves, a large penis, and testicles clearly visible, without performing a sexual act.',
    anime: 'The adult character poses fully nude, mature bare breasts and exposed stylized vulva clearly visible, full nude figure, no clothing, without performing a sexual act.',
  },
  4: {
    female: 'Solo masturbation scene, she spreads her clearly visible bare vulva with her fingers, fully nude, legs wide open, before climax and without visible sexual fluids.',
    male: 'He masturbates his clearly visible large penis, before climax and without visible semen.',
    transgender: 'She masturbates her clearly visible large penis while her developed breasts and feminine curves remain in frame, pelvis and contact points visible in a physically stable pose, before climax and without visible semen.',
    anime: 'The adult character performs clearly visible solo masturbation, bare vulva spread by fingers, completely nude, before climax and without visible sexual fluids.',
  },
  5: {
    female: 'Clear consensual intercourse, completely nude adult woman with an unmistakably adult partner, a mature man, visible penetration, bare breasts and spread vulva clearly visible, naked bodies fully visible, coherent anatomy through to climax.',
    male: 'He engages in clear consensual intercourse with another unmistakably adult partner; his large penis and testicles remain visible, and the requested act through to climax with any visible semen are anatomically coherent and fully readable.',
    transgender: 'She engages in clear consensual intercourse with another unmistakably adult partner; her developed breasts, feminine curves, large penis, and testicles remain visible and consistent, and the requested act through to climax with any visible semen are fully readable.',
    anime: 'The unmistakably adult character engages in clear consensual intercourse with an unmistakably adult partner, completely nude, mature bare breasts and stylized vulva visible, penetration clearly shown, coherent anatomy through to climax.',
  },
};

const CATEGORY_SUBJECTS: Record<CompanionCategory, string> = {
  female: 'The subject is a consenting adult woman age 25 or older with a feminine face, natural breasts, a narrow waist, rounded hips, and female anatomy.',
  male: 'The subject is a consenting adult man age 25 or older with a masculine face, broad shoulders, a defined torso, and male anatomy.',
  transgender: 'The subject is a consenting adult transgender woman age 25 or older with a feminine face, developed breasts, a narrow waist, rounded hips, a large penis, and testicles.',
  anime: 'The subject is an unmistakably adult anime character age 25 or older with mature proportions and coherent stylized anatomy.',
};

const RENDER_PROMPTS: Record<AnimeRenderStyle, string> = {
  'realistic': 'real camera photograph, neutral skin tone, natural skin, practical soft light, relaxed posture, natural hands, sharp focus',
  // 2D uplift：强力注入 danbooru/Mix-SFW 体系下 Illustrious / Anything / Counterfeit
  // 等动漫模型训练时最敏感的质量 token。这些 token 在训练集中跟"精致"+"高细节
  // 图像的强绑定，prompt 里出现就能直接拉高模型对细节/线条/色彩的优先级。
  // 同时保持 FLUX-friendly 的英文描述，让 anime-LoRA + quality tag 协同发力。
  '2d': '2D anime illustration, masterpiece, best quality, very aesthetic, absurdres, highres, official art, anime key visual, fully colored finished artwork, vibrant cel shading, clean lineart, sharp linework, vivid saturated colors, detailed expressive eyes, beautiful detailed face, intricate details, studio quality, professional artwork',
  // 3D uplift: anti-2D drift. Default FLUX 3D LoRA is light; if not installed
  // the worker falls back to vanilla realistic, which the user reads as
  // "3D broken". Reinforce the 3D vocabulary in the prompt itself so the
  // render still reads as 3D even without the dedicated LoRA.
  '3d': '3D character render, octane render, blender cycles, PBR materials, subsurface scattering, studio three-point lighting, cinematic depth of field, sharp focus, ultra detailed',
};

function compactIdentity(identity?: string): string {
  const clean = String(identity || '').replace(/\s+/g, ' ').trim();
  return clean
    ? ` Same established character: ${clean.slice(0, 240)}.`
    : '';
}

function compactScene(scene?: string): string {
  const clean = String(scene || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'A believable lived-in private setting.';
  return clean.replace(/[.]+$/, '') + '.';
}

export function compactFluxPrompt(value: string, maxCharacters = 650): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  // Deduplicate whole sentences only, preserving deliberate repetition inside
  // a sentence (e.g. "large penis" appearing in both identity and action).
  const sentences = normalized.split(/(?<=[.!?])\s+/).filter(Boolean);
  const seen = new Set<string>();
  const unique = sentences.filter((sentence) => {
    const key = sentence.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const rebuilt = unique.join(' ');
  if (rebuilt.length <= maxCharacters) return rebuilt;
  const clipped = rebuilt.slice(0, maxCharacters + 1);
  const boundary = Math.max(clipped.lastIndexOf('. '), clipped.lastIndexOf(', '), clipped.lastIndexOf(' '));
  const end = boundary > Math.floor(maxCharacters * 0.7) ? boundary : maxCharacters;
  return clipped.slice(0, end).replace(/[,. ]+$/, '').trim() + '.';
}
export function studioPromptSatisfiesIntensity(prompt: string, intensity: NsfwIntensity): boolean {
  const value = String(prompt || '').toLowerCase();
  const contracts: Record<NsfwIntensity, RegExp[]> = {
    1: [/everyday sexy outfit/, /covered/],
    2: [/(lingerie|nightdress|sleepwear|fantasy costume)/, /no sexual act/, /covered/],
    3: [/fully nude/, /clearly visible/, /without performing a sexual act/],
    4: [/masturbat/, /clearly visible/, /before climax/],
    5: [/(consensual sex|consensual intercourse)/, /unmistakably adult partner/, /climax/],
  };
  return contracts[intensity].every((contract) => contract.test(value));
}

export function ensureStudioFluxPrompt(input: {
  prompt: string;
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  identity?: string;
}): string {
  if (studioPromptSatisfiesIntensity(input.prompt, input.intensity)) {
    return compactFluxPrompt(input.prompt);
  }
  return compactFluxPrompt(buildStudioPromptEnhancement({
    category: input.category,
    intensity: input.intensity,
    animeStyle: input.animeStyle,
    scene: input.prompt,
    identity: input.identity,
  }));
}
export function studioIntensityDirection(category: CompanionCategory, intensity: NsfwIntensity): string {
  return INTENSITY_ACTIONS[intensity][category];
}

export type StudioPromptSections = {
  identity: string;
  scene: string;
  exposureAndAction: string;
  composition: string;
  quality: string;
};

// Authored framing cues win over the intensity-default composition. The old
// unconditional "medium shot, chest and face clearly visible" prefix fought
// user-authored full-body/standing-pose scenes and dragged FLUX back into a
// half-body crop. Only explicit shot language matches — quality boilerplate
// like "full body clearly illuminated" must NOT trigger a framing override.
const AUTHORED_FRAMING_CUES: Array<{ pattern: RegExp; cue: string }> = [
  { pattern: /(close-?up|headshot|face only|extreme close|特写)/i, cue: 'close-up portrait, face and shoulders visible' },
  { pattern: /(half[- ]body|upper body|waist up|waist-up|bust shot|半身)/i, cue: 'half-body shot, waist up visible' },
  { pattern: /(head to knees|thighs? up|medium full[- ]body)/i, cue: 'medium full-body shot, head to knees visible' },
  { pattern: /(full[- ]body shot|full[- ]body view|full[- ]body portrait|head to toe|head-to-toe|whole body|entire body|全身|立绘)/i, cue: 'full-body shot, head to toe visible' },
  { pattern: /(wide shot|long shot|distant view|full scene|远景)/i, cue: 'wide long shot, subject fully in frame with environment' },
];

export function detectAuthoredFraming(scene?: string): string {
  const value = String(scene || '');
  if (!value) return '';
  for (const { pattern, cue } of AUTHORED_FRAMING_CUES) {
    if (pattern.test(value)) return cue;
  }
  return '';
}

export function buildStudioPromptSections(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  scene?: string;
  identity?: string;
  framing?: string;
}): StudioPromptSections {
  const composition = input.framing ||
    detectAuthoredFraming(input.scene) ||
    (input.intensity >= 3 ? 'medium full-body shot, head to knees visible' : 'medium shot, chest and face clearly visible in a relaxed natural framing');
  return {
    identity: input.identity
      ? `${CATEGORY_SUBJECTS[input.category]}${compactIdentity(input.identity)}`
      : CATEGORY_SUBJECTS[input.category],
    scene: compactScene(input.scene),
    exposureAndAction: studioIntensityDirection(input.category, input.intensity),
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
  framing?: string;
}): string {
  const sections = buildStudioPromptSections(input);
  return compactFluxPrompt([
    sections.composition,
    sections.identity,
    sections.exposureAndAction,
    sections.scene,
    sections.quality,
  ].join(', '), 950);
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
  // 2026-08: 在原来 anti-blur / anti-anatomy / anti-cross-style 基础上加了
  // 显式的 anti-close-up（no headshot / no extreme close-up / no face-only），
  // 防止 bust-up 取景被 FLUX 拉回头像特写。同时收紧"模糊 / 噪点"措辞。
  const shared = 'child, teen, underage, young-looking, low resolution, blur, blurred, fuzzy, hazy, noisy, film grain, jpeg artifacts, compression artifacts, soft focus, out of focus, deformed anatomy, extra limbs, fused hands, malformed hands, duplicate person, cropped head, cropped feet, rigid pose, plastic skin, oversaturated skin, text, watermark, headshot, extreme close-up, face-only crop, tight head crop';
  const anatomy = category === 'transgender'
    ? 'cisgender woman, vagina, flat chest, duplicated genitals, detached genitals, caricature'
    : category === 'male'
      ? 'woman, feminine breasts, vagina, transgender woman'
      : category === 'female'
        ? 'man, penis, testicles, transgender woman, masculine face'
        : 'broken pelvis';
  // Stronger cross-style breakers so 2D doesn't drift into watercolor /
  // unfinished sketch, and 3D doesn't drift into flat illustration when the
  // dedicated LoRA isn't installed on the endpoint.
  const style = animeStyle === '2d'
    ? 'photorealistic, photograph, 3d render, plastic CGI, muddy line art, line art only, sketch only, unfinished sketch, monochrome, grayscale, coloring book, watercolor, oil painting, soft shading, low detail'
    : animeStyle === '3d'
      ? 'flat 2d drawing, sketch, broken mesh, wax figure, low-poly model, illustration, anime, cartoon, watercolor, cel shading, line art, 2d flat shading, painterly'
      : 'illustration, anime, cartoon, CGI, 3d render';
  return shared + ', ' + anatomy + ', ' + style;
}

/** Catalog mapping for the curated FLUX scenario plans (全站 FLUX 重构). */
const FLUX_LORA_CATALOG: Record<string, { id: string; reasonZh: string }> = {
  'flux_style_photoreal_v1.safetensors': { id: 'flux-style-photoreal-v1', reasonZh: '写实质感主力：增强真实摄影光影与皮肤质感。' },
  'flux_detail_skin_v1.safetensors': { id: 'flux-detail-skin-v1', reasonZh: '自然皮肤微细节，降低 AI 塑料感；不用于头像或三视图。' },
  'flux_detail_hands_v1.safetensors': { id: 'flux-detail-hands-v1', reasonZh: '手部结构修正；高强度场景含手部可见时必挂。' },
  'flux_lewd_v1.safetensors': { id: 'flux-lewd-v1', reasonZh: '通用 NSFW 增强；强度 ≥3 时与姿势/服装 LoRA 叠加。' },
  'flux_pose_nsfw_dynamic_v1.safetensors': { id: 'flux-pose-nsfw-dynamic-v1', reasonZh: '成人动态姿势：增强动作与接触关系，避免高强度破坏身份。' },
  'flux_male_masc_v1.safetensors': { id: 'flux-male-masc-v1', reasonZh: '男体写实主力：稳定男性化五官与体型。' },
  'flux_male_muscle_v1.safetensors': { id: 'flux-male-muscle-v1', reasonZh: '肌肉线条增强：男性健身体型力量感。' },
  'realistic-mtf-trans.safetensors': { id: 'flux-mtf-trans-v1', reasonZh: 'MTF 跨性别写实：女性化面部与男性特征稳定共存。' },
  'rdanimefluxv1rapid.safetensors': { id: 'flux-anime-v1', reasonZh: '二次元动漫画风主力：线稿与赛璐璐上色。' },
  'flux_3d_render_v1.safetensors': { id: 'flux-3d-render-v1', reasonZh: '3D 渲染风格：PBR 材质与电影灯光。' },
  'flux_outfit_lingerie_v1.safetensors': { id: 'flux-outfit-lingerie-v1', reasonZh: '内衣穿搭 LoRA：仅控制服装，不改变人物身份。' },
  'flux_outfit_bikini_v1.safetensors': { id: 'flux-outfit-bikini-v1', reasonZh: '泳装穿搭 LoRA：仅控制服装，不改变人物身份。' },
  'flux_outfit_latex_v1.safetensors': { id: 'flux-outfit-latex-v1', reasonZh: '乳胶/胶衣穿搭 LoRA：仅控制服装，不改变人物身份。' },
};

/** Catalog mapping for the curated SDXL (Pony / Illustrious) volume-verified LoRAs. */
const SDXL_LORA_CATALOG: Record<string, { id: string; reasonZh: string }> = {
  'pony_detailifier_v5.safetensors': { id: 'pony-detailifier-v5', reasonZh: 'Pony 细节主力：增强皮肤与五官微细节。' },
  'pony_mature_female_slider_v2.safetensors': { id: 'pony-mature-female-slider-v2', reasonZh: 'Pony 成熟女性滑块：稳定成熟曲线与年龄感。' },
  'pony_gender_transition_slider.safetensors': { id: 'pony-gender-transition-slider', reasonZh: 'Pony 跨性别滑块：女性曲线与男性特征共存。' },
  'pony_futa_style.safetensors': { id: 'pony-futa-style', reasonZh: 'Pony 扶她风格：高强度跨性别场景叠加。' },
  'BackgroundDetailerV3-000004.safetensors': { id: 'pony-background-detailer-v3', reasonZh: 'Pony 背景细节：增强场景与道具质感。' },
  'AddMicroDetails_Illustrious_v6.safetensors': { id: 'illustrious-micro-details-v6', reasonZh: 'Illustrious 微细节：增强线稿与皮肤质感。' },
  'StS-Illustrious-Detail-Slider-v1.0.safetensors': { id: 'illustrious-detail-slider-v1', reasonZh: 'Illustrious 细节滑块：整体细节增减。' },
  'illustrious_realism_slider_v1.safetensors': { id: 'illustrious-realism-slider-v1', reasonZh: 'Illustrious 写实滑块：2D 插画向真实质感靠拢。' },
  'illustrious_nsfw_slider_v1.safetensors': { id: 'illustrious-nsfw-slider-v1', reasonZh: 'Illustrious NSFW 滑块：强度 ≥3 场景叠加。' },
};

/** SDXL 矩阵场景计划：按底模家族 + 类别 + 强度生成 LoRA 推荐。 */
export function sdxlScenarioPlan(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  family: 'pony' | 'illustrious';
}): Array<{ name: string; strength: number }> {
  const { category, intensity, family } = input;
  if (family === 'illustrious') {
    const plan = [
      { name: 'illustrious_realism_slider_v1.safetensors', strength: 0.5 },
      { name: 'AddMicroDetails_Illustrious_v6.safetensors', strength: 0.35 },
    ];
    if (intensity >= 3) plan.push({ name: 'illustrious_nsfw_slider_v1.safetensors', strength: 0.45 });
    return plan;
  }
  const plan: Array<{ name: string; strength: number }> = [];
  if (category === 'transgender') plan.push({ name: 'pony_gender_transition_slider.safetensors', strength: 0.5 });
  else if (category !== 'male') plan.push({ name: 'pony_mature_female_slider_v2.safetensors', strength: 0.5 });
  plan.push({ name: 'pony_detailifier_v5.safetensors', strength: 0.4 });
  if (category === 'transgender' && intensity >= 4) plan.push({ name: 'pony_futa_style.safetensors', strength: 0.4 });
  return plan;
}

export function recommendedStudioLoras(
  category: CompanionCategory,
  animeStyle: AnimeRenderStyle = 'realistic',
  intensity: NsfwIntensity = 1,
  modelFamily: string = 'flux',
): Array<{ id: string; strength: number; reasonZh: string }> {
  // SDXL 矩阵分支：路由到 Pony / Illustrious 时消费 SDXL 卷上已验证 LoRA。
  if (modelFamily === 'pony' || modelFamily === 'illustrious') {
    return sdxlScenarioPlan({ category, intensity, family: modelFamily })
      .map((item) => {
        const meta = SDXL_LORA_CATALOG[item.name];
        return meta ? { id: meta.id, strength: item.strength, reasonZh: meta.reasonZh } : null;
      })
      .filter((item): item is { id: string; strength: number; reasonZh: string } => item !== null)
      .slice(0, 3);
  }
  // 全站统一 FLUX：推荐面板直接消费精编场景计划表，
  // 覆盖女性/男性/跨性别/2D/3D 全部 SFW/NSFW 场景。
  return fluxScenarioPlan({ category, intensity, animeStyle })
    .map((item) => {
      const meta = FLUX_LORA_CATALOG[item.name];
      return meta ? { id: meta.id, strength: item.strength, reasonZh: meta.reasonZh } : null;
    })
    .filter((item): item is { id: string; strength: number; reasonZh: string } => item !== null)
    .slice(0, 3);
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
  for (const recommendation of recommendedStudioLoras(category, animeStyle, intensity)) {
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
  return map[category] || '当前模型兼容的画面增强 LoRA；请结合下方触发词，从 0.4 强度开始测试。';
}
