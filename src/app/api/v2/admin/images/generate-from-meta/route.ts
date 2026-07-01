import { NextRequest, NextResponse } from 'next/server';
import { uploadFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for image generation

// ============================================================
// v2 — FLUX 图片生成路由（欧美 AI 女友 · 高质量 · 暧昧诱惑风格）
// ============================================================

const COZE_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const COZE_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY || '';
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || '';
if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  console.error('[generate-from-meta] RunPod credentials not configured');
}
const RUNPOD_BASE_URL = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`;

async function verifyAuth(request: NextRequest): Promise<boolean> {
  const token = request.headers.get('x-session');
  if (!token) return false;
  try {
    const res = await fetch(`${COZE_SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: COZE_SUPABASE_ANON_KEY },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── FLUX 提示词构建器 ─────────────────────────────────────
// 核心表达：美女 · 女友 · 性感 · 真实 · 自然
// FLUX 对自然语言理解优于关键词堆砌

const QUALITY_DIRECTION = "ultra photorealistic, shot on Canon EOS R5 with 85mm f/1.4 lens, shallow depth of field, creamy bokeh, magazine cover quality, 8K UHD, visible natural skin texture, natural skin pores and subtle imperfections, no plastic smoothing, no AI artifacts, hyperrealistic photograph, natural film grain";

const BEAUTY_DIRECTION = "stunningly beautiful gorgeous young woman, sexy attractive alluring, perfect figure, flawless glowing skin, magazine model quality, Instagram influencer aesthetic, captivating natural beauty, warm radiant complexion";

const MOOD_DIRECTION = "warm vibrant colors, bright and inviting atmosphere, intimate genuine moment, girlfriend-next-door vibe, approachable beauty, natural genuine emotion, alive and dynamic, soft warm tones, romantic tender quality";

const EXPRESSION_POOL = [
  // 基于参考图片的自然表情
  'soft warm genuine smile showing teeth, eyes sparkling with natural catchlights, looking directly at viewer',
  'lips slightly parted, soft contemplative gaze, eyes half-lidded, looking at viewer with quiet confidence',
  'playful smirk, one corner of mouth lifted, mischievous glint in eyes, natural asymmetry',
  'bright warm smile, eyes crinkling at corners, genuine joy, head tilted slightly',
  'soft seductive smile, lips slightly parted, inviting gaze, chin tilted down slightly',
  'gentle shy smile, looking up through lashes, natural blush, vulnerable and approachable',
  'confident knowing smile, direct eye contact, self-assured, relaxed features',
  'dreamy contented look, eyes half-closed, peaceful bliss, soft parted lips',
  'candid laughter, head tilted back slightly, natural unposed moment, eyes closed with joy',
  'soft biting lower lip, looking up with anticipation, natural curiosity',
  'sultry bedroom eyes, relaxed features, sensual mood, lips naturally parted',
  'warm welcoming expression, soft eyes, natural smile, approachable beauty',
  'thoughtful pensive look, eyes slightly off-camera, lips parted, introspective mood',
  'bright-eyed curious look, slight head tilt, engaged attention, natural catchlights',
  'soft pensive half-smile, lips slightly parted, warm engaged gaze, natural skin texture visible',
];

/**
 * Build FLUX-optimized prompt
 * 核心：简洁、聚焦、高质量
 */
function buildFluxPrompt(characterDesc: string): string {
  let desc = characterDesc.trim();

  // FLUX模型对长提示词效果差，限制在800字符以内
  if (desc.length > 800) {
    desc = desc.substring(0, 800);
    const lastPeriod = desc.lastIndexOf('.');
    if (lastPeriod > 600) {
      desc = desc.substring(0, lastPeriod + 1);
    }
  }

  // 随机选择表情
  const randomExpression = EXPRESSION_POOL[Math.floor(Math.random() * EXPRESSION_POOL.length)];
  
  // 简洁的提示词结构：质量 + 主体 + 表情
  return `masterpiece, best quality, ultra photorealistic, 8k, sharp focus. ${desc} ${randomExpression}.`;
}

/**
 * Build a heart-fluttering prompt from girlfriend data
 * This is the core logic: extract characteristics → build personalized prompt
 * Structure: [Quality] + [Full Body + Appearance] + [Action/Pose] + [Scene] + [Mood]
 * 
 * Data extraction priority:
 * 1. Top-level appearance_* fields
 * 2. character_card.appearance.* (fallback)
 * 3. Random defaults (last resort)
 * 
 * If metadata is provided, use its appearance description for scene/lighting/pose
 */
