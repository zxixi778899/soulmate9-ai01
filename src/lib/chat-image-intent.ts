/** Detect photo requests and turn the current conversation into a concrete image action. */
export type ChatImageIntent = { wantsImage: boolean; action: string; kind: 'selfie' | 'body' | 'outfit' | 'pose' | 'custom' | 'scene'; confidence: number };
export type ChatContextLine = { role: 'user' | 'assistant' | string; content: string };

const HARD_PATTERNS: Array<{ re: RegExp; kind: ChatImageIntent['kind']; confidence: number }> = [
  { re: /(?:看看你|看你(?:一下)?|想看看你|让我看看你|给我看看你)/i, kind: 'selfie', confidence: 0.94 },
  { re: /(?:自拍|自拍照|发张自拍|拍张自拍|来张自拍)/i, kind: 'selfie', confidence: 0.96 },
  { re: /(?:拍照|拍一张|拍张照片|发张照片|发张图|给我一张照片)/i, kind: 'selfie', confidence: 0.93 },
  { re: /(?:send|snap|take|shoot|show)(?:\s+me)?(?:\s+a)?(?:\s+sexy)?\s+(?:selfie|photo|picture|pic|image)/i, kind: 'selfie', confidence: 0.95 },
  { re: /(?:generate|make|draw)\s+(?:a\s+)?(?:photo|picture|image|selfie)\s+of\s+you/i, kind: 'selfie', confidence: 0.92 },
  { re: /(?:show me|let me see|i want to see)\s+(?:your\s+)?(?:face|body|outfit|legs?|feet|chest|ass|butt)/i, kind: 'custom', confidence: 0.9 },
];

const ACTION_MAP: Array<{ re: RegExp; action: string; kind: ChatImageIntent['kind'] }> = [
  { re: /(?:内衣|睡衣|lingerie|underwear|bra|pant(?:y|ies))/i, action: 'wearing the outfit requested in chat, posing naturally for a fresh full-body photo', kind: 'outfit' },
  { re: /(?:裙子|连衣裙|穿搭|衣服|outfit|dress|wearing)/i, action: 'showing her requested outfit in a fresh full-body photo, natural confident pose', kind: 'outfit' },
  { re: /(?:脸|特写|close[- ]?up|face)/i, action: 'taking a brand-new close-up selfie, looking directly into the camera', kind: 'selfie' },
  { re: /(?:腿|大腿|legs?|thighs?)/i, action: 'posing in a newly composed full-body photo that shows her legs naturally', kind: 'body' },
  { re: /(?:臀|屁股|ass|butt|booty|hips)/i, action: 'turning in a newly composed three-quarter pose, looking back at the camera playfully', kind: 'body' },
  { re: /(?:胸|breasts?|boobs?|chest)/i, action: 'posing in a newly composed tasteful portrait that matches the request', kind: 'body' },
  { re: /(?:床|卧室|bedroom|bed)/i, action: 'taking a brand-new candid photo in the bedroom, warm intimate lighting', kind: 'pose' },
  { re: /(?:镜子|mirror)/i, action: 'taking a brand-new mirror selfie, phone in hand, a different pose and composition', kind: 'selfie' },
  { re: /(?:自拍|selfie)/i, action: 'taking a brand-new natural selfie, a different pose, camera angle and background', kind: 'selfie' },
];

export function parseChatImageIntent(message: string): ChatImageIntent {
  const text = String(message || '').trim();
  if (!text) return { wantsImage: false, action: '', kind: 'custom', confidence: 0 };
  let kind: ChatImageIntent['kind'] = 'custom';
  let confidence = 0;
  for (const pattern of HARD_PATTERNS) if (pattern.re.test(text)) { kind = pattern.kind; confidence = Math.max(confidence, pattern.confidence) }
  if (!confidence && /(?:照片|图片|自拍|photo|picture|image|selfie)/i.test(text)) { confidence = 0.78; kind = 'selfie' }
  if (confidence < 0.7) return { wantsImage: false, action: '', kind, confidence };
  for (const mapping of ACTION_MAP) if (mapping.re.test(text)) return { wantsImage: true, action: mapping.action, kind: mapping.kind, confidence };
  return { wantsImage: true, action: 'taking a brand-new natural girlfriend photo, with a different pose, camera angle and background', kind: kind === 'custom' ? 'selfie' : kind, confidence };
}

