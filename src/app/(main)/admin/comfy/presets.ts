/**
 * Quick Presets — 30 scene archetypes rendered per companion category.
 *
 * Each of the 4 categories (female / male / transgender / anime) gets 30
 * distinct scenes with category-appropriate subject, pose overrides, rendering
 * style and safety negative. Scenes default to gender-neutral participial
 * phrases; categories can override specific scenes for better fit.
 *
 * Default tone is high-NSFW per the admin Creation Workbench requirements:
 * NSFW-tagged scenes get an explicit adult boost with quality amplifiers;
 * all subjects are framed as consenting adults age 25+ and the shared BLOCKED
 * guardrails always apply.
 */

import { BLOCKED, COMPANION_CATEGORIES, type CompanionCategory } from '@/lib/companion-category';

export type GenPreset = {
  id: string;
  name: string;
  desc: string;
  prompt: string;
  negative: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  nsfw?: boolean;
  /** Recommended LoRA stack hint for admin UI. */
  loraHint?: string;
};

/** A subject-agnostic scene archetype. */
type Scene = {
  id: string;
  name: string;
  desc: string;
  nsfw: boolean;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  /** Participial phrase describing pose / setting / lighting / reveal. */
  scene: string;
};

/* Base 30 steps; NSFW scenes get 32 for finer skin/anatomy detail. */
const P = { width: 832, height: 1216, steps: 30, cfg: 1 };
const TALL = { width: 768, height: 1344, steps: 30, cfg: 1 };
const P_NSFW = { width: 832, height: 1216, steps: 32, cfg: 1 };
const TALL_NSFW = { width: 768, height: 1344, steps: 32, cfg: 1 };

