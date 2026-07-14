/**
 * Detect when the user wants the AI girlfriend to send a photo,
 * and extract a natural-language action clause for image prompts.
 */

export type ChatImageIntent = {
  wantsImage: boolean;
  /** Short natural action for FLUX (what she is doing / showing) */
  action: string;
  /** Coarse kind for caption copy */
  kind: 'selfie' | 'body' | 'outfit' | 'pose' | 'custom';
  confidence: number;
};

const PHOTO_VERBS =
  /(send|show|snap|take|shoot|share|give|want|need|let me see|i want to see|can i see|生成|发|看|给|拍|晒|露|展示)/i;

const PHOTO_NOUNS =
  /(selfie|photo|picture|pic|image|portrait|nudes?|body|ass|butt|booty|hips|chest|boobs?|tits|breasts?|legs?|feet|back|face|outfit|lingerie|pussy|cock|dick|自拍|照片|相片|图|屁股|翘臀|胸部|奶子|腿|脚|背影|脸|身体|内衣|裸|私密)/i;

const SELF_REF =
  /(you|yourself|urself|your|u\b|ya\b|babe|baby|honey|girl|yourself|你|妳|自己)/i;

/** Explicit photo request patterns (EN + ZH). */
const HARD_PATTERNS: Array<{ re: RegExp; kind: ChatImageIntent['kind']; conf: number }> = [
  { re: /(send|snap|take|shoot)\s+(me\s+)?(a\s+)?(sexy\s+)?selfie/i, kind: 'selfie', conf: 0.95 },
  { re: /(selfie|自拍照?|发张自拍|拍张自拍|来张自拍)/i, kind: 'selfie', conf: 0.9 },
  { re: /(send|show|give)\s+(me\s+)?(a\s+)?(photo|picture|pic|image)/i, kind: 'selfie', conf: 0.92 },
  { re: /(show|send|let me see|i want to see)\s+(me\s+)?(your\s+)?/i, kind: 'custom', conf: 0.75 },
  { re: /(给我看|让我看看|发我|发张|看看你的|露一下|展示一下)/i, kind: 'custom', conf: 0.88 },
  { re: /(draw|generate|make)\s+(a\s+)?(photo|picture|image|selfie)\s+of\s+you/i, kind: 'selfie', conf: 0.9 },
  { re: /(给我|发我).*(图|照片|自拍)/i, kind: 'selfie', conf: 0.9 },
];

/** Body / pose cues → English FLUX action fragments */
const ACTION_MAP: Array<{ re: RegExp; action: string; kind: ChatImageIntent['kind'] }> = [
  { re: /(selfie|自拍照?)/i, action: 'taking a flirty mirror selfie, holding phone, looking at camera with seductive eyes', kind: 'selfie' },
  { re: /(ass|butt|booty|hips|屁股|翘臀|臀)/i, action: 'turning to show her sexy hips and butt from a flattering three-quarter angle, looking back over her shoulder with a teasing smile', kind: 'body' },
  { re: /(boobs?|tits|breasts?|chest|胸部|奶子|乳)/i, action: 'posing to emphasize her chest in a sexy low-cut top, leaning toward the camera with bedroom eyes', kind: 'body' },
  { re: /(legs?|thighs?|腿|大腿)/i, action: 'sitting or standing to show her long sexy legs, elegant seductive pose', kind: 'body' },
  { re: /(feet|脚|足)/i, action: 'showing her feet in a playful intimate close-up pose, looking at the camera', kind: 'body' },
  { re: /(back|backside|背影|后背)/i, action: 'showing her elegant back and curves, glancing over her shoulder seductively', kind: 'body' },
  { re: /(face|close.?up|脸|特写)/i, action: 'intimate close-up face portrait, soft beauty lighting, seductive eye contact', kind: 'selfie' },
  { re: /(lingerie|underwear|bra|panty|内衣|情趣)/i, action: 'wearing sexy lingerie, posing alluringly for her boyfriend, intimate bedroom mood', kind: 'outfit' },
  { re: /(nude|naked|nsfw|裸|全裸)/i, action: 'tastefully seductive adult boudoir pose, artistic body curves, soft sheets, intimate atmosphere', kind: 'body' },
  { re: /(bedroom|床|卧室)/i, action: 'lying on the bed in a sexy pose, looking at the camera with desire', kind: 'pose' },
  { re: /(dance|跳舞)/i, action: 'mid-dance movement, sexy body language, dynamic flirty pose', kind: 'pose' },
  { re: /(outfit|dress|wearing|衣服|穿搭|裙子)/i, action: 'showing off her outfit in a full-body glamorous pose, fashion-aware girlfriend energy', kind: 'outfit' },
  { re: /(kiss|嘴唇|吻)/i, action: 'close-up of her face with parted lips, almost-kissing the camera, seductive expression', kind: 'selfie' },
];

/**
 * Parse user chat text into image-generation intent + action clause.
 */