function buildGirlfriendPrompt(gf: Record<string, unknown>, metadata?: Record<string, string>): string {
  console.log('[buildGirlfriendPrompt] Full girlfriend data:', JSON.stringify(gf, null, 2));
  console.log('[buildGirlfriendPrompt] Metadata:', metadata ? JSON.stringify(metadata, null, 2) : 'none');
  
  const card = (gf.character_card && typeof gf.character_card === 'object')
    ? gf.character_card as Record<string, unknown>
    : {} as Record<string, unknown>;
  const cardAppearance = (card.appearance && typeof card.appearance === 'object')
    ? card.appearance as Record<string, string>
    : {} as Record<string, string>;

  // Extract characteristics — top-level first, then character_card fallback
  const name = (gf.name as string) || (card.title as string) || 'a beautiful woman';
  const race = (gf.appearance_race as string) || cardAppearance.race || '';
  const hair = (gf.appearance_hair as string) || cardAppearance.hair_style || '';
  const hairColor = (gf.appearance_hair_color as string) || cardAppearance.hair_color || '';
  const eyes = (gf.appearance_eyes as string) || cardAppearance.eyes || '';
  const body = (gf.appearance_body as string) || cardAppearance.body || '';
  const style = (gf.appearance_style as string) || cardAppearance.style || '';
  const personality = (gf.personality as string) || (card.personality as string) || '';
  const occupation = (card.occupation as string) || '';

  // Role — from character_card.role (English) or character_card.role_label (Chinese)
  const roleEn = (card.role as string) || '';
  const roleLabel = (card.role_label as string) || '';

  console.log('[Prompt Builder] Name:', name);
  console.log('[Prompt Builder] Race:', race, '| Hair:', hair, hairColor, '| Eyes:', eyes, '| Body:', body);
  console.log('[Prompt Builder] Role:', roleEn, '/', roleLabel, '| Occupation:', occupation);
  console.log('[Prompt Builder] Personality:', personality);
  console.log('[Prompt Builder] Style:', style);

  // ── Random pools for diverse generation — 基于参考图片的自然姿势 ──
  // 核心：不对称、放松、自然S曲线、亲密感
  const posePool = [
    // 参考图1: 跪坐沙发旁，手托脸颊
    'kneeling on wooden floor, leaning forward with elbows resting on sofa arm, head tilted and resting on fist, relaxed asymmetrical pose, soft natural body curve',
    // 参考图2: 靠窗拉伸，双手举过头顶
    'standing leaning back against window frame, arms raised overhead in loose stretch, one hand resting on back of head, weight on back leg, front leg bent, casual relaxed pose',
    // 参考图3: 站立三分身，手放在内衣边缘
    'standing in relaxed three-quarter pose, weight shifted to one hip, natural S-curve in torso, hands resting lightly on bra edge, fingers slightly curled, confident inviting stance',
    // 参考图4: 盘腿坐在镜面房间
    'sitting cross-legged on reflective floor, torso leaning back slightly, one hand resting on floor behind, other hand lifted to face with fingers touching lower lip, thoughtful pensive pose',
    // 参考图5: 跪姿，双手拉起衣服下摆
    'kneeling with knees spread, hips slightly forward, torso upright with slight back arch, hands gripping bottom of top pulling it upward, confident direct gaze at viewer',
    // 参考图6: 海滩自拍角度
    'casual selfie angle, one arm extended forward holding camera, upper body turned slightly, head tilted toward shoulder, relaxed asymmetrical pose, wind-tousled hair',
    // 参考图7: 坐在椅子上，肩带滑落
    'seated in wooden chair, leaning slightly forward toward camera, head tilted gently to one side, one shoulder strap slipped down arm, relaxed unposed posture, introspective downward gaze',
    // 参考图8: 坐在沙发上，手放在大腿上
    'seated cross-legged on soft sofa, knees bent wide, torso slightly angled toward camera with gentle backward lean, hands resting loosely on thighs, relaxed casual slouch',
    // 更多自然姿势
    'sitting on windowsill, legs dangling, chin resting on one hand, gazing at viewer with soft inviting eyes, warm natural light on face',
    'leaning against doorframe, one hand on frame above head, looking back over shoulder with coy smile, hair cascading down',
    'walking toward camera mid-stride, hair flowing with movement, caught in candid moment, natural smile, arms relaxed at sides',
    'lying on her side propped up on one elbow, free hand tracing collarbone, smoldering gaze, hair spread naturally',
    'reclining in armchair, one leg tucked under, holding glass casually, relaxed sensual posture, soft warm lighting',
    'standing barefoot on balcony, wind catching hair, eyes closed briefly, peaceful expression, arms relaxed',
    'sitting at vanity applying lipstick, caught in mirror reflection, intimate private moment, soft focused expression',
    'standing with one foot on step, hand on knee, leaning forward slightly, engaging pose, direct eye contact',
    'sitting on floor legs stretched out, leaning back on hands, head tilted back, laughing naturally',
    'standing with arms raised stretching, mid-yawn, caught in private morning moment, natural unposed',
    'lying on back looking up at camera, hair spread around, dreamy contented expression, soft natural light',
    'sitting on stairs, elbows on knees, hands clasped, looking down thoughtfully, hair falling forward',
    'walking away looking over shoulder, hair cascading down back, inviting follow-me gesture, natural smile',
    'standing with arms outstretched, face to sky, breathing deeply, free-spirited moment, eyes closed',
    'sitting at cafe table, holding cup with both hands, steam rising, cozy intimate pose, warm smile',
    'leaning against bookshelf, one leg bent with foot on shelf, book in hand, intellectual allure, soft smile',
    'kneeling on floor sitting back on heels, hands in lap, looking up with innocent eyes, natural light on face',
    'reclining on chaise lounge, one arm behind head, legs crossed, elegant relaxation, confident gaze',
    'standing in contrapposto, one knee slightly bent, arms relaxed, serene confident expression, natural hip tilt',
    'sitting on edge of bed, hands behind supporting weight, looking up at viewer through lashes, intimate mood',
    'leaning forward with elbows on table, chin on interlocked fingers, intense eye contact, lips slightly parted',
    'standing with one hand touching hair, slight head tilt, lips parted, eyes locked on viewer, natural catchlights',
  ];

  // ── 光线池 — 基于参考图片的温暖自然光 ──
  // 核心：柔和、温暖、方向性、自然渐变
  const lightingPool = [
    // 参考图1/7/8: 柔和窗户侧光
    'soft natural window light streaming from side, warm golden highlights on skin, gentle diffused shadows, radiant glowing complexion, creamy bokeh background',
    // 参考图2: 明亮窗户光+轻微镜头光晕
    'bright natural daylight from large window, soft diffused quality, subtle lens flare, warm skin tones, natural catchlights in eyes, gentle shadow gradients',
    // 参考图3: 柔和明亮室内光
    'soft bright diffused indoor lighting, warm even illumination, no harsh shadows, skin glowing naturally, vibrant warm colors, magazine quality light',
    // 参考图4: 顶部暖光+环境霓虹反射
    'warm overhead key light creating soft shadows under chin and neck, ambient colored reflections adding depth, skin luminous and warm, dramatic but flattering',
    // 参考图5: 双色戏剧性光线
    'dual-color dramatic lighting, warm pink-red light on one side blending with cool blue-purple on other, soft gradients across skin, sensual moody atmosphere',
    // 参考图6: 明亮海滩阳光
    'bright natural overhead sunlight, warm golden quality, sun-kissed skin with natural highlights on collarbones and shoulders, vibrant turquoise water reflections, summer energy',
    // 更多温暖自然光线
    'golden hour sunlight through large windows, warm amber glow on skin, vibrant colors, soft shadow gradients, radiant ethereal quality',
    'warm sunset light casting golden-orange tones, romantic glow, skin luminous and radiant, hair catching light with warm highlights',
    'bright morning sunlight, fresh energetic vibe, clear vibrant colors, dewy fresh skin, natural window light quality',
    'soft diffused overcast natural light, even flattering illumination, skin smooth and luminous, colors vibrant and warm, no harsh shadows',
    'warm interior lighting mixed with window light, cozy inviting atmosphere, skin warm and glowing, intimate bedroom vibe',
    'bright studio beauty lighting, soft overhead key light with fill, catchlights sparkling in eyes, skin flawless and radiant, professional magazine quality',
    'backlit by warm sun creating rim lighting on hair, subtle lens flare, glowing ethereal halo effect, face softly lit by fill light',
    'warm candlelight mixed with soft fairy lights, romantic intimate golden glow, skin warm and inviting, flickering natural quality',
    'bright beach sunlight with water reflections, sun-kissed glowing skin, vibrant summer colors, energetic vacation vibe',
    'warm fireplace glow casting orange-amber light, cozy intimate atmosphere, skin glowing warmly, soft dancing light quality',
    'soft moonlight through sheer curtains, gentle silver-blue glow mixed with warm interior light, dreamy romantic quality',
    'warm pink and purple sunset colors reflecting on skin, romantic dreamy atmosphere, golden hour magic, skin glowing with warm tones',
    'bright window light through sheer curtains diffusing softly, warm intimate glow, bedroom morning vibe, natural skin texture visible',
    'warm tropical sunlight with palm tree shadow patterns, vibrant vacation vibes, sun-kissed glowing skin, paradise atmosphere',
  ];

  // ── 场景池 — 简洁聚焦的场景描述 ──
  // 核心：简短、清晰、不堆砌细节
  const scenePool = [
    'warm sunlit living room with wooden floor and white sofa',
    'bright cozy bedroom with large window and natural light',
    'modern apartment with glass door and green plants outside',
    'stylish room with warm overhead lighting',
    'soft white fabric backdrop with gentle colored light',
    'tropical beach with turquoise water and blue sky',
    'intimate room with vintage chair and warm wall',
    'cozy living room with soft natural side light',
    'bright apartment with city view and sunlight',
    'colorful bedroom with fairy lights and plants',
    'rooftop terrace at sunset with city skyline',
    'bright cafe with morning sunlight',
    'Mediterranean balcony with flowers and sea view',
    'greenhouse with tropical plants and bright light',
    'luxury hotel room with warm ambient light',
    'beach at golden hour with palm trees',
    'garden with blooming flowers and sunshine',
    'bright kitchen with morning light',
    'elegant apartment with fresh flowers',
    'yacht deck with ocean view and sunshine',
  ];

  // Use metadata appearance if available, otherwise use random selections
  const useMetadata = metadata?.appearance && metadata.appearance.trim().length > 100;
  const metadataAppearance = useMetadata ? metadata!.appearance : null;

  // ── Build subject identification — only race/hair/eyes ──
  const subjectParts: string[] = ['Full body portrait of a stunningly beautiful gorgeous young woman'];
  
  if (race) subjectParts.push(`${race} ethnicity`);
  if (hair || hairColor) subjectParts.push(`with beautiful ${[hairColor, hair].filter(Boolean).join(' ')} hair`);
  if (eyes) subjectParts.push(`gorgeous ${eyes} eyes`);

  // ── SIMPLIFIED PROMPT STRUCTURE ──
  // When metadata is available, use it as the ONLY source for visual description
  // This ensures each girlfriend's unique scene/lighting/pose/clothing is used
  
  let fullPrompt: string;
  if (useMetadata && metadataAppearance) {
    // SIMPLIFIED: Just subject + metadata appearance
    // The metadata appearance already contains: scene, lighting, pose, clothing, mood
    // 关键：先把 LLM 可能注入的模糊关键词洗掉
    const cleanedAppearance = sanitizeBlurKeywords(metadataAppearance);
    fullPrompt = [
      GIRLFRIEND_QUALITY_PREFIX,
      subjectParts.join(', '),
      cleanedAppearance,
    ].join('. ');
    console.log('[Prompt Builder] ✅ SIMPLIFIED: Using metadata appearance as SOLE visual source');
    console.log('[Prompt Builder] Metadata appearance (cleaned):', cleanedAppearance.substring(0, 300));
  } else {
    // Fallback: Use random pools for diversity when no metadata
    const randomPose = posePool[Math.floor(Math.random() * posePool.length)];
    const randomLighting = lightingPool[Math.floor(Math.random() * lightingPool.length)];
    const randomScene = scenePool[Math.floor(Math.random() * scenePool.length)];
    const randomExpression = EXPRESSION_POOL[Math.floor(Math.random() * EXPRESSION_POOL.length)];
    
    const clothingDescs: Record<string, string> = {
      'casual chic': 'a fitted white tee and high-waisted jeans',
      'elegant': 'a sleek black midi dress',
      'sporty': 'a form-fitting athletic crop top and leggings',
      'bohemian': 'a flowy floral maxi dress',
      'minimalist': 'a tailored cream blazer over a silk camisole',
      'trendy': 'a cropped knit top and pleated mini skirt',
      'classic': 'a crisp button-down shirt tucked into a pencil skirt',
      'edgy': 'a leather moto jacket over a graphic tee',
      'glamorous': 'a figure-hugging satin slip dress',
      'street style': 'an oversized denim jacket over a hoodie',
    };
    const clothing = clothingDescs[style] || `a stylish ${style || 'casual'} outfit`;
    
    fullPrompt = [
      'masterpiece, best quality, photorealistic, 8k, professional photography',
      subjectParts.join(', '),
      `She wears ${clothing}`,
      randomPose,
      `Expression: ${randomExpression}`,
      `Setting: ${randomScene}`,
      `Lighting: ${randomLighting}`,
    ].join('. ');
    console.log('[Prompt Builder] Using random pools for scene/lighting/pose');
  }

  console.log('[Prompt Builder] Final prompt length:', fullPrompt.length, 'chars');
  console.log('[Prompt Builder] Final prompt preview:', fullPrompt.substring(0, 400));

  return fullPrompt;
}