/** 30 distinct scene archetypes (10 sensual-lifestyle + 20 explicit adult). */
const SCENES: Scene[] = [
  // ── Sensual lifestyle (10) ──
  { id: 'portrait-soft', name: '窗边人像', desc: '3/4 构图 · 明亮侧光 · 适合主页卡', nsfw: true, ...P,
    scene: 'leaning against a bright apartment window, turning toward the viewer with relaxed shoulders and a teasing smile' },
  { id: 'fullbody-glam', name: '夜景全身', desc: '大长腿 · 站姿变化 · 城市夜景', nsfw: true, ...TALL,
    scene: 'posing beside a rooftop railing in a fitted evening outfit, weight resting on one hip, looking seductively at the viewer' },
  { id: 'selfie-flash', name: '镜面自拍', desc: '自拍角度 · 闪光 · 自然身体语言', nsfw: true, ...P,
    scene: 'taking a playful bathroom mirror selfie in a crop top, holding a phone, naturally shifting one hip' },
  { id: 'cafe-day', name: '咖啡馆日景', desc: '日常甜美 · 明亮 · 表情生动', nsfw: true, ...P,
    scene: 'sitting beside a cafe window with chin resting on one hand, smiling warmly and flirtatiously at the viewer' },
  { id: 'sakura-glance', name: '樱花回眸', desc: '花瓣飘落 · 回头一笑 · 春日氛围', nsfw: true, ...P,
    scene: 'standing under a cherry blossom tree, petals drifting around, turning to look over the shoulder with a warm inviting smile' },
  { id: 'pool-lounge', name: '泳池慵懒', desc: '泳装 · 日光浴 · 度假感', nsfw: true, ...P,
    scene: 'lounging on a poolside deck chair in a stylish swimsuit, sunglasses pushed up, sipping a cocktail while playfully eyeing the viewer' },
  { id: 'kitchen-morning', name: '厨房清晨', desc: '居家感 · oversize衬衫 · 温暖晨光', nsfw: true, ...P,
    scene: 'in a bright kitchen wearing an oversized shirt, standing on tiptoes to reach a shelf, glancing back with a sleepy cute smile' },
  { id: 'rainy-stroll', name: '雨天伞下', desc: '湿润氛围 · 透明伞 · 安静美感', nsfw: true, ...P,
    scene: 'walking in light rain under a clear umbrella, raindrops bokeh in the background, looking up at the viewer with gentle eyes' },
  { id: 'couch-read', name: '沙发阅读', desc: '蜷缩姿态 · 居家慵懒 · 柔和灯光', nsfw: true, ...P,
    scene: 'curled up on a plush couch with a book, legs tucked under a soft blanket, glancing up with warm affectionate eyes' },
  { id: 'moto-jacket', name: '机车皮衣', desc: '帅气反差 · 街头感 · 自信回眸', nsfw: true, ...P,
    scene: 'sitting on a motorcycle in a fitted leather jacket, looking back over the shoulder with a confident flirty grin' },

  // ── Explicit adult (20) — 30 steps for finer skin/anatomy detail ──
  { id: 'nsfw-intimate', name: '卧室私密', desc: '3/4 身材展示 · 暧昧光 · 成人氛围', nsfw: true, ...P_NSFW,
    scene: 'reclining naturally on a bed in sensual underwear, arching slightly toward the viewer with inviting eye contact' },
  { id: 'bed-stretch', name: '床上伸展', desc: '慵懒伸展 · 肩颈线条 · 清晨诱惑', nsfw: true, ...P_NSFW,
    scene: 'stretching lazily on messy silk sheets, back arched with arms overhead, hair tousled, giving a sleepy seductive glance' },
  { id: 'steam-bath', name: '浴室水雾', desc: '蒸汽朦胧 · 水珠肌肤 · 若隐若现', nsfw: true, ...P_NSFW,
    scene: 'in a steamy glass shower, water droplets running down bare skin, one hand pressed to the glass, looking at the viewer through the mist' },
  { id: 'lace-robe', name: '蕾丝晨袍', desc: '半透蕾丝 · 肩带滑落 · 私密晨间', nsfw: true, ...P_NSFW,
    scene: 'standing by the bedroom window in a sheer lace robe slipping off one shoulder, backlit by morning light, turning with a knowing smile' },
  { id: 'couch-seduce', name: '沙发诱惑', desc: '跪坐姿态 · 低胸装 · 暧昧灯光', nsfw: true, ...P_NSFW,
    scene: 'kneeling on a velvet couch in a low-cut outfit, leaning forward toward the viewer with parted lips and heavy-lidded eyes' },
  { id: 'night-window', name: '落地窗夜', desc: '城市夜景 · 剪影光 · 背部线条', nsfw: true, ...P_NSFW,
    scene: 'standing before a floor-to-ceiling window at night, city lights behind, wearing only thin silk nightwear, looking back over a bare shoulder' },
  { id: 'wet-pool', name: '泳池湿身', desc: '湿发贴身 · 出水瞬间 · 身体曲线', nsfw: true, ...P_NSFW,
    scene: 'emerging from a pool at night, wet hair clinging to the shoulders, swimwear soaked and clinging, water streaming down the curves, locking eyes with the viewer' },
  { id: 'yoga-flex', name: '瑜伽体式', desc: '柔韧身体 · 紧身衣 · 曲线张力', nsfw: true, ...P_NSFW,
    scene: 'holding a deep yoga stretch in tight leggings and a fitted top, back arched, glancing at the viewer from between the arms with a teasing expression' },
  { id: 'fitting-room', name: '试衣间', desc: '镜前换装 · 半拉帘 · 偷看视角', nsfw: true, ...P_NSFW,
    scene: 'in a boutique fitting room, curtain half drawn, caught mid-change in lacy underwear, meeting the viewer gaze in the mirror without shame' },
  { id: 'office-desk', name: '办公室秘密', desc: '桌面坐姿 · 禁忌感 · 暧昧灯光', nsfw: true, ...P_NSFW,
    scene: 'sitting on the edge of an office desk after hours, bottom hiked slightly, top unbuttoned low, toying with glasses while staring at the viewer' },
  { id: 'car-night', name: '车内暧昧', desc: '后座氛围 · 霓虹透窗 · 私密空间', nsfw: true, ...P_NSFW,
    scene: 'reclining in a car backseat at night, neon light washing over, one leg resting on the seat, beckoning the viewer closer' },
  { id: 'balcony-night', name: '阳台夜色', desc: '晚风轻拂 · 薄纱睡衣 · 城市灯火', nsfw: true, ...P_NSFW,
    scene: 'leaning over a balcony railing at night in sheer nightwear, breeze lifting the fabric, turning to catch the viewer staring with an amused smirk' },
  { id: 'silk-slip', name: '丝绸睡衣', desc: '吊带滑落 · 侧卧曲线 · 午夜蓝调', nsfw: true, ...P_NSFW,
    scene: 'lying on the side on dark silk sheets in thin silk nightwear, one strap fallen, tracing the collarbone while holding the viewer gaze' },
  { id: 'massage-oil', name: '精油按摩', desc: '俯卧曲线 · 油光肌肤 · 烛光氛围', nsfw: true, ...P_NSFW,
    scene: 'lying face down on a massage table by candlelight, glistening oil on the bare back, lifting the chin to give a heavy-lidded look' },
  { id: 'dance-private', name: '舞娘私语', desc: '慢舞身姿 · 昏暗灯光 · 挑逗节奏', nsfw: true, ...P_NSFW,
    scene: 'dancing slowly in a dim neon-lit room, hips swaying, fingertips trailing down the body, eyes locked on the viewer' },
  { id: 'library-corner', name: '图书馆角落', desc: '书架之间 · 俯身 · 安静禁忌', nsfw: true, ...P_NSFW,
    scene: 'bending to pick up a book in a quiet library aisle, outfit riding up, glancing back with a shy but willing expression' },
  { id: 'hot-spring', name: '温泉雾气', desc: '水面之上 · 蒸汽遮掩 · 湿润红晕', nsfw: true, ...P_NSFW,
    scene: 'soaking in a steaming outdoor hot spring at dusk, bare shoulders above the waterline, face flushed, watching the viewer approach through the mist' },
  { id: 'gym-flex', name: '健身私教', desc: '汗水光泽 · 运动装 · 力量曲线', nsfw: true, ...P_NSFW,
    scene: 'bent over a gym bench in tight workout shorts, skin glistening with sweat, looking back with a challenging smirk' },
  { id: 'vanity-mirror', name: '化妆台', desc: '镜前梳妆 · 口红 · 吊带背影', nsfw: true, ...P_NSFW,
    scene: 'sitting at a vanity in a silk camisole, applying lipstick in the mirror, catching the viewer reflection and smiling slowly' },
  { id: 'red-dress', name: '红裙晚宴', desc: '高开叉 · 深V · 晚宴尤物', nsfw: true, ...TALL_NSFW,
    scene: 'posing in a slit red evening outfit, one leg revealed, neckline plunging, tilting the chin down and staring up with smoldering eyes' },
];

