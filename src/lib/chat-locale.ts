/**
 * Detect which language the girlfriend should reply in.
 *
 * Product rule: follow the latest detectable message language; for media or
 * emoji-only turns, fall back to the page/profile language.
 */

export type ReplyLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'pt' | 'ru';

const MEDIA_PLACEHOLDERS = new Set([
  '',
  '[media]',
  '[photo]',
  '[video]',
  '[voice message]',
  '[voice]',
  '*sends a gift*',
]);

/** Strip action beats / wrappers so detection uses real words. */
function stripNoise(text: string): string {
  return String(text || '')
    .replace(/<user_message>[\s\S]*?<\/user_message>/gi, ' ')
    .replace(/\*[^*]{0,120}\*/g, ' ')
    .replace(/\[(system|系统)[^\]]*\]/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .trim();
}

/**
 * Detect reply locale from the latest user message content.
 * Returns null when the message has no detectable language (media-only, emoji-only).
 */
export function detectMessageLocale(message: string): ReplyLocale | null {
  const raw = String(message || '').trim();
  if (!raw) return null;
  if (MEDIA_PLACEHOLDERS.has(raw.toLowerCase())) return null;

  // Gift RP lines like "*sends a gift: 🌹 Rose*" — ignore for language
  if (/^\*sends a gift:/i.test(raw) && raw.length < 80) return null;

  const t = stripNoise(raw);
  if (!t || t.length < 1) return null;

  const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
  const hangul = (t.match(/[\uac00-\ud7af]/g) || []).length;
  const cyrillic = (t.match(/[\u0400-\u04ff]/g) || []).length;
  const latin = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length;
  const scriptTotal = han + kana + hangul + cyrillic + latin;

  // Pure emoji / punctuation
  if (scriptTotal === 0) return null;

  // Script dominance (small messages: absolute counts also matter)
  if (hangul >= 2 && hangul >= han && hangul >= latin * 0.5) return 'ko';
  if (kana >= 2 && kana + han >= latin) return 'ja';
  // Chinese: 2+ Han chars or Han majority
  if (han >= 2 && han >= Math.max(latin * 0.45, 1)) return 'zh';
  if (han >= 1 && latin === 0 && kana === 0 && hangul === 0) return 'zh';
  if (cyrillic >= 3 && cyrillic >= latin) return 'ru';

  // Latin languages — default English for pure Latin unless UI forces later
  if (latin >= 2) {
    // Very light heuristic for other Latin locales (optional)
    const lower = t.toLowerCase();
    if (/\b(hola|gracias|por favor|quiero|amor)\b/.test(lower) && latin > han) return 'es';
    if (/\b(bonjour|merci|je t'|s'il vous|mon amour)\b/.test(lower) && latin > han) return 'fr';
    if (/\b(hallo|danke|ich liebe|bitte|schatz)\b/.test(lower) && latin > han) return 'de';
    if (/\b(olá|obrigad|eu te amo|por favor)\b/.test(lower) && latin > han) return 'pt';
    return 'en';
  }

  if (han > 0) return 'zh';
  return null;
}

export type ContextMessage = string | { role?: string | null; content?: string | null };

/**
 * Detect the conversation language from recent history.
 *
 * Accepts history in chronological order (oldest → newest) and scans from the
 * NEWEST end, prioritizing the user's own messages (what HE types defines the
 * language he expects back). Falls back to assistant lines so a user who only
 * reacted with emoji still keeps the established tongue.
 * Returns null when nothing in the window is detectable.
 */
export function detectContextLocale(messages: ContextMessage[] | null | undefined): ReplyLocale | null {
  const rows = Array.isArray(messages) ? messages : [];
  if (!rows.length) return null;

  const userTexts: string[] = [];
  const anyTexts: string[] = [];
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const m = rows[i];
    const text = typeof m === 'string' ? m : String(m?.content || '');
    if (!text.trim()) continue;
    const role = typeof m === 'string' ? 'user' : String(m?.role || 'user').toLowerCase();
    if (role === 'user') userTexts.push(text);
    anyTexts.push(text);
  }

  for (const text of userTexts) {
    const loc = detectMessageLocale(text);
    if (loc) return loc;
  }
  for (const text of anyTexts) {
    const loc = detectMessageLocale(text);
    if (loc) return loc;
  }
  return null;
}