/**
 * Build a simple, natural language prompt from girlfriend characteristics
 * 
 * SIMPLIFIED APPROACH:
 * - Use girlfriend's key features (race, hair, eyes, style)
 * - Use short, natural phrases for scene/lighting/pose
 * - Each girlfriend gets a unique combination
 */
function buildSimplePrompt(gf: Record<string, unknown>): string {
  const card = (gf.character_card && typeof gf.character_card === 'object')
    ? gf.character_card as Record<string, unknown>
    : {} as Record<string, unknown>;
  const cardAppearance = (card.appearance && typeof card.appearance === 'object')
    ? card.appearance as Record<string, string>
    : {} as Record<string, string>;

  // Extract key characteristics
  const race = (gf.appearance_race as string) || cardAppearance.race || '';
  const hair = (gf.appearance_hair as string) || cardAppearance.hair_style || '';
  const hairColor = (gf.appearance_hair_color as string) || cardAppearance.hair_color || '';
  const eyes = (gf.appearance_eyes as string) || cardAppearance.eyes || '';
  const style = (gf.appearance_style as string) || cardAppearance.style || '';

  console.log('[SimplePrompt] Race:', race, '| Hair:', hair, hairColor, '| Eyes:', eyes, '| Style:', style);

  // Build simple subject description
  const subject = `Full body portrait of a beautiful ${race || 'young'} woman`;
  const hairDesc = hair && hairColor ? `with ${hairColor} ${hair} hair` : '';
  const eyesDesc = eyes ? `${eyes} eyes` : '';

  // Simple, natural scene descriptions (short phrases)
  const scenes = [
    'sitting on a wooden floor by a window',
    'standing in a sunlit room',
    'relaxing on a white sofa',
    'leaning against a wall',
    'sitting at a cafe table',
    'standing on a balcony',
    'lying on a bed',
    'sitting in a garden',
  ];

  // Simple lighting descriptions
  const lightings = [
    'soft natural window light',
    'warm golden hour sunlight',
    'bright morning light',
    'gentle afternoon sun',
    'soft diffused light',
    'warm ambient lighting',
  ];

  // Simple pose descriptions
  const poses = [
    'relaxed casual pose',
    'natural standing pose',
    'sitting comfortably',
    'leaning slightly forward',
    'looking at camera with a smile',
    'turning head slightly',
  ];

  // Simple expression descriptions
  const expressions = [
    'warm genuine smile',
    'soft natural expression',
    'gentle happy look',
    'relaxed confident expression',
    'bright cheerful smile',
    'calm peaceful expression',
  ];

  // Simple clothing descriptions based on style
  const clothing: Record<string, string> = {
    'casual': 'white t-shirt and jeans',
    'elegant': 'black midi dress',
    'sporty': 'athletic crop top and leggings',
    'bohemian': 'flowy floral dress',
    'minimalist': 'cream blazer and silk top',
    'trendy': 'knit top and mini skirt',
    'classic': 'button-down shirt and pencil skirt',
    'edgy': 'leather jacket and tee',
    'glamorous': 'satin slip dress',
    'street': 'denim jacket and hoodie',
  };
  const clothingDesc = clothing[style?.toLowerCase() || 'casual'] || 'stylish casual outfit';

  // Build simple, natural prompt
  const scene = scenes[Math.floor(Math.random() * scenes.length)];
  const lighting = lightings[Math.floor(Math.random() * lightings.length)];
  const pose = poses[Math.floor(Math.random() * poses.length)];
  const expression = expressions[Math.floor(Math.random() * expressions.length)];

  // Combine into natural language with strong quality keywords
  const parts = [
    'RAW photo, masterpiece, best quality, ultra-high resolution, 4K, 8K UHD, super resolution, highly detailed, ultra photorealistic, photorealism, hyperrealistic, dslr, sharp focus, tack sharp, in-focus, crisp details, detailed eyes, detailed face, detailed skin texture, natural skin pores, professional photography, shot on Canon EOS R5, 85mm f/1.4 lens',
    subject,
    hairDesc,
    eyesDesc,
    `wearing ${clothingDesc}`,
    scene,
    lighting,
    pose,
    expression,
  ].filter(Boolean);

  const fullPrompt = parts.join(', ');

  console.log('[SimplePrompt] Simple natural prompt:', fullPrompt.substring(0, 300));

  return fullPrompt;
}