export function isChatImageRequest(message: string): boolean { return parseChatImageIntent(message).wantsImage }

/** Detect video requests in chat messages */
const VIDEO_PATTERNS: RegExp[] = [
  /(?:视频|短视频|动态|动图|发个视频|拍个视频|给我视频)/i,
  /(?:video|clip|animation|moving|send.*video|make.*video|record)/i,
  /(?:动起来|动一下|让我看你动|live photo)/i,
];

export function parseVideoIntent(message: string): boolean {
  const text = String(message || '').trim();
  if (!text) return false;
  return VIDEO_PATTERNS.some((re) => re.test(text));
}

/* ──────────────────────────────────────────────────────────────────────────────
 * SCENE DETECTION — 20+ real-world locations extracted from chat context
 * Used by both buildImageActionFromChat (deterministic fallback) and
 * extractSceneFromContext (upstream caller that feeds the LLM prompt engine).
 * ──────────────────────────────────────────────────────────────────────────── */

/** Ordered scene rules — first match wins. Each rule maps regex → English prompt clause. */
const SCENE_RULES: Array<{ re: RegExp; prompt: string }> = [
  // ── Aquarium / Marine ──
  { re: /(?:海洋馆|水族馆|水族|aquarium|aqua[- ]?rium)/i, prompt: 'inside a large aquarium, standing before a massive glass tank filled with whales and tropical fish, blue underwater glow illuminating her face, magical aquatic atmosphere' },
  { re: /(?:鲸鱼|whale|dolphin|海豚|鲨鱼|shark|水母|jellyfish)/i, prompt: 'inside an aquarium viewing gallery, enormous glass tank with marine life behind her, deep blue aquatic light casting soft caustic patterns on her skin' },

  // ── Zoo / Safari ──
  { re: /(?:动物园|zoo|safari|野生动物园)/i, prompt: 'at a zoo, with lush green enclosures and natural habitat in the background, bright daylight, candid tourist photo vibe' },
  { re: /(?:熊猫|panda|长颈鹿|giraffe|大象|elephant|狮子|lion|老虎|tiger|猴子|monkey)/i, prompt: 'at a zoo enclosure, animals visible in the background, natural outdoor lighting, playful tourist selfie atmosphere' },

  // ── Dining / Restaurant ──
  { re: /(?:餐厅|饭店|restaurant|dining|吃饭|用餐|西餐|法餐|意餐)/i, prompt: 'in an elegant restaurant, warm candlelight ambiance, fine dining table setting, soft bokeh lights in the background' },
  { re: /(?:火锅|hotpot|烧烤|bbq|烤肉|日料|sushi|寿司|拉面|ramen)/i, prompt: 'at a lively restaurant table with steaming food, warm ambient lighting, cozy dining atmosphere' },

  // ── Cafe (expanded) ──
  { re: /(?:咖啡|咖啡店|cafe|coffee shop|星巴克|starbucks|拿铁|latte)/i, prompt: 'in a cozy cafe with warm lighting, coffee cups on the table, soft afternoon light through the window' },

  // ── Beach / Ocean ──
  { re: /(?:海边|沙滩|beach|ocean|seaside|海岸|海滨)/i, prompt: 'at the beach with golden sand and ocean waves, natural golden-hour sunlight, sea breeze atmosphere' },
  { re: /(?:游泳|swim|swimming|泳池|pool|游泳池)/i, prompt: 'poolside with crystal blue water, bright sunny atmosphere, glistening water reflections' },

  // ── Nature / Outdoors ──
  { re: /(?:森林|forest|树林|woods|丛林|jungle)/i, prompt: 'in a lush forest with dappled sunlight filtering through tall trees, magical natural atmosphere' },
  { re: /(?:山上|山顶|mountain|hiking|爬山|登山)/i, prompt: 'on a mountain summit with panoramic views, wind in her hair, golden alpine light, epic natural scenery' },
  { re: /(?:花园|garden|花田|flower field|薰衣草|lavender|樱花|cherry blossom)/i, prompt: 'in a beautiful garden surrounded by blooming flowers, soft natural light, dreamy floral atmosphere' },
  { re: /(?:公园|park|散步|户外|outdoor)/i, prompt: 'outdoors in a scenic park with greenery and natural light, relaxed candid atmosphere' },
  { re: /(?:雪地|snow|下雪|雪景|滑雪|ski)/i, prompt: 'in a snowy winter landscape, soft diffused light, snowflakes in the air, cozy winter atmosphere' },
  { re: /(?:日落|sunset|夕阳|黄昏|sunrise|日出|清晨)/i, prompt: 'during golden hour with warm sunset light painting the sky in orange and pink tones' },

  // ── Urban / City ──
  { re: /(?:城市|city|都市|downtown|市中心|skyline)/i, prompt: 'in a vibrant city with skyscrapers and urban energy, soft city lights bokeh, modern metropolitan atmosphere' },
  { re: /(?:夜景|night view|霓虹|neon|酒吧|bar|夜店|club)/i, prompt: 'in a neon-lit urban nightscape, colorful city lights reflecting on wet streets, moody cinematic atmosphere' },
  { re: /(?:街道|street|逛街|shopping|商场|mall|商店)/i, prompt: 'on a stylish city street with shop windows and urban backdrop, natural daylight, candid street photography vibe' },

  // ── Indoor / Home ──
  { re: /(?:浴室|洗澡|淋浴|bathroom|shower|浴缸|bathtub)/i, prompt: 'in a softly lit bathroom with warm steam, intimate and relaxed atmosphere' },
  { re: /(?:卧室|床上|bedroom|on the bed)/i, prompt: 'in her bedroom with warm lamp light, soft cozy bedding, intimate home atmosphere' },
  { re: /(?:厨房|kitchen|做饭|cooking|烘焙|baking)/i, prompt: 'in a bright modern kitchen, warm homey lighting, playful cooking atmosphere' },
  { re: /(?:客厅|living room|沙发|sofa|电视|tv)/i, prompt: 'in a cozy living room with soft warm lighting, relaxed home atmosphere' },

  // ── Travel / Transport ──
  { re: /(?:飞机|airplane|flight|机场|airport|航班)/i, prompt: 'inside an airplane cabin or airport terminal, soft window light, travel atmosphere' },
  { re: /(?:火车|train|高铁|地铁|subway|地铁)/i, prompt: 'inside a modern train with large windows, passing scenery, travel vibe' },
  { re: /(?:旅行|travel|trip|旅游|度假|vacation|holiday)/i, prompt: 'on vacation at a scenic destination, bright happy travel atmosphere, natural golden light' },

  // ── Entertainment ──
  { re: /(?:电影院|cinema|movie|电影|影院)/i, prompt: 'in a dark cinema with soft screen glow, cozy movie-watching atmosphere' },
  { re: /(?:游乐园|theme park|迪士尼|disney|过山车|roller coaster)/i, prompt: 'at a theme park with colorful rides in the background, bright cheerful atmosphere, fun energy' },
  { re: /(?:音乐|concert|演唱会|live house|音乐节|music festival)/i, prompt: 'at a live music venue with colorful stage lights, energetic concert atmosphere' },
  { re: /(?:健身|gym|fitness|瑜伽|yoga|运动|workout)/i, prompt: 'in a modern gym or fitness studio, bright clean lighting, athletic energy' },

  // ── Seasonal / Festival ──
  { re: /(?:圣诞|christmas|xmas)/i, prompt: 'in a festive Christmas setting with twinkling lights and decorations, warm holiday atmosphere' },
  { re: /(?:新年|new year|跨年|countdown)/i, prompt: 'celebrating New Year with fireworks in the night sky, festive sparkling atmosphere' },
];

