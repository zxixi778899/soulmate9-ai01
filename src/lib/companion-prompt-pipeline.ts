/**
 * 伴侣提示词统一管线（捏脸 / 对话生图 / 视频 / 后台共用同一套逻辑）
 *
 * 1. 生成伴侣：读取基础信息 → 角色专属提示词
 * 2. 生成角色：基于角色提示词生成 ID 参考图（腰部以上 / 头部特写）
 * 3. 后续功能：以 ID 参考图为身份锚点，提示词只描述画面内容
 * 4. 所有入口（create / chat / console）走同一套 builder
 */

export type IdFraming = 'waist-up' | 'close-up' | 'bust-up';

/** 从基础信息（捏脸表单 / 伴侣行）拼出角色专属提示词 */
export function buildCompanionCharacterPrompt(info: Record<string, unknown>): string {
  const name = String(info.name || 'her').trim();
  const age = info.age ? String(info.age) : '22-28';
  const gender = String(info.gender || 'female').toLowerCase();
  const ethnicity = String(info.ethnicity || info.appearance_race || 'natural').trim();
  const hair = [info.appearance_hair_color, info.appearance_hair]
    .filter(Boolean)
    .map(String)
    .join(' ')
    .trim();
  const eyes = String(info.appearance_eyes || info.eye_color || '').trim();
  const face = String(info.appearance_face || info.face_shape || '').trim();
  const skin = String(info.appearance_skin || info.skin_tone || '').trim();
  const body = String(info.appearance_body || info.body_type || '').trim();
  const style = String(info.appearance_style || info.fashion_style || info.style || 'casual').trim();
  const personality = String(info.personality || '').trim();

  const parts = [
    `gorgeous young adult ${gender} named ${name}, age ${age}`,
    `${ethnicity} features`,
    face ? `face shape ${face}` : '',
    skin ? `skin ${skin}` : '',
    hair ? `${hair} hair` : '',
    eyes ? `${eyes} eyes` : '',
    body ? body : '',
    style ? `wearing flattering ${style} outfit` : '',
    personality ? `personality vibe: ${personality}` : '',
    'clear eyes, coherent anatomy, natural asymmetrical posture',
  ].filter(Boolean);
  return parts.join(', ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * ID 参考图的方向提示词。
 *
 * - `close-up`：头部特写，纯身份锚点
 * - `waist-up`：腰部以上，露出上半身轮廓
 * - `bust-up`（默认）：胸部以上半身，露出颈/肩/胸曲线，性格/吸引人元素
 *   的最佳取景；FLUX LoRA 在这个区间最稳定。
 *
 *   v2 (2026-08): bust-up 措辞强化，加显式构图比例 + anti-close-up 排他词，
 *   解决"出图仍像头像特写"的反馈。
 */
export function buildIdReferencePrompt(framing: IdFraming): string {
  if (framing === 'close-up') {
    return 'head close-up identity reference portrait, face large and unobstructed, both eyes sharp, full hairline and chin visible, shoulders softly out of frame, looking naturally at the camera, plain warm neutral background';
  }
  if (framing === 'waist-up') {
    return 'waist-up identity reference portrait, face and upper body centered, both eyes sharp, complete hairline and chin visible, relaxed shoulders, looking naturally at the camera, plain warm neutral background';
  }
  // bust-up — chest-up framing, the new default for companion creation.
  // v2 (2026-08): 加显式构图比例（head 30% / shoulders+chest 50% / waist cut 20%）
  // 和 anti-close-up 排他词。旧措辞 "identity reference portrait, complete
  // hairline and chin visible" 把 FLUX 拉向 head-and-shoulders 特写，导致
  // bust-up 出图看起来像头像。
  return 'medium close-up half-body shot, chest-up framing, head occupies top third of frame with neck and full hairline clearly visible, shoulders and upper chest occupy the middle third with collarbone and natural neckline visible, waist area cut off at bottom edge, full torso proportions not visible, both eyes sharp, looking naturally at the camera, plain warm neutral background, no headshot, no extreme close-up, no face-only crop';
}

/** 下游内容提示词：只描述画面内容，身份交给 ID 参考图 / IP-Adapter */
export function buildContentOnlyPrompt(
  content: string,
  opts?: { mood?: string; environment?: string; style?: 'realistic' | '2d' | '3d' },
): string {
  const style =
    opts?.style === '2d'
      ? 'anime key visual'
      : opts?.style === '3d'
        ? '3D film frame'
        : 'photorealistic editorial photo';
  const mood = opts?.mood ? `, ${opts.mood}` : '';
  const env = opts?.environment ? `, ${opts.environment}` : '';
  return `${String(content || '').trim()}${mood}${env}, ${style}, natural skin texture with visible pores, correct realistic anatomy, natural body proportions, well-formed hands and fingers, fine film grain, 8k`
    .replace(/\s{2,}/g, ' ')
    .trim();
}