const NEGATIVE_PROMPT = `blurry, blur, blurred, soft focus, out of focus, defocused, hazy, dreamy haze, smudged, motion blur, depth of field, shallow depth of field, bokeh, gaussian blur, lens blur, oof, low quality, worst quality, lowres, pixelated, deformed, bad anatomy, bad hands, extra fingers, ugly, watermark, text, jpeg artifacts, compression artifacts, grainy, noisy, cartoon, anime, illustration, cgi, 3d render, painting, sketch, low resolution, downscaled, jpg, jpeg`;

// ─── Blur-inducing keyword sanitizer ─────────────────────────────
// LLM 生成的 appearance/scene 文本可能包含让 FLUX 输出模糊的关键词
// 比如 "soft focus", "dreamy", "ethereal", "bokeh background"
// 必须在拼到最终 prompt 前过滤掉
const BLUR_KEYWORDS = [
  'soft focus', 'soft-focus', 'out of focus', 'out-of-focus', 'defocused',
  'blurry', 'blurred', 'blur background', 'blurred background',
  'hazy', 'haze', 'misty', 'foggy',
  'dreamy', 'ethereal', 'gauzy', 'gauze', 'veiled',
  'motion blur', 'gaussian blur', 'lens blur',
  'bokeh', 'shallow depth of field', 'depth of field', 'shallow dof',
  'low resolution', 'lowres', 'pixelated', 'low detail',
];