/**
 * Extract a rich scene description from chat context + user request.
 * Scans the combined text blob against SCENE_RULES and returns the first match.
 * This is the primary entry point used by generate-image/route.ts to enrich
 * the LLM prompt with contextual scene information.
 */
export function extractSceneFromContext(
  userRequest: string,
  recent?: ChatContextLine[] | null,
): string | null {
  const blob = [
    ...(recent || []).slice(-10).map((line) => String(line.content || '').replace(/\*[^*]{0,120}\*/g, ' ')),
    userRequest,
  ].join(' ').slice(-2200);

  for (const rule of SCENE_RULES) {
    if (rule.re.test(blob)) return rule.prompt;
  }
  return null;
}

/**
 * Detect time-of-day cues from context.
 */
export function extractTimeOfDay(
  userRequest: string,
  recent?: ChatContextLine[] | null,
): string | null {
  const blob = [
    ...(recent || []).slice(-10).map((line) => String(line.content || '').replace(/\*[^*]{0,120}\*/g, ' ')),
    userRequest,
  ].join(' ').slice(-2200);

  if (/(?:早上|清晨|morning|dawn|日出|sunrise)/i.test(blob)) return 'soft morning golden light';
  if (/(?:中午|noon|midday|正午)/i.test(blob)) return 'bright midday sunlight';
  if (/(?:下午|afternoon|午后)/i.test(blob)) return 'warm afternoon light';
  if (/(?:傍晚|黄昏|sunset|夕阳|golden hour)/i.test(blob)) return 'golden hour sunset light';
  if (/(?:晚上|夜里|night|evening|夜晚)/i.test(blob)) return 'natural evening atmosphere with soft ambient light';
  return null;
}