export function normalizeUiLocale(raw: unknown, fallback: ReplyLocale = 'en'): ReplyLocale {
  const s = String(raw || fallback).toLowerCase();
  if (s.startsWith('zh') || s === 'cn') return 'zh';
  if (s.startsWith('ja')) return 'ja';
  if (s.startsWith('ko')) return 'ko';
  if (s.startsWith('es')) return 'es';
  if (s.startsWith('fr')) return 'fr';
  if (s.startsWith('de')) return 'de';
  if (s.startsWith('pt')) return 'pt';
  if (s.startsWith('ru')) return 'ru';
  if (s.startsWith('en')) return 'en';
  return fallback;
}

/**
 * Resolve the language the model must use for this turn.
 *
 * Priority chain (when autoDetect is true):
 *   1. language of the current message (when detectable)
 *   2. language of the recent conversation context (contextMessages)
 *   3. UI page / profile locale
 *   4. defaultLocale
 *
 * Set autoDetect: false to force UI/profile locale only.
 */
export function resolveReplyLocale(opts: {
  message: string;
  uiLocale?: string | null;
  profileLocale?: string | null;
  defaultLocale?: string | null;
  /** When true, message script can override UI. Default false = UI only. */
  autoDetect?: boolean;
  /** Recent chat history, chronological order (oldest → newest). */
  contextMessages?: ContextMessage[] | null;
}): ReplyLocale {
  // Prefer explicit UI locale from the client page
  const ui = normalizeUiLocale(
    opts.uiLocale || opts.profileLocale || opts.defaultLocale || 'en',
    'en',
  );

  if (opts.autoDetect === true) {
    const fromMsg = detectMessageLocale(opts.message);
    if (fromMsg) return fromMsg;
    // Current turn has no detectable language (emoji / media / empty) →
    // keep speaking the conversation's language instead of the UI default.
    const fromContext = detectContextLocale(opts.contextMessages);
    if (fromContext) return fromContext;
  }

  return ui;
}

/** Hard language-lock line injected into system prompt every turn. */
export function languageLockInstruction(locale: ReplyLocale): string {
  switch (locale) {
    case 'zh':
      return (
        '[LANGUAGE LOCK — REPLY LANGUAGE = 中文]\n' +
        '先读懂他刚才说了什么，再回应他。本轮回复语言为中文，全程只用简体中文回复。\n' +
        '禁止英文整句、禁止中英夹杂段落、禁止双语对照。\n' +
        '动作 *可以简短*，对白必须是中文。\n' +
        '不要输出乱码、特殊标记、思考过程。'
      );
    case 'ja':
      return (
        '[LANGUAGE LOCK — PAGE UI = 日本語]\n' +
        'Reply in natural Japanese ONLY. Do not mix Chinese or English body text.'
      );
    case 'ko':
      return (
        '[LANGUAGE LOCK — PAGE UI = 한국어]\n' +
        'Reply in natural Korean ONLY. Do not mix Chinese or English body text.'
      );
    case 'es':
      return (
        '[LANGUAGE LOCK — PAGE UI = Español]\n' +
        'Reply in natural Spanish ONLY. No Chinese. No random English blocks.'
      );
    case 'fr':
      return (
        '[LANGUAGE LOCK — PAGE UI = Français]\n' +
        'Reply in natural French ONLY. No Chinese. No random English blocks.'
      );
    case 'de':
      return (
        '[LANGUAGE LOCK — PAGE UI = Deutsch]\n' +
        'Reply in natural German ONLY. No Chinese. No random English blocks.'
      );
    case 'pt':
      return (
        '[LANGUAGE LOCK — PAGE UI = Português]\n' +
        'Reply in natural Portuguese ONLY. No Chinese. No random English blocks.'
      );
    case 'ru':
      return (
        '[LANGUAGE LOCK — PAGE UI = Русский]\n' +
        'Reply in natural Russian ONLY. No Chinese. No random English blocks.'
      );
    case 'en':
    default:
      return (
        '[LANGUAGE LOCK — REPLY LANGUAGE = English]\n' +
        'Read what he just said, then reply. This turn resolved to English — reply in natural modern English ONLY.\n' +
        'Do NOT use any Chinese characters (汉字). Zero Chinese, Japanese, or Korean body text.\n' +
        'No bilingual mixing. No garble, special tokens, or chain-of-thought.'
      );
  }
}