// 否定指令在 positive prompt 中会让扩散模型把"被否定的概念"画出来
// 例: "no person" 在 positive 里反而强化 person 概念
// 整段 "no person, no model, no mannequin" 会让模型完全失焦渲成全黑
// 这些短语必须在送入生成器前从 positive prompt 中物理清除
const NEGATION_PHRASES = [
  'no person', 'no people', 'no human', 'no humans', 'no woman', 'no man',
  'no model', 'no models', 'no mannequin', 'no mannequins',
  'no face', 'no faces', 'no body', 'no bodies', 'no body part', 'no body parts',
  'no hands', 'no arms', 'no legs', 'no head',
  'without a person', 'without person', 'without people',
  'without a model', 'without a mannequin', 'without a human', 'without a face',
];

function sanitizeBlurKeywords(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const kw of [...BLUR_KEYWORDS, ...NEGATION_PHRASES]) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'gi');
    cleaned = cleaned.replace(re, '');
  }
  // 清理多余逗号空格
  cleaned = cleaned.replace(/\s*,\s*,+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').replace(/\s+/g, ' ');
  return cleaned;
}

// ─── 通用高质量提示词前缀 ─────────────────────────────────────
const GIRLFRIEND_QUALITY_PREFIX = 'RAW photo, masterpiece, best quality, ultra-high resolution, 4K, 8K UHD, super resolution, highly detailed, ultra photorealistic, photorealism, hyperrealistic, dslr, sharp focus, tack sharp, in-focus, crisp details, detailed eyes, detailed face, detailed skin texture, natural skin pores, professional photography, shot on Canon EOS R5, 85mm f/1.4 lens, soft cinematic lighting';