/**
 * Detect activity/action cues from context (e.g. "looking at whales", "taking a selfie with fish").
 */
export function extractActivityFromContext(
  userRequest: string,
  recent?: ChatContextLine[] | null,
): string | null {
  const blob = [
    ...(recent || []).slice(-10).map((line) => String(line.content || '').replace(/\*[^*]{0,120}\*/g, ' ')),
    userRequest,
  ].join(' ').slice(-2200);

  if (/(?:看.*鲸|watch.*whale|观鲸|whale watching)/i.test(blob)) return 'gazing in wonder at whales swimming behind the glass, hand gently touching the tank';
  if (/(?:拍照|自拍|taking.*photo|taking.*selfie|pose for)/i.test(blob)) return 'posing for a photo, natural confident smile';
  if (/(?:吃|eating|dining|享用|品尝)/i.test(blob)) return 'enjoying a meal, relaxed and happy expression';
  if (/(?:走|walking|散步|strolling)/i.test(blob)) return 'walking casually, candid natural stride';
  if (/(?:跑|running|jogging)/i.test(blob)) return 'in mid-stride, dynamic energetic pose';
  if (/(?:坐|sitting|坐着)/i.test(blob)) return 'sitting gracefully with relaxed elegant posture';
  if (/(?:靠|leaning|倚)/i.test(blob)) return 'leaning casually against a surface, relaxed cool pose';
  return null;
}

