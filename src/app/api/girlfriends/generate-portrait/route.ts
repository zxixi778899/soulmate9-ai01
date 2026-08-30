import { NextRequest, NextResponse } from 'next/server';
import { uploadDataUrl, resolveImageUrl, toPublicUrl } from '@/lib/storage';
import { getAuthUser } from '@/lib/supabase-server';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { sanitizeBlurKeywords } from '@/lib/prompt';
import { normalizeCompanionCategory, normalizeCompanionRenderStyle } from '@/lib/companion-category';
import { buildIdReferencePrompt, type IdFraming } from '@/lib/companion-prompt-pipeline';
import { buildStudioPromptEnhancement, studioNegativePrompt } from '@/lib/comfy-console/studio-profile';
import { encodeFamilyPrompt, resolvePromptSubject } from '@/lib/prompt/prompt-protocols';
import { resolveImageGenerationRoute } from '@/lib/image-generation-routing';
import { routeImageGeneration } from '@/lib/image-router';
import { loadComfyConfig } from '@/lib/comfy-console/store';
import { buildReferenceGenerationPlan } from '@/lib/reference-generation-plan';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { normalizeCreatorPreset, type CreatorPreset } from '@/lib/creator-presets';
import {
  findCachedPresetPortrait,
  recordPresetPortraitStat,
  writebackPresetPortrait,
  visualMatchesPreset,
} from '@/lib/preset-portrait-cache';
import { GIRLFRIEND_SCENE_RECIPES } from '@/lib/prompt/girlfriend';
import { buildAutoLoraStack, buildKeywordLoras } from '@/lib/auto-lora';
import { sanitizeLoraForVolume, getVerifiedInstalledLoraSet } from '@/lib/runpod-loras';
import { translatePromptToEnglish } from '@/lib/prompt-translate';
import { forwardLegacyGeneration } from '@/lib/gen-hub';
import { resolveIdentityKit, resolveIpAdapterWeight, type IdentityKitSupabaseClient } from '@/lib/identity-kit';

export const runtime = 'nodejs';
export const maxDuration = 300;

const PORTRAIT_GEN_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 }; // 30/h/user

function hairColorName(hexOrName: string): string {
  const v = (hexOrName || '').trim();
  if (!v.startsWith('#')) return v || 'brown';
  const map: Record<string, string> = {
    '#000000': 'black',
    '#4a3728': 'dark brown',
    '#6b3a2a': 'brown',
    '#d4a574': 'blonde',
    '#f5d742': 'golden blonde',
    '#e84393': 'pink',
    '#d946ef': 'magenta',
    '#8b5cf6': 'purple',
    '#3b82f6': 'blue',
    '#ef4444': 'red',
    '#ffffff': 'white',
  };
  return map[v.toLowerCase()] || 'colored';
}

/**
 * 构建肖像提示词（捏脸系统专用）
 * 特点：
 * - 质量前缀 + 主体描述 + 细节分层
 * - 自动性别/风格差异化
 * - 长度限制防止 token 溢出
 * - 稳定性 guardrails（手部/构图/眼神）
 */