interface GenParams {
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  sampler: string;
  scheduler: string;
}

/**
 * Build ComfyUI workflow for FLUX fp8 checkpoint
 *
 * RunPod instance has:
 *   - CheckpointLoaderSimple with 'flux1-dev-fp8.safetensors'
 *   - VAELoader with 'pixel_space' ONLY
 *   - No separate UNET/CLIP/T5 files
 */
function buildWorkflow(prompt: string, negativePrompt: string, params: GenParams) {
  const seed = params.seed > 0 ? params.seed : Math.floor(Math.random() * 2147483647);
  const fluxPrompt = buildFluxPrompt(prompt);
  const negPrompt = negativePrompt || NEGATIVE_PROMPT;

  console.log('[RunPod] FLUX prompt (' + fluxPrompt.length + ' chars):', fluxPrompt.substring(0, 300));
  console.log('[RunPod] Params:', JSON.stringify({
    seed, steps: params.steps, cfg: params.cfg,
    sampler: params.sampler, scheduler: params.scheduler,
    width: params.width, height: params.height,
  }));

  return {
    // 1. Load FLUX fp8 checkpoint (includes MODEL + CLIP + VAE)
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: {
        ckpt_name: 'flux1-dev-fp8.safetensors',
      },
    },
    // 2. Encode positive prompt
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: fluxPrompt,
        clip: ['1', 1],  // CLIP output from checkpoint
      },
    },
    // 3. Encode negative prompt
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: negPrompt,
        clip: ['1', 1],
      },
    },
    // 4. Create empty latent image
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: params.width || 832,
        height: params.height || 1216,
        batch_size: 1,
      },
    },
    // 5. KSampler — FLUX fp8 optimal settings
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: params.steps || 28,
        cfg: params.cfg || 3.5,
        sampler_name: params.sampler || 'euler',
        scheduler: params.scheduler || 'simple',
        denoise: 1.0,
        model: ['1', 0],     // MODEL output from checkpoint
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    // 6. Decode using checkpoint's built-in VAE (output index 2)
    '6': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['5', 0],
        vae: ['1', 2],  // VAE from CheckpointLoaderSimple (NOT separate VAELoader)
      },
    },
    // 7. Save output
    '7': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'soulmate',
        images: ['6', 0],
      },
    },
  };
}