export function buildImageActionFromChat(userRequest: string, recent?: ChatContextLine[] | null): ChatImageIntent {
  const base = parseChatImageIntent(userRequest || 'send me a selfie');
  const blob = [...(recent || []).slice(-10).map((line) => String(line.content || '').replace(/\*[^*]{0,120}\*/g, ' ')), userRequest].join(' ').slice(-2200);
  let action = base.action || 'taking a brand-new natural girlfriend photo';
  let kind: ChatImageIntent['kind'] = base.kind === 'custom' ? 'selfie' : base.kind;
  for (const mapping of ACTION_MAP) if (mapping.re.test(blob)) { action = mapping.action; kind = mapping.kind; break }

  // ── Context-aware scene detection (expanded 20+ locations) ──
  const scene: string[] = [];
  const sceneDesc = extractSceneFromContext(userRequest, recent);
  if (sceneDesc) {
    scene.push(sceneDesc);
    kind = 'scene';
  } else {
    // Fallback: legacy simple scene detection
    if (/(?:海边|沙滩|beach|ocean)/i.test(blob)) scene.push('at the beach with natural daylight');
    else if (/(?:咖啡|咖啡店|cafe|coffee shop)/i.test(blob)) scene.push('in a cozy cafe');
    else if (/(?:浴室|洗澡|淋浴|bathroom|shower)/i.test(blob)) scene.push('in a softly lit bathroom');
    else if (/(?:卧室|床上|bedroom|on the bed)/i.test(blob)) scene.push('in her bedroom with warm light');
    else if (/(?:户外|公园|outdoor|park)/i.test(blob)) scene.push('outdoors in natural light');
  }

  // ── Time of day ──
  const timeOfDay = extractTimeOfDay(userRequest, recent);
  if (timeOfDay) scene.push(timeOfDay);

  // ── Activity ──
  const activity = extractActivityFromContext(userRequest, recent);
  if (activity) scene.push(activity);

  return { wantsImage: true, action: [action, ...scene, 'freshly generated scene, not a copy of any previous photo'].join(', '), kind, confidence: Math.max(base.confidence, 0.8) };
}

/**
 * Detect whether the user is describing a scene/activity (even without explicitly
 * asking for a photo). This enables automatic image generation when the user
 * shares what they are doing — e.g. "今天去海洋馆看了鲸鱼" triggers a photo
 * of the girlfriend at the aquarium watching whales.
 *
 * Returns true when the message contains a location/activity keyword AND
 * the girlfriend is the implicit subject (she went with him / she is there).
 */
const SCENE_TRIGGER_PATTERNS: RegExp[] = [
  // Chinese: went to [place] / saw [thing] / at [place] doing [activity]
  /(?:去|到了|来了|在).{0,6}(?:海洋馆|水族馆|动物园|餐厅|咖啡|海边|沙滩|公园|山上|花园|商场|电影院|游乐园|健身房|机场|火车|酒吧|夜市|寺庙|博物馆|图书馆|学校|公司)/i,
  /(?:看了?|见了?|摸了?|喂了?).{0,4}(?:鲸鱼|海豚|熊猫|长颈鹿|大象|狮子|老虎|猴子|鲨鱼|水母|企鹅|孔雀)/i,
  // English equivalents
  /(?:went to|visited|at|in).{0,10}(?:aquarium|zoo|restaurant|cafe|beach|park|mall|cinema|gym|airport|train|bar|museum|library|school|office)/i,
  /(?:saw|watched|fed|touched).{0,4}(?:whale|dolphin|panda|giraffe|elephant|lion|tiger|monkey|shark|jellyfish|penguin|peacock)/i,
  // Activity descriptions
  /(?:吃了|正在吃|eating|having).{0,4}(?:火锅|烧烤|日料|寿司|拉面|西餐|午餐|晚餐|早餐|甜品|cake|sushi|ramen|pizza|pasta)/i,
  /(?:在.*散步|walking|strolling|hiking|climbing|swimming|skiing|shopping)/i,
];

export function isSceneDescription(message: string): boolean {
  const text = String(message || '').trim();
  if (!text || text.length < 4) return false;
  return SCENE_TRIGGER_PATTERNS.some((re) => re.test(text));
}
