/**
 * ComfyUI 控制台「分类提示词预设」库
 * - 分类：服装 / 背景 / 光线 / 动作(SFW) / 动作(NSFW) / 风格 / 负向-画质 / 负向-结构
 * - 中文标签显示；点击后「追加 / 再点移除」组合到当前提示词或负向提示词
 * - 不同工作台（工作流）按功能侧重排序：如 wf-outfit 优先服装、wf-scene 优先背景/光线
 */

export type PromptCategoryKey =
  | 'outfit'
  | 'background'
  | 'lighting'
  | 'action_sfw'
  | 'action_nsfw'
  | 'style'
  | 'neg_quality'
  | 'neg_anatomy';

export type PromptCategoryPreset = {
  key: PromptCategoryKey;
  zh: string;
  target: 'prompt' | 'negative';
  nsfw?: boolean;
  items: Array<{ label: string; text: string }>;
};

export const PROMPT_CATEGORY_PRESETS: PromptCategoryPreset[] = [
  // ── 服装 ─────────────────────────────────────────────────
  {
    key: 'outfit',
    zh: '服装',
    target: 'prompt',
    items: [
      { label: '日常便装', text: 'casual everyday outfit, soft knit top and fitted jeans' },
      { label: '职场西装', text: 'tailored business suit, crisp blouse, elegant office attire' },
      { label: '晚礼服', text: 'elegant evening gown, flowing fabric, glamorous formal attire' },
      { label: '运动装', text: 'sporty athleisure outfit, fitted tank top and leggings' },
      { label: '内衣', text: 'sheer lace lingerie set, matching bra and panties' },
      { label: '泳装', text: 'bikini swimwear, minimal coverage' },
      { label: '乳胶衣', text: 'glossy latex outfit, tight shiny catsuit' },
      { label: '丝袜', text: 'sheer stockings with garter belt, high heels' },
      { label: '网袜', text: 'fishnet stockings, revealing outfit' },
      { label: '护士装', text: 'nurse roleplay uniform, short white dress, thigh-high stockings' },
      { label: '教师装', text: 'teacher roleplay outfit, pencil skirt and fitted blouse' },
      { label: '女仆装', text: 'french maid outfit, frilly apron and short skirt' },
      { label: '兔女郎', text: 'bunny girl costume, glossy bodysuit with ears and tail' },
      { label: '和服', text: 'traditional kimono, elegant patterned silk' },
      { label: '汉服', text: 'traditional hanfu, flowing layered silk robes' },
      { label: '婚纱', text: 'white wedding dress, delicate lace and tulle' },
    ],
  },
  // ── 背景 ─────────────────────────────────────────────────
  {
    key: 'background',
    zh: '背景',
    target: 'prompt',
    items: [
      { label: '摄影棚', text: 'clean neutral studio backdrop' },
      { label: '卧室', text: 'cozy bedroom, soft bedding' },
      { label: '客厅沙发', text: 'comfortable living room sofa' },
      { label: '酒店房间', text: 'luxury hotel room interior' },
      { label: '浴室', text: 'bright clean bathroom, soft steam' },
      { label: '海滩', text: 'sunny beach with ocean waves' },
      { label: '泳池', text: 'sparkling swimming pool' },
      { label: '花园', text: 'lush green garden with flowers' },
      { label: '森林', text: 'misty forest with sunlight filtering through' },
      { label: '都市夜景', text: 'neon-lit urban street at night' },
      { label: '咖啡馆', text: 'warm cozy cafe interior' },
      { label: '教室', text: 'empty school classroom' },
      { label: '办公室', text: 'modern office workspace' },
      { label: '天台日落', text: 'rooftop terrace at sunset' },
      { label: '雨夜街道', text: 'rainy city street at night' },
      { label: '雪山', text: 'snowy mountain landscape' },
      { label: '城堡', text: 'grand castle interior' },
    ],
  },
  // ── 光线 ─────────────────────────────────────────────────
  {
    key: 'lighting',
    zh: '光线',
    target: 'prompt',
    items: [
      { label: '自然光', text: 'soft natural daylight' },
      { label: '金色时刻', text: 'warm golden hour sunlight' },
      { label: '柔光棚拍', text: 'soft diffused studio lighting' },
      { label: '霓虹光', text: 'colorful neon glow lighting' },
      { label: '电影感光影', text: 'cinematic moody lighting, dramatic shadows' },
      { label: '烛光', text: 'warm flickering candlelight' },
      { label: '月光', text: 'soft cool moonlight' },
      { label: '晨光', text: 'gentle morning light through curtains' },
      { label: '逆光', text: 'dramatic backlighting with rim light' },
      { label: '侧光', text: 'soft side lighting' },
      { label: '低光', text: 'dim low-key lighting' },
      { label: '顶光', text: 'overhead soft light' },
    ],
  },
  // ── 动作 SFW ─────────────────────────────────────────────
  {
    key: 'action_sfw',
    zh: '动作 SFW',
    target: 'prompt',
    items: [
      { label: '站姿', text: 'confident standing pose, natural weight shift' },
      { label: '坐姿', text: 'relaxed sitting pose, legs crossed' },
      { label: '躺姿', text: 'lying down pose, propped on one elbow' },
      { label: '走姿', text: 'natural walking pose, caught mid-step' },
      { label: '跳舞', text: 'dynamic dancing pose, flowing movement' },
      { label: '回眸', text: 'looking back over the shoulder, candid gaze' },
      { label: '倚靠', text: 'leaning against a wall, relaxed posture' },
      { label: '伸手', text: 'reaching out a hand toward the viewer' },
      { label: '微笑', text: 'gentle warm smile, soft eye contact' },
      { label: '害羞', text: 'shy coy expression, blushing slightly' },
      { label: '拥抱', text: 'hugging pose, arms wrapped around' },
      { label: '阅读', text: 'reading a book, focused expression' },
    ],
  },
  // ── 动作 NSFW ────────────────────────────────────────────
  {
    key: 'action_nsfw',
    zh: '动作 NSFW',
    target: 'prompt',
    nsfw: true,
    items: [
      { label: '巨大胸', text: 'huge natural breasts, prominent cleavage, full exposed chest' },
      { label: '巨大阴茎', text: 'large erect penis, prominent male anatomy clearly visible' },
      { label: '后入式', text: 'doggy style penetration from behind, arched back' },
      { label: '插入肛门', text: 'anal penetration, rear view, clearly visible contact point' },
      { label: '口交', text: 'performing oral sex, intimate close-up' },
      { label: '深喉', text: 'deep throat oral, throat bulge visible' },
      { label: '自慰', text: 'solo masturbation, fingers on clearly visible vulva' },
      { label: '骑乘', text: 'cowgirl riding position, bouncing motion' },
      { label: '狗爬式', text: 'on all fours arching the back, presented rear pose' },
      { label: '乳交', text: 'titjob between large breasts, shaft pressed between cleavage' },
      { label: '颜射', text: 'facial cumshot, eyes closed, mouth open' },
      { label: '内射', text: 'creampie, internal cumshot, after-sex fluids visible' },
      { label: '捆绑', text: 'consensual bondage, ropes restraining arms and chest' },
      { label: '抽插特写', text: 'close-up penetration shot, glistening skin' },
      { label: '双人性爱', text: 'consensual couple sex, missionary position, intertwined bodies' },
      { label: '露出', text: 'public exposure, outdoor nudity, daring setting' },
      { label: '玩具插入', text: 'sex toy insertion, vibrator held in place' },
      { label: '高潮表情', text: 'orgasm face, flushed cheeks, eyes rolled back' },
    ],
  },
  // ── 风格 ─────────────────────────────────────────────────
  {
    key: 'style',
    zh: '风格',
    target: 'prompt',
    items: [
      { label: '写实摄影', text: 'photorealistic, natural skin texture, editorial photography' },
      { label: '8K 高清', text: '8k ultra high resolution, sharp focus, crisp textures' },
      { label: '电影感', text: 'cinematic, film grain, dramatic color grade' },
      { label: '二次元', text: 'anime style, cel shading, clean lineart' },
      { label: '3D 渲染', text: '3d render, soft shading, polished surfaces' },
      { label: '超写实', text: 'hyperrealistic, lifelike pores and hair detail' },
      { label: '胶片', text: 'analog film look, fine grain, natural color' },
      { label: '唯美柔和', text: 'soft dreamy aesthetic, pastel tones' },
      { label: '暗黑风', text: 'dark moody aesthetic, deep shadows' },
      { label: '高对比', text: 'high contrast, vivid saturated colors' },
      { label: '时尚大片', text: 'high fashion editorial, magazine quality' },
      { label: '素颜自然', text: 'natural no-makeup look, believable skin' },
    ],
  },
  // ── 负向 · 画质 ──────────────────────────────────────────
  {
    key: 'neg_quality',
    zh: '负向 · 画质',
    target: 'negative',
    items: [
      { label: '模糊', text: 'blurry, out of focus' },
      { label: '低分辨率', text: 'low resolution, pixelated' },
      { label: '噪点', text: 'noisy, grainy artifacts' },
      { label: '压缩伪影', text: 'jpeg artifacts, compression' },
      { label: '水印文字', text: 'watermark, text, logo' },
      { label: '过曝', text: 'overexposed, washed out' },
      { label: '曝光不足', text: 'underexposed, too dark' },
      { label: '变形', text: 'distorted, warped' },
    ],
  },
  // ── 负向 · 结构 ──────────────────────────────────────────
  {
    key: 'neg_anatomy',
    zh: '负向 · 结构',
    target: 'negative',
    items: [
      { label: '解剖错误', text: 'bad anatomy, deformed limbs' },
      { label: '多手指', text: 'extra fingers, missing fingers' },
      { label: '畸形脸', text: 'deformed face, asymmetric features' },
      { label: '多余肢体', text: 'extra arms, extra legs' },
      { label: '扭曲身体', text: 'twisted body, broken proportions' },
      { label: '重复克隆', text: 'duplicated features, cloning' },
      { label: '裁切', text: 'cropped head, cut off limbs' },
      { label: '变异', text: 'body horror, mutations' },
    ],
  },
];