function buildPortraitPrompt(input: {
  name?: string;
  visual_style?: string;
  ethnicity?: string;
  gender?: string;
  face_shape?: string;
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  body_type?: string;
  fashion_style?: string;
  appearance_prompt?: string;
  hairStyle?: string;
  hairColor?: string;
  eyeColor?: string;
  bodyType?: string;
  style?: string;
  personality?: string;
  skin_tone?: string;
  bust_shape?: string;
  height?: string;
  genome_prompt?: string;
}): string {
  const name = (input.name || 'an adult companion').trim();
  const ethnicity = input.ethnicity || 'mixed';
  const gender = input.gender || 'Female';
  const face = input.face_shape || 'oval';
  const hairStyle = input.hair_style || input.hairStyle || 'long flowing';
  const hairColor = hairColorName(input.hair_color || input.hairColor || 'brown');
  const eyeColor = input.eye_color || input.eyeColor || 'brown';
  const bodyType = input.body_type || input.bodyType || 'slim';
  const fashion = input.fashion_style || input.style || 'casual';
  const visual = (input.visual_style || 'realistic').toLowerCase();
  
  // 清理模糊关键词（NSFW guardrails）
  const extra = sanitizeBlurKeywords(
    [input.appearance_prompt, input.personality].filter(Boolean).join(', '),
  );
  const skinTone = sanitizeBlurKeywords(String(input.skin_tone || '').trim());
  const bustShape = sanitizeBlurKeywords(String(input.bust_shape || '').trim());
  const heightFrag = sanitizeBlurKeywords(String(input.height || '').trim());
  const genomeExtra = sanitizeBlurKeywords(String(input.genome_prompt || '').trim());

  // === 质量前缀（根据风格自适应）===
  const medium =
    visual === '2d' || visual === 'anime'
      ? 'a polished 2D anime character portrait with fully rendered colors and deliberate cel shading'
      : 'a natural editorial photograph with believable skin texture and soft directional light';
  
  const category = normalizeCompanionCategory({ gender });
  
  // === 体型描述（性别差异化）===
  const bodyDescription = category === 'male'
    ? `${bodyType} adult masculine build with broad shoulders and a defined torso`
    : category === 'transgender'
      ? `${bodyType} adult feminine silhouette with visibly mixed masculine and feminine physical traits`
      : `${bodyType} adult feminine figure with natural proportions`;

  // === 提示词部件（分层构建）===
  const parts = [
    // ① 质量描述（固定前缀）
    medium,
    
    // ② 主体人物
    `gorgeous young adult ${gender.toLowerCase()} age 22-28 named ${name}`,
    
    // ③ 面部特征
    `${ethnicity} features, ${face} face shape${skinTone ? `, ${skinTone}` : ''}`,
    
    // ④ 发型发色
    `${hairStyle} ${hairColor} hair`,
    
    // ⑤ 眼睛表情
    `${eyeColor} eyes looking at viewer`,
    
    // ⑥ 体型描述
    bodyDescription,
    
    // ⑦ 服装风格
    `wearing flattering ${fashion} outfit`,
    
    // ⑧ 额外细节（截断保护）
    genomeExtra.slice(0, 200),
    extra.slice(0, 180),
    
    // ⑨ 稳定性 guardrails（防止手部崩坏/构图异常）
    'clear eyes, complete head in frame, relaxed shoulders, natural asymmetrical posture, coherent hands',

    // ⑩ 千人千面 micro-cue：基于 baseline 字段（脸型/发型/体型/服装/personality …）
    // 派生出来的面部 / 发型 / 体型 / 服装微细节。确定性 hash → 同输入同 cue；
    // 不同 baseline → 不同 cue → 不同脸/不同体型，让"千人千面"真的体现。
    buildMicroCues(input),
  ].filter(Boolean);

  // === 合并与长度控制 ===
  let prompt = parts.join(', ').replace(/\s{2,}/g, ' ').trim();
  
  // FLUX 限制 ~900 tokens，超出时从后向前截断
  if (prompt.length > 900) {
    prompt = prompt.slice(0, 900);
    const lastComma = prompt.lastIndexOf(',');
    if (lastComma > 700) prompt = prompt.slice(0, lastComma);
  }

  return prompt;
}

/**
 * 千人千面 prompt 重组：把捏脸表单里的字段映射成具体的面部 / 发型 / 体型 / 服装
 * 微细节 cue，让不同 baseline 选择产出明显不同的人物。
 *
 * 设计原则：
 * - 同输入永远得同一组 cue（确定性 → 可复现、可对比、debug 友好）
 * - 不与现有 hair_style / eye_color / fashion_style 字段冲突
 * - cue 池里每个值都跟 FLUX / Pony 训练分布对得上，不会被模型忽视
 * - 总长度 ≤ 220 chars，垫在 quality guardrails 之前
 */
function buildMicroCues(input: {
  name?: string;
  visual_style?: string;
  gender?: string;
  face_shape?: string;
  hair_style?: string;
  hair_color?: string;
  eye_color?: string;
  body_type?: string;
  fashion_style?: string;
  ethnicity?: string;
  personality?: string;
  skin_tone?: string;
  bust_shape?: string;
  height?: string;
}): string {
  const seed = hashInput(input);

  const faceShapes = ['oval', 'heart', 'round', 'square', 'diamond', 'oblong'];
  const noseCues = [
    'small upturned nose', 'straight narrow nose', 'soft button nose', 'defined Roman nose',
    'delicate narrow nose bridge', 'slightly rounded nose tip',
  ];
  const lipCues = [
    'full plush lips', 'soft natural lips', 'defined cupid\'s bow lips', 'subtle smile lines',
    'slightly parted lips', 'plump lower lip', 'slim elegant lips',
  ];
  const browCues = [
    'arched expressive brows', 'soft natural brows', 'defined straight brows', 'slightly feathered brows',
  ];
  const cheekCues = [
    'high cheekbones', 'soft rounded cheeks', 'defined cheekbones', 'subtle dimples',
  ];

  const hairLengthCues = ['shoulder-length', 'mid-back length', 'collarbone length', 'past shoulder length', 'long flowing', 'chin length'];
  const hairTextureCues = ['silky straight', 'soft wavy', 'lightly tousled', 'glossy smooth', 'fine textured'];
  const hairPartingCues = ['side-parted', 'center-parted', 'tousled with face-framing pieces', 'swept to one side', 'natural part'];
  const fringeCues = ['wispy side bangs', 'soft curtain bangs', 'full straight bangs', 'no bangs with hair tucked behind ear', 'face-framing layers'];

  const shoulderCues = ['narrow feminine shoulders', 'soft rounded shoulders', 'defined shoulders', 'slightly sloped shoulders'];
  const waistCues = ['narrow waist', 'defined waistline', 'soft hourglass waist', 'tapered waist'];
  const proportionsCues = ['long-legged proportions', 'balanced proportions', 'petite frame', 'elongated torso'];
  const bustCues = ['modest bust', 'soft natural bust', 'balanced bust proportions', 'gentle bustline'];

  const necklineCues = ['crew neckline', 'V-neckline', 'square neckline', 'sweetheart neckline', 'high collar', 'off-shoulder neckline'];
  const sleeveCues = ['long sleeves', 'short sleeves', 'sleeveless', 'cap sleeves', 'rolled sleeves'];
  const fitCues = ['fitted silhouette', 'relaxed fit', 'tailored cut', 'flowing fabric'];

  const pick = <T>(arr: T[]): T => arr[seed % arr.length];

  // 面部微细节（4 个槽位：鼻 / 唇 / 眉 / 颧）
  const faceParts = [
    pick(noseCues),
    pick(lipCues),
    pick(browCues),
    pick(cheekCues),
  ];

  // 发型微细节（4 个槽位：长度 / 质地 / 分缝 / 刘海）
  const hairParts = [
    pick(hairLengthCues),
    pick(hairTextureCues),
    pick(hairPartingCues),
    pick(fringeCues),
  ];

  // 体型微细节（4 个槽位）
  const bodyParts = [
    pick(shoulderCues),
    pick(waistCues),
    pick(proportionsCues),
    pick(bustCues),
  ];

  // 服装微细节（3 个槽位：领型 / 袖型 / 版型）
  const outfitParts = [
    pick(necklineCues),
    pick(sleeveCues),
    pick(fitCues),
  ];

  const all = [...faceParts, ...hairParts, ...bodyParts, ...outfitParts];
  return all.join(', ');
}

