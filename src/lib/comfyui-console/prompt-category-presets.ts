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
  | 'body'
  | 'hairstyle'
  | 'face'
  | 'temperament'
  | 'skin'
  | 'accessory'
  | 'prop'
  | 'mood'
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
  // ── 身材 ─────────────────────────────────────────────────
  {
    key: 'body',
    zh: '身材',
    target: 'prompt',
    items: [
      { label: '沙漏身材', text: 'hourglass figure, curvy waist-to-hip ratio' },
      { label: '丰满曲线', text: 'full curvy figure, soft generous curves' },
      { label: '梨形身材', text: 'pear-shaped body, wider hips and thighs' },
      { label: '纤细苗条', text: 'slender slim figure, delicate frame' },
      { label: '高挑修长', text: 'tall and willowy, long graceful limbs' },
      { label: '娇小可爱', text: 'petite small frame, cute compact build' },
      { label: '健美运动', text: 'athletic toned body, visible muscle definition' },
      { label: '肌肉发达', text: 'muscular body, defined biceps and abs' },
      { label: '微胖软萌', text: 'soft plush figure, gentle rounded curves' },
      { label: '大胸', text: 'large full breasts, natural heavy bust' },
      { label: '平胸纤细', text: 'flat chest, slim elegant silhouette' },
      { label: '翘臀', text: 'round firm buttocks, lifted back view' },
      { label: '长腿', text: 'long legs, slender thighs, high hip line' },
      { label: '宽肩窄腰', text: 'broad shoulders, narrow waist, athletic V-taper' },
      { label: '六块腹肌', text: 'defined six-pack abs, toned core' },
    ],
  },
  // ── 发型 ─────────────────────────────────────────────────
  {
    key: 'hairstyle',
    zh: '发型',
    target: 'prompt',
    items: [
      { label: '黑长直', text: 'long straight black hair' },
      { label: '大波浪', text: 'long wavy hair, soft loose curls' },
      { label: '双马尾', text: 'twin tails, high twin ponytails' },
      { label: '高马尾', text: 'high ponytail, swept-back hair' },
      { label: '短发', text: 'short bob haircut' },
      { label: '齐刘海', text: 'blunt bangs, straight fringe' },
      { label: '麻花辫', text: 'braided pigtails' },
      { label: '丸子头', text: 'bun hairstyle, top knot' },
      { label: '及腰长发', text: 'waist-length flowing hair' },
      { label: '卷发', text: 'curly voluminous hair' },
      { label: '狼尾', text: 'wolf-cut layered hair' },
      { label: '挑染', text: 'highlighted streaks, dyed hair tips' },
    ],
  },
  // ── 面部特征 ─────────────────────────────────────────────
  {
    key: 'face',
    zh: '面部特征',
    target: 'prompt',
    items: [
      { label: '泪痣', text: 'beauty mark under the eye, teardrop mole' },
      { label: '雀斑', text: 'light freckles across nose and cheeks' },
      { label: '酒窝', text: 'dimples when smiling' },
      { label: '异色瞳', text: 'heterochromia, different colored eyes' },
      { label: '单眼皮', text: 'monolid eyes, subtle eye shape' },
      { label: '高鼻梁', text: 'straight high-bridged nose' },
      { label: '厚唇', text: 'full plump lips' },
      { label: '小虎牙', text: 'small fang tooth, cute canine' },
      { label: '眼尾上挑', text: 'sharp upturned eyes, fox-like gaze' },
      { label: '娃娃脸', text: 'round youthful face, soft features' },
      { label: '方下巴', text: 'strong defined jawline' },
      { label: '精灵耳', text: 'pointed elf ears' },
    ],
  },
  // ── 气质 ─────────────────────────────────────────────────
  {
    key: 'temperament',
    zh: '气质',
    target: 'prompt',
    items: [
      { label: '清纯', text: 'innocent pure aura, fresh natural look' },
      { label: '御姐', text: 'mature elegant aura, confident poise' },
      { label: '甜美', text: 'sweet girl-next-door charm' },
      { label: '高冷', text: 'cool aloof expression, distant gaze' },
      { label: '知性', text: 'intellectual refined demeanor' },
      { label: '活泼', text: 'energetic lively personality' },
      { label: '文静', text: 'quiet gentle temperament' },
      { label: '狂野', text: 'wild untamed attitude' },
      { label: '病娇', text: 'obsessive intense expression, unsettling smile' },
      { label: '温柔', text: 'gentle warm temperament' },
      { label: '飒爽', text: 'cool heroic bearing, sharp confidence' },
      { label: '慵懒', text: 'lazy relaxed vibe, sleepy eyes' },
    ],
  },
  // ── 肤色 ─────────────────────────────────────────────────
  {
    key: 'skin',
    zh: '肤色',
    target: 'prompt',
    items: [
      { label: '冷白皮', text: 'fair porcelain skin, cool undertone' },
      { label: '暖黄皮', text: 'warm honey skin tone' },
      { label: '小麦色', text: 'tan sun-kissed skin' },
      { label: '古铜色', text: 'bronze glowing skin' },
      { label: '深色皮肤', text: 'deep brown skin tone' },
      { label: '白皙透亮', text: 'luminous fair skin, soft glow' },
      { label: '黑皮', text: 'dark melanin-rich skin' },
    ],
  },
  // ── 配饰 ─────────────────────────────────────────────────
  {
    key: 'accessory',
    zh: '配饰',
    target: 'prompt',
    items: [
      { label: '金丝眼镜', text: 'gold-rimmed glasses' },
      { label: '耳环', text: 'dangling earrings' },
      { label: '珍珠项链', text: 'pearl necklace' },
      { label: '锁骨链', text: 'delicate choker necklace' },
      { label: '纹身', text: 'visible tattoos on arm and shoulder' },
      { label: '头饰', text: 'ornate hair accessory, flower crown' },
      { label: '皇冠', text: 'small elegant tiara' },
      { label: '项圈', text: 'leather collar choker' },
      { label: '手链', text: 'beaded bracelet' },
      { label: '手套', text: 'long silk gloves' },
      { label: '戒指', text: 'elegant rings' },
    ],
  },
  // ── 道具 ─────────────────────────────────────────────────
  {
    key: 'prop',
    zh: '道具',
    target: 'prompt',
    items: [
      { label: '玫瑰花束', text: 'holding a bouquet of red roses' },
      { label: '雨伞', text: 'holding a translucent umbrella' },
      { label: '吉他', text: 'playing an acoustic guitar' },
      { label: '书本', text: 'holding an open book' },
      { label: '咖啡杯', text: 'holding a warm coffee cup' },
      { label: '红酒', text: 'holding a glass of red wine' },
      { label: '手机', text: 'holding a smartphone' },
      { label: '玩偶', text: 'hugging a plush teddy bear' },
      { label: '花环', text: 'wearing a flower crown' },
      { label: '扇子', text: 'holding a folding fan' },
      { label: '相机', text: 'holding a vintage camera' },
      { label: '麦克风', text: 'holding a microphone' },
      { label: '武士刀', text: 'holding a katana' },
      { label: '香槟', text: 'toasting with champagne glasses' },
      { label: '宠物猫', text: 'cradling a fluffy cat' },
    ],
  },
  // ── 气氛 ─────────────────────────────────────────────────
  {
    key: 'mood',
    zh: '气氛',
    target: 'prompt',
    items: [
      { label: '浪漫', text: 'romantic mood, soft intimate atmosphere' },
      { label: '温馨', text: 'warm cozy atmosphere' },
      { label: '神秘', text: 'mysterious atmosphere, soft haze' },
      { label: '梦幻', text: 'dreamy ethereal atmosphere' },
      { label: '治愈', text: 'soothing peaceful mood' },
      { label: '暧昧', text: 'sensual charged atmosphere, teasing tension' },
      { label: '惊悚', text: 'eerie unsettling atmosphere' },
      { label: '欢快', text: 'cheerful lively mood' },
      { label: '伤感', text: 'melancholic wistful mood' },
      { label: '庄严', text: 'solemn majestic atmosphere' },
      { label: '慵懒', text: 'lazy afternoon mood, relaxed calm' },
      { label: '激情', text: 'passionate intense atmosphere' },
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

/** 每个工作台调用对应的预设分类（key -> 分类顺序）；未命中的工作台用全部分类 */
export const WORKFLOW_PRESET_SETS: Record<string, PromptCategoryKey[]> = {
  // 生成伴侣 / 生成角色：预设主要集中外貌特征描述
  'wf-girlfriend': ['style', 'body', 'face', 'hairstyle', 'temperament', 'skin', 'accessory', 'outfit', 'prop', 'lighting', 'background'],
  'wf-character': ['style', 'body', 'face', 'hairstyle', 'temperament', 'skin', 'accessory', 'outfit', 'prop'],
  // 生成立绘：预设主要描述画面 / 姿势 / 服装 / 道具 / 场景
  'wf-portrait': ['style', 'action_sfw', 'action_nsfw', 'outfit', 'accessory', 'prop', 'background', 'lighting', 'mood', 'body', 'face', 'hairstyle', 'temperament', 'skin'],
  // 生成场景：预设主要描述场景 / 气氛 / 灯光
  'wf-scene': ['background', 'lighting', 'mood', 'style'],
  // 生成服装 / 一键换装：预设主要描述服装 / 配饰 / 道具
  'wf-outfit': ['outfit', 'accessory', 'prop', 'style', 'background', 'lighting'],
  'wf-tryon': ['outfit', 'accessory', 'prop', 'style', 'background', 'lighting'],
  // 一键姿势：预设主要描述动作（NSFW / SFW）与身材
  'wf-pose': ['action_nsfw', 'action_sfw', 'body', 'outfit', 'background', 'lighting', 'style'],
  // 一键换背景：预设主要描述背景 / 灯光 / 气氛
  'wf-bgswap': ['background', 'lighting', 'mood', 'style'],
  // 视频：预设主要描述动作 / 场景 / 气氛 / 灯光
  'wf-video': ['action_sfw', 'action_nsfw', 'background', 'lighting', 'mood', 'style', 'outfit'],
};

/** 负向预设（画质 / 结构）任何工作台都保留 */
const NEGATIVE_GROUP_KEYS: PromptCategoryKey[] = ['neg_quality', 'neg_anatomy'];

/** 按工作台返回预设分类列表：每个工作台只调用对应的预设；负向分类始终保留 */
export function orderCategories(wfKey?: string | null): PromptCategoryPreset[] {
  const byKey = new Map(PROMPT_CATEGORY_PRESETS.map((g) => [g.key, g]));
  const setKeys = (wfKey && WORKFLOW_PRESET_SETS[wfKey]) || null;
  let keys: PromptCategoryKey[];
  if (setKeys) {
    keys = [...setKeys];
    for (const k of NEGATIVE_GROUP_KEYS) {
      if (!keys.includes(k) && byKey.has(k)) keys.push(k);
    }
  } else {
    keys = PROMPT_CATEGORY_PRESETS.map((g) => g.key);
  }
  return keys.map((k) => byKey.get(k)).filter((g): g is PromptCategoryPreset => Boolean(g));
}
/** 伴侣基础信息 → 提示词预设的自动匹配结果 */
export type CompanionPresetPick = {
  catKey: PromptCategoryKey;
  label: string;
  text: string;
};

function presetItem(
  catKey: PromptCategoryKey,
  label: string,
): { label: string; text: string } | null {
  const group = PROMPT_CATEGORY_PRESETS.find((g) => g.key === catKey);
  const item = group?.items.find((i) => i.label === label);
  return item ? { label: item.label, text: item.text } : null;
}

/**
 * 把伴侣基础信息（捏脸表单 / 伴侣行字段）映射到对应的提示词预设：
 * 风格 / 身材 / 发型 / 肤色 / 服装 / 气质，保证描述与画面一致。
 * 字段缺失时不强推默认值，避免凭空捏造外貌。
 */
export function presetSelectionsFromCompanion(
  info: Record<string, unknown>,
): CompanionPresetPick[] {
  const picks: CompanionPresetPick[] = [];
  const push = (catKey: PromptCategoryKey, label: string) => {
    const item = presetItem(catKey, label);
    if (item) picks.push({ catKey, label: item.label, text: item.text });
  };
  const s = (v: unknown) => String(v || '').toLowerCase().trim();

  // 风格
  const style = s(info.render_style || info.anime_render_style || info.visual_style);
  if (/anime|2d|动漫|二次元/.test(style)) push('style', '二次元');
  else if (/3d|render/.test(style)) push('style', '3D 渲染');
  else if (/realistic|写实|photo/.test(style)) push('style', '写实摄影');

  // 身材
  const body = s(info.appearance_body || info.body_type);
  if (body) {
    if (/curvy|full|丰满|曲线|slim.?thick/.test(body)) push('body', '丰满曲线');
    else if (/pear|梨/.test(body)) push('body', '梨形身材');
    else if (/athletic|toned|fitness|健美|sporty/.test(body)) push('body', '健美运动');
    else if (/muscular|muscle|肌肉|buff/.test(body)) push('body', '肌肉发达');
    else if (/petite|small|娇小/.test(body)) push('body', '娇小可爱');
    else if (/tall|willowy|高挑/.test(body)) push('body', '高挑修长');
    else if (/busty|large breast|big chest|大胸/.test(body)) push('body', '大胸');
    else push('body', '纤细苗条');
  }

  // 发型 + 发色
  const hair = s(info.appearance_hair || info.hair_style);
  const hairColor = s(info.appearance_hair_color || info.hair_color);
  if (hair || hairColor) {
    if (/twin|双马尾|twintail/.test(hair)) push('hairstyle', '双马尾');
    else if (/ponytail|马尾/.test(hair)) push('hairstyle', '高马尾');
    else if (/bob|短/.test(hair)) push('hairstyle', '短发');
    else if (/bangs|fringe|刘海/.test(hair)) push('hairstyle', '齐刘海');
    else if (/braid|辫/.test(hair)) push('hairstyle', '麻花辫');
    else if (/bun|丸子/.test(hair)) push('hairstyle', '丸子头');
    else if (/curly|卷/.test(hair)) push('hairstyle', '卷发');
    else if (/wolf|狼/.test(hair)) push('hairstyle', '狼尾');
    else if (/black|黑/.test(hairColor)) push('hairstyle', '黑长直');
    else if (/straight|long|顺|长/.test(hair)) push('hairstyle', '及腰长发');
    else push('hairstyle', '及腰长发');
  }

  // 肤色
  const skin = s(info.appearance_skin || info.skin_tone);
  if (skin) {
    if (/tan|小麦/.test(skin)) push('skin', '小麦色');
    else if (/bronze|古铜/.test(skin)) push('skin', '古铜色');
    else if (/dark|deep|黑/.test(skin)) push('skin', '深色皮肤');
    else if (/warm|暖/.test(skin)) push('skin', '暖黄皮');
    else push('skin', '冷白皮');
  }

  // 服装
  const fashion = s(info.appearance_style || info.fashion_style);
  if (fashion) {
    if (/lingerie|内衣/.test(fashion)) push('outfit', '内衣');
    else if (/bikini|swim|泳/.test(fashion)) push('outfit', '泳装');
    else if (/latex|乳胶/.test(fashion)) push('outfit', '乳胶衣');
    else if (/maid|女仆/.test(fashion)) push('outfit', '女仆装');
    else if (/nurse|护士/.test(fashion)) push('outfit', '护士装');
    else if (/teacher|教师/.test(fashion)) push('outfit', '教师装');
    else if (/kimono|和服/.test(fashion)) push('outfit', '和服');
    else if (/hanfu|汉服/.test(fashion)) push('outfit', '汉服');
    else if (/wedding|婚纱/.test(fashion)) push('outfit', '婚纱');
    else if (/evening|gown|礼服|formal/.test(fashion)) push('outfit', '晚礼服');
    else if (/business|office|职场|suit/.test(fashion)) push('outfit', '职场西装');
    else if (/sport|运动/.test(fashion)) push('outfit', '运动装');
    else push('outfit', '日常便装');
  }

  // 气质
  const personality = s(info.personality);
  if (personality) {
    if (/sweet|甜美/.test(personality)) push('temperament', '甜美');
    else if (/cool|aloof|高冷/.test(personality)) push('temperament', '高冷');
    else if (/mature|elegant|御姐|sexy/.test(personality)) push('temperament', '御姐');
    else if (/innocent|pure|清纯/.test(personality)) push('temperament', '清纯');
    else if (/gentle|温柔/.test(personality)) push('temperament', '温柔');
    else if (/energetic|lively|活泼/.test(personality)) push('temperament', '活泼');
    else if (/quiet|文静|shy/.test(personality)) push('temperament', '文静');
    else if (/intellectual|知性/.test(personality)) push('temperament', '知性');
    else if (/wild|狂野/.test(personality)) push('temperament', '狂野');
    else if (/lazy|慵懒/.test(personality)) push('temperament', '慵懒');
    else push('temperament', '温柔');
  }

  return picks;
}

