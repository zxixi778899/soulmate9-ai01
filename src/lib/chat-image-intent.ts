/** Detect photo requests and turn the current conversation into a concrete image action. */
export type ChatImageIntent = { wantsImage: boolean; action: string; kind: 'selfie' | 'body' | 'outfit' | 'pose' | 'custom'; confidence: number };
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

export function buildImageActionFromChat(userRequest: string, recent?: ChatContextLine[] | null): ChatImageIntent {
  const base = parseChatImageIntent(userRequest || 'send me a selfie');
  const blob = [...(recent || []).slice(-10).map((line) => String(line.content || '').replace(/\*[^*]{0,120}\*/g, ' ')), userRequest].join(' ').slice(-2200);
  let action = base.action || 'taking a brand-new natural girlfriend photo';
  let kind: ChatImageIntent['kind'] = base.kind === 'custom' ? 'selfie' : base.kind;
  for (const mapping of ACTION_MAP) if (mapping.re.test(blob)) { action = mapping.action; kind = mapping.kind; break }
  const scene: string[] = [];
  if (/(?:海边|沙滩|beach|ocean)/i.test(blob)) scene.push('at the beach with natural daylight');
  else if (/(?:咖啡|咖啡店|cafe|coffee shop)/i.test(blob)) scene.push('in a cozy cafe');
  else if (/(?:浴室|洗澡|淋浴|bathroom|shower)/i.test(blob)) scene.push('in a softly lit bathroom');
  else if (/(?:卧室|床上|bedroom|on the bed)/i.test(blob)) scene.push('in her bedroom with warm light');
  else if (/(?:户外|公园|outdoor|park)/i.test(blob)) scene.push('outdoors in natural light');
  if (/(?:早上|清晨|morning)/i.test(blob)) scene.push('soft morning light');
  else if (/(?:晚上|夜里|night|evening)/i.test(blob)) scene.push('natural evening atmosphere');
  return { wantsImage: true, action: [action, ...scene, 'freshly generated scene, not a copy of any previous photo'].join(', '), kind, confidence: Math.max(base.confidence, 0.8) };
}