/**
 * 把输入字段拼成确定性 hash（不同 baseline → 不同 micro-cue 组合）。
 * 不引入 Node crypto 以保持单线程、轻量；够用即可。
 */
function hashInput(input: Record<string, unknown>): number {
  const parts: string[] = [];
  for (const key of [
    'face_shape', 'hair_style', 'hair_color', 'eye_color', 'body_type',
    'fashion_style', 'ethnicity', 'personality', 'skin_tone', 'bust_shape', 'height',
  ] as const) {
    const v = input[key];
    if (typeof v === 'string' && v.trim()) parts.push(`${key}=${v.trim()}`);
  }
  const joined = parts.join('|');
  let h = 2166136261;
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 把捏脸表单里的 personality / tags 转成一段轻量的"性格+吸引人"提示词尾巴。
 * bust-up 取景下，这一段决定了 ID 参考图能不能传递出人物感而不是纯头像。
 *
 * 设计原则：
 * - 不强行覆盖已有的 photo / lighting / outfit 字段
 * - 默认输出 8 个以内的英文 cue，长度 ≤ 110 chars
 * - 不区分 NSFW 强度（route 层已分别走 SFW/NSFW 流水线，此处只贴身份相关的吸引力线索）
 */
function buildAllureCues(personality?: string, visualStyle?: string): string {
  const raw = String(personality || '').toLowerCase();
  if (!raw.trim()) return '';

  const cues = new Set<string>();
  const rulePairs: Array<[RegExp, string]> = [
    [/\b(confident|assertive|dominant|强势|自信|女王)\b/i, 'confident expression'],
    [/\b(shy|gentle|soft|害羞|温柔|柔弱)\b/i, 'soft gentle expression'],
    [/\b(mysterious|cool|calm|神秘|冷酷|淡定)\b/i, 'mysterious composed expression'],
    [/\b(playful|cheeky|mischievous|俏皮|调皮|古灵)\b/i, 'playful smirk'],
    [/\b(seductive|alluring|flirty|sexy|妩媚|撩|魅惑|性感)\b/i, 'subtle alluring gaze'],
    [/\b(kind|warm|caring|温柔|体贴|暖|治愈)\b/i, 'warm inviting expression'],
    [/\b(smiling|smile|happy|笑|开朗)\b/i, 'natural relaxed smile'],
    [/\b(stern|serious|专注|认真|冷峻)\b/i, 'focused serious expression'],
  ];
  for (const [pattern, cue] of rulePairs) {
    if (pattern.test(raw)) cues.add(cue);
  }

  const isAnime = String(visualStyle || '').toLowerCase() === '2d' || String(visualStyle || '').toLowerCase() === 'anime';
  const postureCue = isAnime
    ? 'anime-style confident posture'
    : 'natural confident posture';
  cues.add(postureCue);

  const out = Array.from(cues).slice(0, 6).join(', ');
  return out.length > 110 ? out.slice(0, 107).replace(/[, ]+$/, '') + '…' : out;
}

/**
 * 给批量 portrait 中的每张图加独立的"角度/表情/光线"变体。
 * bust-up 取景下，只调角度和表情就能拉开 4 张图的人物感，避免看起来是同一张脸的复制粘贴。
 *
 * 关键约束：
 * - 不改 identity（身份锚点不能漂）
 * - 每个 slot 的 cue 长度 ≤ 80 chars
 * - 不依赖视觉风格（2D/3D/realistic 都用同一套）
 */
function buildBatchImageVariant(slot: number, total: number): string {
  const angles = [
    'three-quarter angle facing slightly left',
    'three-quarter angle facing slightly right',
    'direct frontal gaze',
    'subtle over-the-shoulder pose',
    'slight upward camera angle',
    'slight downward camera angle',
    'soft profile view',
  ];
  const expressions = [
    'soft confident expression',
    'natural relaxed smile',
    'pensive neutral expression',
    'warm inviting gaze',
    'playful smirk',
    'focused serious expression',
    'serene composed look',
  ];
  const lightings = [
    'warm natural window light',
    'soft even studio lighting',
    'dramatic side rim light',
    'golden hour warm glow',
    'cool ambient diffuse light',
    'subtle backlit halo effect',
  ];

  // 用 slot 数 + 一个简单的 hash 让同一 slot 每次重跑得到同一个变体（debug 友好）
  const idx = (seed: number, mod: number) => ((Math.sin(seed * 9301 + 49297) + 1) * 0.5 * mod) | 0;
  const angle = angles[idx(slot + 1, angles.length)];
  const expression = expressions[idx(slot + 17, expressions.length)];
  const lighting = lightings[idx(slot + 41, lightings.length)];

  const cues = [
    angle,
    expression,
    lighting,
    buildBatchPersonaNudge(slot, total),
    buildBatchMicroVariation(slot),
  ];
  return cues.filter(Boolean).join(', ').slice(0, 200);
}

/**
 * 给批量 portrait 中的每个 slot 加一个独立的"配件 / 姿态 / 微场景"小变化，
 * 让两张图即使 seed 不同也能在视觉层面拉开。cue 跟 buildMicroCues 完全正交
 * —— buildMicroCues 已经决定了"她是谁"，这里只决定"她这次穿的/摆的"。
 *
 * 关键约束：
 * - 不改 identity（鼻型/发色/体型仍然由主 prompt 决定）
 * - cue 跟 FLUX / Pony 训练分布对得上（headphones/pendant/手托腮 等）
 * - 同 slot 同 cue（确定性 → 可复现），不同 slot 不同 cue
 */
function buildBatchPersonaNudge(slot: number, total: number): string {
  const accessories = [
    'gold pendant necklace',
    'silver hoop earrings',
    'tiny stud earrings',
    'thin chain bracelet',
    'slim wristwatch',
    'ankle bracelet',
    'no accessories',
  ];
  const poses = [
    'hand on collarbone',
    'brushing hair behind ear',
    'chin tilted with soft smile',
    'weight on one shoulder',
    'arms crossed at waist',
    'fingers at temple',
    'hand on hip',
  ];
  const scenes = [
    'soft lamp glow background',
    'neutral studio backdrop',
    'window light from one side',
    'soft curtain backdrop',
    'warm bokeh lights',
    'plain gradient background',
  ];

  const idx = (seed: number, mod: number) => ((Math.sin(seed * 7919 + 31337) + 1) * 0.5 * mod) | 0;
  const pick = (arr: string[]) => arr[idx(slot + 1, arr.length)];

  return [pick(accessories), pick(poses), pick(scenes)].filter(Boolean).join(', ');
}

/**
 * 给批量 portrait 中的每个 slot 加一个轻量的"面部/发型微变体"。
 * 跟主 prompt 的 buildMicroCues 互补（主 prompt 决定她是谁；这里再稍微
 * 调整发型长度、刘海、唇形等细节，让两张图不是 100% 同一个人）。
 *
 * 注意：cue 故意只用 FLUX/Pony 训练里高频的描述词（"slightly longer hair"、
 * "subtle wavy hair"），避免跨模型漂移。
 */
function buildBatchMicroVariation(slot: number): string {
  const hairLengthVariants = [
    'hair worn slightly longer than usual',
    'hair tucked behind one ear',
    'a few loose face-framing strands',
    'hair swept up with loose tendrils',
  ];
  const expressionVariants = [
    'with the faintest hint of a smile',
    'with relaxed brows',
    'with subtly raised chin',
    'with softly pursed lips',
  ];
  const idx = (seed: number, mod: number) => ((Math.sin(seed * 6151 + 17239) + 1) * 0.5 * mod) | 0;
  return [
    hairLengthVariants[idx(slot + 1, hairLengthVariants.length)],
    expressionVariants[idx(slot + 13, expressionVariants.length)],
  ].filter(Boolean).join(', ');
}

/**
 * 给批量 portrait 中的每张图加 LoRA 强度抖动（±15%），让 prompt 整体漂移一点；
 * seed 本身已经是随机的，加上 LoRA 微抖动能进一步拉开 4 张图的差异。
 */
function jitterLoraStrengths(
  loras: Array<{ name: string; strength_model: number; strength_clip: number }> | undefined,
  slot: number,
): Array<{ name: string; strength_model: number; strength_clip: number }> | undefined {
  if (!loras || loras.length === 0) return loras;
  const factor = 0.85 + ((Math.sin(slot * 12.9898) + 1) * 0.5) * 0.30; // 0.85 ~ 1.15
  return loras.map((l) => ({
    ...l,
    strength_model: Math.max(0.1, Math.min(1.5, Number((l.strength_model * factor).toFixed(3)))),
    strength_clip: Math.max(0.1, Math.min(1.5, Number((l.strength_clip * factor).toFixed(3)))),
  }));
}

async function generateImage(input: {
  prompt: string;
  negativePrompt: string;
  category: ReturnType<typeof normalizeCompanionCategory>;
  renderStyle: ReturnType<typeof normalizeCompanionRenderStyle>;
  endpointId?: string;
  referenceImage?: string;
  /** NSFW 级别 1-5：捏脸系统不锁定，SFW/NSFW 均可生成 */
  nsfwLevel?: number;
  /** 每张图独立随机种子，避免 4 张完全相同 */
  seed?: number;
  /** 自动 LoRA 栈（已按运行卷校验） */
  loras?: Array<{ name: string; strength_model: number; strength_clip: number }>;
  /** IP-Adapter identity reference */
  ipAdapterImage?: string;
  ipAdapterWeight?: number;
  /** 批量生成时该 slot 的角度/表情/光线变体，避免 4 张图同脸 */
  variant?: string;
}): Promise<{ image?: string; jobId?: string; endpointId?: string; pending?: boolean }> {
  const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(input.nsfwLevel) || 1)));
  const route = resolveImageGenerationRoute({
    surface: 'companion',
    category: input.category,
    renderStyle: input.renderStyle,
    nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
  });
  const result = await routeImageGeneration({
    prompt: input.variant ? `${input.prompt}, ${input.variant}` : input.prompt,
    negative_prompt: input.negativePrompt,
    // 分辨率恢复：从 896×1152 → 1024×1344（≈30% 更多像素），
    // 给 bust-up 留出上半身构图空间 + 让 FLUX 有足够像素表达面部细节，
    // 平衡"速度 vs 清晰度 vs 上半身可见"三者。
    // 单图耗时回到 ~95s，对比 896×1152 的 ~70s。
    // 增强通道默认开 face_detailer（worker gate 已控制可行性，未就绪时 fail-open 跳过）：
    //   RUNPOD_PORTRAIT_FACE_DETAILER 默认 ON；RUNPOD_PORTRAIT_FACE_DETAILER=false 显式关
    //   RUNPOD_PORTRAIT_UPSCALE=N        默认 OFF；N=2|3|4 启用 4x-UltraSharp 倍率超分
    width: 1024,
    height: 1344,
    num_inference_steps: route.steps,
    guidance_scale: route.cfg,
    seed: input.seed,
    ip_adapter_image: input.ipAdapterImage || input.referenceImage || undefined,
    ip_adapter_weight: input.ipAdapterWeight ?? (input.referenceImage ? 0.65 : undefined),
    ckpt_name: route.checkpoint,
    sampler_name: route.sampler,
    scheduler: route.scheduler,
    clip_skip: route.clipSkip,
    model_family: route.modelFamily,
    force_provider: route.modelFamily === 'flux' ? 'runpod' : 'runpod_dc2',
    endpoint_id: input.endpointId || route.endpointId || undefined,
    nsfw: nsfwLevel >= 3,
    loras: input.loras?.length ? input.loras : undefined,
    face_detailer: process.env.RUNPOD_PORTRAIT_FACE_DETAILER?.trim().toLowerCase() !== 'false',
    upscale_factor: Number(process.env.RUNPOD_PORTRAIT_UPSCALE) || undefined,
  });
  if (result.pending) {
    return { jobId: result.job_id, endpointId: input.endpointId || route.endpointId || undefined, pending: true };
  }
  return { image: result.images[0] };
}