// Submit a job to RunPod and return the job ID
async function submitJob(prompt: string, negativePrompt: string, params: GenParams): Promise<string> {
  const workflow = buildWorkflow(prompt, negativePrompt, params);

  const submitRes = await fetch(`${RUNPOD_BASE_URL}/run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RUNPOD_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: { workflow } }),
  });
  if (!submitRes.ok) {
    const errText = await submitRes.text();
    console.error('[RunPod] Submit failed:', errText);
    throw new Error(`RunPod submit failed: ${errText}`);
  }
  const { id: jobId } = await submitRes.json();
  if (!jobId) throw new Error('No RunPod job ID');
  console.log('[RunPod] Job submitted:', jobId);
  return jobId;
}

// Poll a job until completion and return the base64 image
async function pollJob(jobId: string): Promise<string> {
  const maxPolls = 300; // 300 * 1s = 300s = 5 min
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, 1000)); // Poll every 1 second
    const statusRes = await fetch(`${RUNPOD_BASE_URL}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
    });
    if (!statusRes.ok) continue;
    const status = await statusRes.json();
    if (status.status === 'COMPLETED') {
      const images = status.output?.images || [];
      if (!images.length) throw new Error('No images in output');
      console.log('[RunPod] Job', jobId, 'completed, image size:', images[0].data?.length || 'unknown');
      return images[0].data || images[0];
    }
    if (status.status === 'FAILED') {
      const errMsg = status.error || JSON.stringify(status.output) || 'unknown';
      console.error('[RunPod] Job', jobId, 'failed:', errMsg);
      console.error('[RunPod] Full status:', JSON.stringify(status, null, 2));
      throw new Error(`RunPod error: ${errMsg}`);
    }
    // Log progress every 30 seconds
    if (i % 30 === 0 && i > 0) {
      console.log(`[RunPod] Job ${jobId} still running... (${i}s elapsed)`);
    }
  }
  throw new Error(`RunPod timeout after 5 minutes for job ${jobId}`);
}