// ─── Category-specific subject, style, negative & LoRA hints ─────────────

const CATEGORY_BASE: Record<CompanionCategory, {
  subject: string;
  style: string;
  negative: string;
  /** Extra quality terms appended to every prompt. */
  quality: string;
  /** Recommended LoRA stack for this category. */
  loraHint: string;
}> = {
  female: {
    subject: 'A breathtaking adult woman age 25+, voluptuous feminine hourglass figure, full natural breasts, soft curves, bare glowing skin, detailed skin pores',
    style: 'photorealistic, hyperdetailed realistic skin texture with visible pores and peach fuzz, warm cinematic intimate lighting, shallow depth of field, erotic high-resolution editorial boudoir photography, 8k uhd, raw photo',
    negative: `male body, masculine face, flat chest, plastic skin, airbrushed, cartoon, painting, ${BLOCKED}`,
    quality: 'masterpiece, best quality, ultra detailed, sharp focus, professional color grading',
    loraHint: 'hyperreal + skin_detail',
  },
  male: {
    subject: 'A striking adult man age 25+, athletic masculine physique, broad shoulders, defined muscular torso and abs, v-line, bare toned skin, visible muscle definition',
    style: 'photorealistic, hyperdetailed realistic skin texture with visible pores, warm cinematic intimate lighting, shallow depth of field, erotic high-resolution editorial male photography, 8k uhd, raw photo',
    negative: `female body, breasts, feminine face, soft body, chubby, plastic skin, airbrushed, cartoon, painting, ${BLOCKED}`,
    quality: 'masterpiece, best quality, ultra detailed, sharp focus, professional color grading, masculine aesthetic',
    loraHint: 'photoreal + skin_detail',
  },
  transgender: {
    subject: 'A beautiful adult transgender woman age 25+, confident authentic feminine presentation, elegant curvy proportions, soft glowing skin, graceful features, natural beauty',
    style: 'photorealistic, hyperdetailed realistic skin texture with visible pores and peach fuzz, warm cinematic intimate lighting, shallow depth of field, erotic high-resolution editorial boudoir photography, 8k uhd, raw photo',
    negative: `caricature, fetishized stereotype, exaggerated features, plastic skin, airbrushed, cartoon, painting, ${BLOCKED}`,
    quality: 'masterpiece, best quality, ultra detailed, sharp focus, professional color grading, authentic beauty',
    loraHint: 'hyperreal + skin_detail',
  },
  anime: {
    subject: 'An unmistakably adult anime character age 25+, mature facial features, voluptuous adult proportions, expressive seductive eyes, detailed anime anatomy',
    style: 'polished 2D illustration, clean line art, rich cel shading, detailed background, premium erotic anime key visual, studio quality, vibrant colors, dynamic composition',
    negative: `childlike proportions, school uniform, loli, shota, photorealistic, photograph, 3d render, flat color, sketch, ${BLOCKED}`,
    quality: 'masterpiece, best quality, ultra detailed, official art, highres, absurdres',
    loraHint: 'none (anime style via checkpoint)',
  },
};