async function uploadToStorage(base64Data: string, name: string): Promise<string> {
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_') || 'companion';
  const dataUrl = base64Data.startsWith('data:')
    ? base64Data
    : `data:image/png;base64,${base64Data}`;
  const key = await uploadDataUrl(dataUrl, `portraits/${safeName}_${Date.now()}`);
  const resolved = (await resolveImageUrl(key)) || toPublicUrl(key) || key;
  return resolved;
}

export async function POST(request: NextRequest) {
  try {
    const { user, client, error: authError } = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }

    // Phase 2 thin-forward: unified job tracking via gen-hub (loop-guarded).
    if (client) {
      const forwarded = await forwardLegacyGeneration({
        request,
        kind: 'portrait',
        client,
        userId: user.id,
        handler: POST,
        routePath: '/api/girlfriends/generate-portrait',
      });
      if (forwarded) return forwarded;
    }

    const rl = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many portrait generation requests. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(rl, PORTRAIT_GEN_LIMIT) },
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || 'Companion');
    // Default framing is now bust-up (chest-up): shows neck/shoulders/collarbone
    // so the ID anchor carries personality / allure instead of being a headshot.
    // Legacy waist-up and close-up stay available for callers that pass them.
    const framing: IdFraming = body.framing === 'close-up' || body.framing === 'waist-up'
      ? body.framing
      : 'bust-up';
    const gfIdForRef = String(body.girlfriend_id || body.girlfriendId || '').trim();

    // Batch generation (creator v4 generates 2 HD candidate portraits at once).
    // Each extra image consumes one rate-limit slot of the same hourly budget.
    const count = Math.max(1, Math.min(4, Math.round(Number(body.count) || 1)));
    for (let i = 1; i < count; i++) {
      const extra = await checkRateLimitAsync(`portrait-gen:${user.id}`, PORTRAIT_GEN_LIMIT);
      if (!extra.allowed) {
        return NextResponse.json(
          { error: 'Too many portrait generation requests. Please try again later.' },
          { status: 429, headers: rateLimitHeaders(extra, PORTRAIT_GEN_LIMIT) },
        );
      }
    }

    // ── M3: shared preset portrait cache ────────────────────────────────
    const rawPresetSlug =
      typeof body.preset_slug === 'string' ? body.preset_slug.trim().toLowerCase() : '';
    let cachePreset: CreatorPreset | null = null;
    let cacheEligible = false;
    if (rawPresetSlug) {
      try {
        const sb = getSupabaseClient();
        const { data: presetRowData } = await sb
          .from('character_presets')
          .select('*')
          .eq('slug', rawPresetSlug)
          .eq('is_active', true)
          .maybeSingle();
        if (presetRowData) {
          cachePreset = normalizeCreatorPreset(presetRowData as Record<string, unknown>);
          cacheEligible = Boolean(cachePreset && visualMatchesPreset(cachePreset, body));
        }
      } catch (e) {
        logger.warn('[Generate Portrait] preset lookup failed', {
          slug: rawPresetSlug,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    if (cacheEligible && cachePreset?.slug) {
      const cachedUrl = await findCachedPresetPortrait(cachePreset.slug);
      if (cachedUrl) {
        void recordPresetPortraitStat(cachePreset.slug, 'hit', cachedUrl);
        logger.info('[Generate Portrait] preset cache hit — skipping GPU', {
          slug: cachePreset.slug,
        });
        return NextResponse.json({
          success: true,
          imageUrl: cachedUrl,
          portrait_url: cachedUrl,
          url: cachedUrl,
          images: [cachedUrl],
          cached: true,
          preset_slug: cachePreset.slug,
          key: null,
        });
      }
      void recordPresetPortraitStat(cachePreset.slug, 'miss');
    }

    // Preset scene + outfit enrich the prompt so the portrait matches the
    // companion's opening scene (quality) while staying cache-keyed by slug.
    const presetExtraParts: string[] = [];
    if (cachePreset) {
      if (cachePreset.portrait_outfit) presetExtraParts.push(cachePreset.portrait_outfit);
      if (cachePreset.scene_id) {
        const sceneId = cachePreset.scene_id;
        const recipe = GIRLFRIEND_SCENE_RECIPES.find((s) => s.id === sceneId);
        if (recipe) presetExtraParts.push(`${recipe.env}, ${recipe.light}`);
      }
    }
    const combinedAppearancePrompt = [
      typeof body.appearance_prompt === 'string' ? body.appearance_prompt : '',
      ...presetExtraParts,
    ]
      .filter(Boolean)
      .join(', ');

    const prompt = buildPortraitPrompt({
      name,
      visual_style: body.visual_style as string | undefined,
      ethnicity: body.ethnicity as string | undefined,
      gender: body.gender as string | undefined,
      face_shape: body.face_shape as string | undefined,
      hair_style: body.hair_style as string | undefined,
      hair_color: body.hair_color as string | undefined,
      eye_color: body.eye_color as string | undefined,
      body_type: body.body_type as string | undefined,
      fashion_style: body.fashion_style as string | undefined,
      appearance_prompt: combinedAppearancePrompt || undefined,
      hairStyle: body.hairStyle as string | undefined,
      hairColor: body.hairColor as string | undefined,
      eyeColor: body.eyeColor as string | undefined,
      bodyType: body.bodyType as string | undefined,
      style: body.style as string | undefined,
      personality: body.personality as string | undefined,
      skin_tone: body.skin_tone as string | undefined,
      bust_shape: body.bust_shape as string | undefined,
      height: body.height as string | undefined,
      genome_prompt: body.genome_prompt as string | undefined,
    });

    const category = normalizeCompanionCategory({ gender: body.gender });
    const renderStyle = normalizeCompanionRenderStyle({
      visualStyle: body.visual_style,
      renderStyle: body.render_style,
      animeRenderStyle: body.anime_render_style,
      tags: body.tags,
    });
    // 捏脸系统取消 NSFW 锁定：支持 1-5 全部级别（默认 1 = SFW，传 nsfw_level/intensity 可生成任意级别）
    const nsfwLevel = Math.max(1, Math.min(5, Math.round(Number(body.nsfw_level ?? body.intensity) || 1)));
    const config = await loadComfyConfig();
    const route = resolveImageGenerationRoute({
      surface: 'companion',
      category,
      renderStyle,
      nsfwIntensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
    });
    const negativePrompt = `${route.negativePrompt}, ${studioNegativePrompt(category, renderStyle)}`;

    // ── Custom prompt bypass: if client already generated a prompt via
    //    /api/creator/generate-prompt, use it directly (text-to-image mode). ──
    const customPrompt = typeof body.custom_prompt === 'string' ? body.custom_prompt.trim() : '';
    let naturalPrompt: string;
    let finalIdentity: string;
    let identityKit: Awaited<ReturnType<typeof resolveIdentityKit>> | null = null;

    if (customPrompt) {
      // Pre-built prompt from the creator wizard — skip internal prompt building
      naturalPrompt = customPrompt;
      finalIdentity = customPrompt;
      logger.info('[Generate Portrait] Using custom prompt (text-to-image mode)', {
        name, promptLen: customPrompt.length,
      });
    } else {
      // First resolve identity kit for ANY branch (custom or not)
      const sb = getSupabaseClient();
      identityKit = await resolveIdentityKit(
        gfIdForRef,
        sb as unknown as IdentityKitSupabaseClient,
        body as Record<string, unknown>
      ).catch((err) => {
        logger.warn('[Generate Portrait] resolveIdentityKit failed', { err: err instanceof Error ? err.message : String(err) });
        return null;
      });

      const referencePlan = buildReferenceGenerationPlan({
        surface: 'companion',
        category,
        renderStyle,
        modelFamily: route.modelFamily,
        companionId: gfIdForRef,
        nsfwLevel,
        allowIdentity: true,
        controls: config.reference_control,
        assets: config.reference_assets || [],
      });
      // 中文自由描述自动转英文（与后台控制台同一套翻译逻辑）
      const translatedIdentity = await translatePromptToEnglish({
        text: prompt,
        intensity: nsfwLevel,
        mode: 'positive',
        supabase: undefined,
        userId: user.id,
      });
      finalIdentity = translatedIdentity || prompt;
      naturalPrompt = buildStudioPromptEnhancement({
        category,
        intensity: nsfwLevel as 1 | 2 | 3 | 4 | 5,
        animeStyle: renderStyle,
        identity: finalIdentity,
        scene: [
          buildIdReferencePrompt(framing),
          ...referencePlan.promptHints,
          // Allure cues from the personality tags — bust-up framing needs them
          // to read as a character rather than a headshot.
          buildAllureCues(typeof body.personality === 'string' ? body.personality : undefined, body.visual_style as string | undefined),
        ].filter(Boolean).join('. '),
      });
    }

    // SDXL 族原生协议：质量 tag 前缀 + tag 化身份（FLUX 保留自然语言）
    if (route.modelFamily !== 'flux') {
      naturalPrompt = encodeFamilyPrompt({
        family: route.modelFamily,
        subject: resolvePromptSubject(category, renderStyle),
        identity: naturalPrompt,
        framing: nsfwLevel >= 3 ? 'medium full-body shot' : 'medium shot',
      });
    }

    // 自动 LoRA：与后台一致（性别/风格固定组合 + 提示词关键词触发，仅用运行卷已验证文件）
    const installedSet = [...getVerifiedInstalledLoraSet()];
    const autoPicks = buildAutoLoraStack(config, body.gender, body.visual_style, nsfwLevel, installedSet);
    const keywordPicks = buildKeywordLoras(finalIdentity + ', ' + naturalPrompt, config, installedSet);
    const combinedPicks = [...autoPicks, ...keywordPicks];
    const seenIds = new Set<string>();
    const loraStack: Array<{ name: string; strength_model: number; strength_clip: number }> = [];
    for (const p of combinedPicks) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      if (loraStack.length >= 3) break;
      const asset = config.loras.find((l) => l.id === p.id);
      if (!asset?.filename) continue;
      const san = sanitizeLoraForVolume(asset.filename, { fallback: null, allowNull: true });
      if (!san.lora_name) continue;
      const strength = Math.min(1.5, Math.max(0, Number(p.strength ?? asset.default_strength ?? 0.7) || 0.7));
      loraStack.push({ name: san.lora_name, strength_model: strength, strength_clip: strength });
    }
    const totalStrength = loraStack.reduce((s, l) => s + l.strength_model, 0);
    const scale = totalStrength > 1.55 ? 1.55 / totalStrength : 1;
    const normalizedLoras = loraStack.map((l) => ({
      ...l,
      strength_model: Number((l.strength_model * scale).toFixed(3)),
      strength_clip: Number((l.strength_clip * scale).toFixed(3)),
    }));

    // ── Batch path: N parallel jobs → N candidate portraits ──────────────
    if (count > 1) {
      logger.info('[Generate Portrait] Batch generating', {
        name, count, category, renderStyle, promptLen: naturalPrompt.length,
        identityReference: identityKit?.anchorImageUrl ? 'enabled' : 'disabled',
        prioritizeVariety: true,  // ✅ Enable variety for initial generations
        hd: '1024x1344 + faceDetailer + upscale1.5',
      });
      const identityReferenceUrl = identityKit?.anchorImageUrl || '';
      // Prioritize variety on first generation, then balance with identity
      const identityWeight = identityKit ? resolveIpAdapterWeight('avatar-closeup', undefined, 'flux', true) : 0;

      // 批量模式下按 slot 衰减 IP-Adapter 权重，避免 anchor face 把所有图都
      // 锁回同一个人；保留 identityWeight * 0.6 作为最低身份线索，让用户能看出
      // "这几张是同一个人"但脸型/角度明显不同。slot 0 是锚点最强的一张，越往后越自由。
      const perSlotIdentityWeight = (slot: number, total: number): number => {
        if (!identityReferenceUrl) return 0;
        const decay = 1 - (slot / Math.max(1, total)) * 0.5; // 1.0 → 0.5
        return Math.max(0.35, Number((identityWeight * decay).toFixed(3)));
      };

      const jobs = await Promise.all(
        Array.from({ length: count }, (_, slot) =>
          generateImage({
            prompt: naturalPrompt,
            negativePrompt,
            category,
            renderStyle,
            endpointId: route.endpointId || undefined,
            nsfwLevel,
            // 每张图独立随机种子 + 角度/表情/光线变体 + 配件/姿态/微场景
            // nudges + LoRA 强度抖动 + 递减 IP-Adapter 锚点权重，五层叠加
            // 确保 2-4 张 portrait 不会"同一张脸复制粘贴"。
            seed: Math.floor(Math.random() * 2_147_483_647),
            loras: jitterLoraStrengths(normalizedLoras.length ? normalizedLoras : undefined, slot),
            ipAdapterImage: identityReferenceUrl,
            ipAdapterWeight: perSlotIdentityWeight(slot, count),
            variant: buildBatchImageVariant(slot, count),
          }).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) })),
        ),
      );
      const syncImages: string[] = [];
      const pendingJobs: Array<{ job_id: string; endpoint_id?: string }> = [];
      const errors: string[] = [];
      for (const j of jobs) {
        const r = j as { image?: string; jobId?: string; endpointId?: string; pending?: boolean; error?: string };
        if (r.error) errors.push(r.error);
        else if (r.pending && r.jobId) pendingJobs.push({ job_id: r.jobId, endpoint_id: r.endpointId });
        else if (r.image) syncImages.push(r.image);
      }
      if (!syncImages.length && !pendingJobs.length) {
        return NextResponse.json(
          { error: errors[0] || 'Portrait generation failed', success: false },
          { status: 500 },
        );
      }
      const uploaded = await Promise.all(syncImages.map((b64) => uploadToStorage(b64, name)));
      // M3 lazy writeback from the first sync image (shared preset cache)
      if (cacheEligible && cachePreset?.slug && syncImages[0]) {
        const writebackSlug = cachePreset.slug;
        writebackPresetPortrait(writebackSlug, syncImages[0]).catch((e) =>
          logger.warn('[Generate Portrait] preset writeback failed', {
            slug: writebackSlug,
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      }
      return NextResponse.json({
        success: true,
        count,
        images: uploaded,
        pending_jobs: pendingJobs,
        ...(errors.length ? { errors } : {}),
      });
    }

    logger.info('[Generate Portrait] Generating', {
      name,
      category,
      renderStyle,
      promptLen: naturalPrompt.length,
      customPromptUsed: !!customPrompt,
      identityReference: identityKit?.anchorImageUrl ? 'enabled' : 'disabled',
    });
    const result = await generateImage({
      prompt: naturalPrompt,
      negativePrompt,
      category,
      renderStyle,
      endpointId: route.endpointId || undefined,
      nsfwLevel,
      seed: Math.floor(Math.random() * 2_147_483_647),
      loras: normalizedLoras.length ? normalizedLoras : undefined,
      ipAdapterImage: identityKit?.anchorImageUrl || '',
      ipAdapterWeight: identityKit ? resolveIpAdapterWeight('avatar-closeup', undefined, 'flux', true) : 0,
    });

    // If still pending, return job_id for client-side polling
    if (result.pending || !result.image) {
      return NextResponse.json({
        success: true,
        pending: true,
        job_id: result.jobId,
        endpoint_id: result.endpointId,
        generation_trace: {
          category,
          renderStyle,
          modelFamily: route.modelFamily,
          checkpoint: route.checkpoint,
          customPrompt: !!customPrompt,
        },
        message: 'Portrait is being generated. Poll /api/ai/status?job_id=' + result.jobId,
      });
    }

    const imageUrl = await uploadToStorage(result.image, name);

    // M3 lazy writeback: first successful sync generation fills the shared cache
    if (cacheEligible && cachePreset?.slug && result.image) {
      const writebackSlug = cachePreset.slug;
      writebackPresetPortrait(writebackSlug, result.image).catch((e) =>
        logger.warn('[Generate Portrait] preset writeback failed', {
          slug: writebackSlug,
          err: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    // 首张图自动存为 ID 参考图（人物一致性闭环：后续立绘/换装/视频默认引用）
    if (gfIdForRef && imageUrl) {
      try {
        const { data: gfRow } = await client
          .from('girlfriends')
          .select('face_reference_url, portrait_url')
          .eq('id', gfIdForRef)
          .maybeSingle();
        if (gfRow && !String((gfRow as Record<string, unknown>).face_reference_url || '').trim()) {
          await client
            .from('girlfriends')
            .update({
              face_reference_url: imageUrl,
              portrait_url:
                String((gfRow as Record<string, unknown>).portrait_url || '') || imageUrl,
            })
            .eq('id', gfIdForRef);
        }
      } catch (e) {
        logger.warn('[Generate Portrait] face_reference save failed', {
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return NextResponse.json({
      success: true,
      imageUrl,
      portrait_url: imageUrl,
      url: imageUrl,
      key: null,
      optimizedPrompt: naturalPrompt,
      ...(cacheEligible && cachePreset?.slug ? { preset_slug: cachePreset.slug } : {}),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Generate Portrait] Error', { data: errMsg });
    return NextResponse.json({ error: errMsg, success: false }, { status: 500 });
  }
}