async function uploadToStorage(base64Data: string, folder: string): Promise<string> {
  const buffer = Buffer.from(base64Data, 'base64');
  const { key } = await uploadFile(buffer, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`, 'image/png', folder);
  return key;
}

// ── 请求入口 ──────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!(await verifyAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = (body.type as string) || 'girlfriend';
  const negativePrompt = (body.negativePrompt as string) || '';
  const count = Math.min((body.count as number) || 4, 6);
  const girlfriendId = body.girlfriendId as string;
  const metadata = body.metadata as Record<string, string> | undefined;

  const params = {
    steps: (body.steps as number) || 28,
    cfg: (body.cfg as number) || (body.cfg_scale as number) || 3.5,
    seed: (body.seed as number) || 0,
    width: (body.width as number) || 832,
    height: (body.height as number) || 1216,
    sampler: (body.sampler as string) || 'euler',
    scheduler: (body.scheduler as string) || 'simple',
  };

  let rawPrompt = '';

  // If girlfriendId is provided, fetch girlfriend data and build personalized prompt
  if (girlfriendId) {
    try {
      console.log('[generate-from-meta] Fetching girlfriend data for ID:', girlfriendId);
      const { requireAdmin } = await import('@/lib/require-admin');
      const adminCheck = await requireAdmin(req);
      
      if (adminCheck.error) {
        console.error('[generate-from-meta] Admin check failed:', adminCheck.error);
      }
      
      if (!adminCheck.error && adminCheck.supabase) {
        console.log('[generate-from-meta] Admin check passed, querying database...');
        const { data, error } = await adminCheck.supabase
          .from('girlfriends')
          .select('*')
          .eq('id', girlfriendId)
          .single();
        
        if (error) {
          console.error('[generate-from-meta] Database query error:', error);
        }
        
        if (!data) {
          console.warn('[generate-from-meta] No girlfriend data returned for ID:', girlfriendId);
        }
        
        if (!error && data) {
          console.log('[generate-from-meta] ✅ Girlfriend data received:', JSON.stringify({
            id: data.id,
            name: data.name,
            appearance_race: data.appearance_race,
            appearance_hair: data.appearance_hair,
            appearance_hair_color: data.appearance_hair_color,
            appearance_eyes: data.appearance_eyes,
            appearance_body: data.appearance_body,
            appearance_style: data.appearance_style,
            personality: data.personality,
            occupation: data.occupation,
            has_character_card: !!data.character_card,
            character_card_keys: data.character_card ? Object.keys(data.character_card) : [],
          }, null, 2));
          
          // Use simplified prompt builder
          rawPrompt = buildSimplePrompt(data as Record<string, unknown>);
          console.log('[generate-from-meta] ✅ Built simple prompt from girlfriend:', girlfriendId);
          console.log('[generate-from-meta] Prompt preview (first 500 chars):', rawPrompt.substring(0, 500));
        } else {
          console.warn('[generate-from-meta] Girlfriend not found:', girlfriendId, error);
        }
      } else {
        console.error('[generate-from-meta] Admin check did not return supabase client');
      }
    } catch (err) {
      console.error('[generate-from-meta] Failed to fetch girlfriend:', err);
    }
  } else {
    console.log('[generate-from-meta] No girlfriendId provided, using custom prompt or metadata');
  }

  // Fallback to custom prompt or metadata
  if (!rawPrompt) {
    rawPrompt = (body.customPrompt as string) || (metadata?.appearance) || (body.concept as string) || '';
  }

  // ─── 类型相关的提示词与负面词增强 ────────────────────
  // 服装库/道具库使用独立的视觉规范（产品摄影 / ghost mannequin，不含人物）
  let finalNegativePrompt = negativePrompt;
  // 先把 LLM 生成的 appearance 中的模糊关键词洗掉
  rawPrompt = sanitizeBlurKeywords(rawPrompt);

  if (type === 'outfit') {
    const { assemblePrompt } = await import('@/lib/prompt');
    const assembled = assemblePrompt('outfit', {
      rawPrompt,
      extraNegative: finalNegativePrompt,
    });
    rawPrompt = assembled.positive;
    finalNegativePrompt = assembled.negative;
  } else if (type === 'shop_item') {
    const { assemblePrompt } = await import('@/lib/prompt');
    const assembled = assemblePrompt('shop_item', {
      rawPrompt,
      extraNegative: finalNegativePrompt,
    });
    rawPrompt = assembled.positive;
    finalNegativePrompt = assembled.negative;
  }

  console.log('[generate-from-meta] type =', type);
  console.log('[generate-from-meta] rawPrompt length:', rawPrompt.length);
  console.log('[generate-from-meta] === FULL POSITIVE PROMPT ===');
  console.log(rawPrompt);
  console.log('[generate-from-meta] === FULL NEGATIVE PROMPT ===');
  console.log(finalNegativePrompt);
  console.log('[generate-from-meta] === END PROMPT ===');

  if (!rawPrompt) {
    return NextResponse.json({ error: 'No prompt provided' }, { status: 400 });
  }

  // Parallel generation - submit all jobs at once, poll in parallel
  try {
    console.log('[generate-from-meta] Starting parallel generation...');
    
    const folder = (type || 'girlfriend') + 's';
    
    // Use a base seed and increment for each image (more predictable than random)
    const baseSeed = params.seed > 0 ? params.seed : Math.floor(Math.random() * 1000000);
    console.log('[generate-from-meta] Using base seed:', baseSeed);
    
    // Step 1: Submit all jobs in parallel
    console.log(`[generate-from-meta] Submitting ${count} jobs in parallel...`);
    const jobPromises = [];
    for (let i = 0; i < count; i++) {
      const seed = baseSeed + i;
      console.log(`[generate-from-meta] Submitting job ${i + 1}/${count} with seed ${seed}...`);
      jobPromises.push(submitJob(rawPrompt, finalNegativePrompt, { ...params, seed }));
    }
    
    // Wait for all jobs to be submitted
    const jobIds = await Promise.all(jobPromises);
    console.log('[generate-from-meta] All jobs submitted:', jobIds);
    
    // Step 2: Poll all jobs in parallel
    console.log('[generate-from-meta] Polling all jobs in parallel...');
    const pollPromises = jobIds.map((jobId, i) => 
      pollJob(jobId).then(base64 => ({ base64, index: i }))
    );
    
    // Wait for all jobs to complete
    const pollResults = await Promise.all(pollPromises);
    console.log('[generate-from-meta] All jobs completed');
    
    // Step 3: Upload all images in parallel
    console.log('[generate-from-meta] Uploading all images in parallel...');
    const uploadPromises = pollResults.map(({ base64, index }) => 
      uploadToStorage(base64, folder).then(url => ({ url, alt: `Generated ${index + 1}` }))
    );
    
    const results = await Promise.all(uploadPromises);
    console.log('[generate-from-meta] Generation completed, results:', results.length);
    
    return NextResponse.json({
      success: true,
      images: results,
      meta: metadata,
      optimizedPrompt: rawPrompt,
    });
  } catch (err) {
    console.error('[generate-from-meta] Generation failed:', err);
    return NextResponse.json({ 
      error: err instanceof Error ? err.message : 'Generation failed',
      success: false,
    }, { status: 500 });
  }
}