// ─── Category-specific scene overrides ───────────────────────────────────
// Where the generic scene does not fit a category well, override the
// participial phrase. Keyed by scene id.

const MALE_OVERRIDES: Record<string, string> = {
  'portrait-soft': 'leaning against a bright apartment window in an open-collar shirt, turning toward the viewer with relaxed confidence and a smoldering gaze',
  'fullbody-glam': 'standing beside a rooftop railing in a tailored suit jacket over bare chest, one hand in pocket, looking powerfully at the viewer',
  'selfie-flash': 'taking a gym mirror selfie shirtless, phone in one hand, flexing subtly with a confident smirk',
  'kitchen-morning': 'in a bright kitchen wearing only low-slung sweatpants, making coffee with bare torso, glancing back with a sleepy masculine smile',
  'couch-read': 'sprawled on a leather couch with a book, one arm behind the head, shirt unbuttoned, glancing up with warm inviting eyes',
  'lace-robe': 'standing by the bedroom window in an open silk robe revealing bare chest, backlit by morning light, turning with a confident smirk',
  'couch-seduce': 'sitting on a velvet couch with legs spread, leaning back with arms along the backrest, staring at the viewer with intense eyes',
  'night-window': 'standing before a floor-to-ceiling window at night, city lights behind, wearing only low boxer briefs, looking back over a sculpted shoulder',
  'yoga-flex': 'holding a powerful yoga stretch in fitted shorts, torso bare and glistening, muscles defined, glancing at the viewer with focused intensity',
  'fitting-room': 'in a boutique fitting room, curtain half drawn, caught shirtless in fitted trousers, meeting the viewer gaze in the mirror with quiet confidence',
  'office-desk': 'sitting on the edge of an office desk after hours, tie loosened, shirt open to the sternum, sleeves rolled, staring intensely at the viewer',
  'silk-slip': 'lying on the side on dark silk sheets in low boxer briefs, one arm under the head, torso bare, holding the viewer gaze with smoldering eyes',
  'massage-oil': 'lying face down on a massage table by candlelight, glistening oil on a muscular bare back, lifting the chin with a heavy-lidded look',
  'dance-private': 'moving slowly in a dim neon-lit room, rolling the shoulders, fingertips tracing the abs, eyes locked on the viewer',
  'vanity-mirror': 'standing at a bathroom mirror in low-slung jeans, adjusting a watch, catching the viewer reflection with a slow smile',
  'red-dress': 'posing in a tailored black suit with open collar, one hand adjusting a cufflink, tilting the chin down and staring up with smoldering eyes',
};

const TRANSGENDER_OVERRIDES: Record<string, string> = {
  'fullbody-glam': 'posing beside a rooftop railing in an elegant fitted gown, celebrating confident curves, looking seductively at the viewer',
  'moto-jacket': 'sitting on a motorcycle in a fitted leather jacket over a lace top, looking back over the shoulder with a bold confident grin',
  'gym-flex': 'in a yoga studio in fitted leggings and a sports bra, toned and confident, looking at the viewer with a playful challenge',
  'office-desk': 'sitting on the edge of an office desk after hours in a pencil skirt and silk blouse, legs crossed, toying with a pen while staring at the viewer',
};