export function parseChatImageIntent(message: string): ChatImageIntent {
  const text = String(message || '').trim();
  if (!text || text.length < 2) {
    return { wantsImage: false, action: '', kind: 'custom', confidence: 0 };
  }

  let kind: ChatImageIntent['kind'] = 'custom';
  let confidence = 0;

  for (const p of HARD_PATTERNS) {
    if (p.re.test(text)) {
      confidence = Math.max(confidence, p.conf);
      kind = p.kind;
    }
  }

  // Soft: photo verb + noun, or photo verb + body part
  const soft =
    (PHOTO_VERBS.test(text) && PHOTO_NOUNS.test(text)) ||
    (PHOTO_VERBS.test(text) && SELF_REF.test(text) && /(look|see|show|see you|看看|看看你)/i.test(text));
  if (soft) confidence = Math.max(confidence, 0.8);

  // Very soft: pure body-part request with show/see language
  if (PHOTO_NOUNS.test(text) && (PHOTO_VERBS.test(text) || /^(your|你的)/i.test(text))) {
    confidence = Math.max(confidence, 0.72);
  }

  const wantsImage = confidence >= 0.7;
  if (!wantsImage) {
    return { wantsImage: false, action: '', kind: 'custom', confidence };
  }

  let action = '';
  for (const m of ACTION_MAP) {
    if (m.re.test(text)) {
      action = m.action;
      kind = m.kind;
      break;
    }
  }

  if (!action) {
    // Fall back: sanitize user text into a short action (strip chat fluff)
    const cleaned = text
      .replace(/[*_~`]/g, '')
      .replace(/^(hey|hi|hello|babe|baby|honey|please|pls|can you|could you|will you)[,.\s]+/i, '')
      .slice(0, 160)
      .trim();
    action = cleaned
      ? `posing for her boyfriend as requested: ${cleaned}, seductive AI girlfriend photo`
      : 'taking a seductive intimate selfie for her boyfriend, looking at camera';
    if (kind === 'custom') kind = 'selfie';
  }

  return { wantsImage: true, action, kind, confidence };
}

export function isChatImageRequest(message: string): boolean {
  return parseChatImageIntent(message).wantsImage;
}

export type ChatContextLine = {
  role: 'user' | 'assistant' | string;
  content: string;
};

/**
 * Build a richer image action from the latest user request + recent chat turns.
 * Scene cues (bedroom, lingerie, mood) from conversation override generic selfie defaults.
 */
export function buildImageActionFromChat(
  userRequest: string,
  recent?: ChatContextLine[] | null,
): ChatImageIntent {
  const base = parseChatImageIntent(userRequest || 'send me a selfie');
  const blob = [
    userRequest || '',
    ...(recent || [])
      .slice(-8)
      .map((m) => String(m.content || '').replace(/\*[^*]{0,80}\*/g, ' ').slice(0, 200)),
  ]
    .join(' ')
    .trim();

  // If hard request was weak but conversation is visual, still try
  let intent = base;
  if (!base.wantsImage && userRequest) {
    intent = parseChatImageIntent(userRequest);
  }
  if (!intent.wantsImage && /photo|pic|selfie|图|照片|自拍|look at me|看看/i.test(blob)) {
    intent = { ...parseChatImageIntent('send me a selfie'), wantsImage: true };
  }

  // Re-scan full blob for better body/scene action
  let action = intent.action;
  let kind = intent.kind;
  for (const m of ACTION_MAP) {
    if (m.re.test(blob)) {
      action = m.action;
      kind = m.kind;
      break;
    }
  }

  // Scene extras from chat (light environment tags for FLUX)
  const sceneBits: string[] = [];
  if (/(bedroom|bed|床|卧室)/i.test(blob)) sceneBits.push('intimate bedroom, soft warm lamp light');
  if (/(mirror|镜子)/i.test(blob)) sceneBits.push('mirror selfie angle, phone in hand');
  if (/(bath|shower|浴室|浴缸)/i.test(blob)) sceneBits.push('steamy bathroom soft light');
  if (/(night|夜晚|夜里)/i.test(blob)) sceneBits.push('moody night atmosphere');
  if (/(morning|早上|清晨)/i.test(blob)) sceneBits.push('soft morning window light');
  if (/(kiss|抱|hug|cuddle)/i.test(blob)) sceneBits.push('romantic close intimate framing');

  // Strip meta / gift lines from free-form action
  const cleanedReq = String(userRequest || '')
    .replace(/\*sends a gift:[^*]*\*/gi, '')
    .replace(/[*_~`]/g, '')
    .replace(/^(hey|hi|hello|babe|baby|honey|please|pls|can you|could you|will you|哥哥|宝贝)[,.\s]+/i, '')
    .slice(0, 180)
    .trim();

  if ((!action || action.startsWith('posing for her boyfriend as requested')) && cleanedReq) {
    // Prefer concrete user wording when no ACTION_MAP hit
    if (!ACTION_MAP.some((m) => m.re.test(blob))) {
      action = `as her boyfriend requested in chat: ${cleanedReq}, natural seductive girlfriend photo, matching the conversation mood`;
    }
  }

  if (sceneBits.length) {
    action = [action, ...sceneBits].filter(Boolean).join(', ');
  }

  // Always produce a usable action for generate-image even if not a hard photo ask
  if (!action) {
    action =
      'taking a seductive intimate photo for her boyfriend inspired by their chat, looking at camera';
  }

  return {
    wantsImage: true,
    action,
    kind: kind || 'custom',
    confidence: Math.max(intent.confidence, 0.75),
  };
}