/** 各工作台分类优先级（key -> 分类顺序）；未命中的用默认顺序 */
export const WORKFLOW_CATEGORY_ORDER: Record<string, PromptCategoryKey[]> = {
  'wf-girlfriend': ['style', 'outfit', 'lighting', 'background', 'action_sfw', 'action_nsfw'],
  'wf-character': ['style', 'lighting', 'background', 'outfit', 'action_sfw', 'action_nsfw'],
  'wf-portrait': ['style', 'outfit', 'lighting', 'background', 'action_nsfw', 'action_sfw'],
  'wf-scene': ['background', 'lighting', 'style', 'outfit', 'action_sfw', 'action_nsfw'],
  'wf-outfit': ['outfit', 'style', 'lighting', 'background', 'action_sfw', 'action_nsfw'],
  'wf-tryon': ['outfit', 'style', 'lighting', 'background', 'action_sfw', 'action_nsfw'],
  'wf-pose': ['action_nsfw', 'action_sfw', 'outfit', 'background', 'lighting', 'style'],
  'wf-bgswap': ['background', 'lighting', 'style', 'outfit', 'action_sfw', 'action_nsfw'],
  'wf-video': ['background', 'lighting', 'action_nsfw', 'action_sfw', 'style', 'outfit'],
};

/** 按工作台排序后的分类列表（默认顺序兜底） */
export function orderCategories(wfKey?: string | null): PromptCategoryPreset[] {
  const order = (wfKey && WORKFLOW_CATEGORY_ORDER[wfKey]) || null;
  if (!order) return PROMPT_CATEGORY_PRESETS;
  const byKey = new Map(PROMPT_CATEGORY_PRESETS.map((g) => [g.key, g]));
  const ordered = order
    .map((k) => byKey.get(k))
    .filter((g): g is PromptCategoryPreset => Boolean(g));
  const rest = PROMPT_CATEGORY_PRESETS.filter((g) => !order.includes(g.key));
  return [...ordered, ...rest];
}