const ANIME_OVERRIDES: Record<string, string> = {
  'portrait-soft': 'leaning against a bright window in a fantasy tower, turning toward the viewer with relaxed shoulders and a teasing smile, wind blowing hair',
  'fullbody-glam': 'posing on a moonlit castle balcony in an elegant fantasy gown, wind catching the fabric, looking seductively at the viewer',
  'sakura-glance': 'standing under a magical cherry blossom tree with glowing petals, turning to look over the shoulder with a warm inviting smile',
  'pool-lounge': 'lounging beside a fantasy hot spring in a revealing swimsuit, steam rising, playfully eyeing the viewer',
  'rainy-stroll': 'walking in magical rain under a glowing umbrella, raindrops sparkling like stars, looking up at the viewer with gentle eyes',
  'moto-jacket': 'riding a fantasy steed in sleek armor, looking back over the shoulder with a confident flirty grin',
  'steam-bath': 'in a fantasy bathhouse with magical steam, water droplets on bare skin, one hand on the wooden wall, looking at the viewer through the mist',
  'lace-robe': 'standing by a castle window in a sheer magical robe slipping off one shoulder, backlit by ethereal light, turning with a knowing smile',
  'night-window': 'standing before a grand castle window at night, starfield behind, wearing only thin silk nightwear, looking back over a bare shoulder',
  'wet-pool': 'emerging from a magical spring at night, wet hair clinging, swimwear soaked and clinging, water streaming with sparkles, locking eyes with the viewer',
  'hot-spring': 'soaking in a steaming fantasy onsen at dusk, bare shoulders above the waterline, face flushed, watching the viewer approach through magical mist',
  'dance-private': 'dancing slowly in a dim neon-lit fantasy tavern, hips swaying, magical particles trailing from fingertips, eyes locked on the viewer',
};

function getSceneOverride(category: CompanionCategory, sceneId: string): string | undefined {
  switch (category) {
    case 'male': return MALE_OVERRIDES[sceneId];
    case 'transgender': return TRANSGENDER_OVERRIDES[sceneId];
    case 'anime': return ANIME_OVERRIDES[sceneId];
    default: return undefined;
  }
}

// ─── NSFW boost per category (high-explicitness for admin workbench) ─────

const NSFW_BOOST: Record<CompanionCategory, string> = {
  female: 'explicit consensual adult scene, highly provocative erotic pose, intimate sexual atmosphere, revealing sheer lingerie, full visible cleavage, bare midriff and hips, nipples visible through fabric, adult editorial boudoir, extremely suggestive body language, parted wet lips, heavy bedroom eyes, flushed skin, erotic tension, naked curves on display, sensual skin glow, provocative arching',
  male: 'explicit consensual adult scene, highly provocative erotic pose, intimate sexual atmosphere, completely shirtless revealing sculpted torso, defined abs and v-line fully visible, low-slung waistband revealing hip bones, adult editorial, extremely suggestive masculine body language, intense predatory gaze, glistening bare chest, erotic tension, muscular definition on display, sensual skin glow',
  transgender: 'explicit consensual adult scene, highly provocative erotic pose, intimate sexual atmosphere, revealing sheer lingerie, confident authentic beautiful body on display, elegant curves celebrated, nipples visible through fabric, adult editorial boudoir, extremely suggestive body language, alluring seductive expression, flushed skin, erotic tension, naked curves visible, sensual skin glow, provocative arching',
  anime: 'explicit consensual adult scene, highly provocative erotic pose, intimate sexual atmosphere, extremely revealing outfit, exaggerated voluptuous adult curves, ecchi composition with fanservice angles, suggestive body language, seductive half-lidded expression, mature erotic themes, ahegao-adjacent expression, clothing pulled aside, erotic tension, glistening anime skin highlights',
};

/** Alluring mood applied to every scene (all scenes are high-NSFW in admin workbench). */
const SFW_MOOD = 'elegant, deeply alluring expression, intensely sensual mood, captivating erotic presence, inviting direct eye contact';

// ─── Build presets ───────────────────────────────────────────────────────

function buildCategoryPresets(category: CompanionCategory): GenPreset[] {
  const base = CATEGORY_BASE[category];
  return SCENES.map((sc) => {
    const sceneText = getSceneOverride(category, sc.id) || sc.scene;
    const boost = `${NSFW_BOOST[category]}, ${SFW_MOOD}`;
    return {
      id: `${category}-${sc.id}`,
      name: sc.name,
      desc: sc.desc,
      prompt: [base.subject, sceneText, boost, base.quality, base.style]
        .filter(Boolean)
        .join(', '),
      negative: base.negative,
      width: sc.width,
      height: sc.height,
      steps: sc.steps,
      cfg: sc.cfg,
      nsfw: sc.nsfw,
      loraHint: base.loraHint,
    };
  });
}

/** 30 quick presets for each companion category (120 total). */
export const CATEGORY_PRESETS: Record<CompanionCategory, GenPreset[]> = Object.fromEntries(
  COMPANION_CATEGORIES.map((category) => [category, buildCategoryPresets(category)]),
) as Record<CompanionCategory, GenPreset[]>;

/** Presets for a given category (fallback to female). */
export function getPresetsForCategory(category: CompanionCategory): GenPreset[] {
  return CATEGORY_PRESETS[category] ?? CATEGORY_PRESETS.female;
}
