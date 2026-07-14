/**
 * Detect which language the girlfriend should reply in.
 *
 * Default product rule (2026): **follow page UI language**
 * - Chinese UI → Simplified Chinese replies
 * - English UI → English replies
 * Message-script auto-detect is opt-in only (autoDetect: true).
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
 * Default: **UI page locale wins** (zh UI → zh reply, en UI → en reply).
 * Set autoDetect: true only if you want message script to override UI.
 */
export function resolveReplyLocale(opts: {
  message: string;
  uiLocale?: string | null;
  profileLocale?: string | null;
  defaultLocale?: string | null;
  /** When true, message script can override UI. Default false = UI only. */
  autoDetect?: boolean;
}): ReplyLocale {
  // Prefer explicit UI locale from the client page
  const ui = normalizeUiLocale(
    opts.uiLocale || opts.profileLocale || opts.defaultLocale || 'en',
    'en',
  );

  if (opts.autoDetect === true) {
    const fromMsg = detectMessageLocale(opts.message);
    if (fromMsg) return fromMsg;
  }

  return ui;
}

/** Hard language-lock line injected into system prompt every turn. */
export function languageLockInstruction(locale: ReplyLocale): string {
  switch (locale) {
    case 'zh':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = 中文]\n' +
        '本页界面语言是中文。你必须全程只用简体中文回复。\n' +
        '禁止英文整句、禁止中英夹杂段落、禁止双语对照。\n' +
        '动作 *可以简短*，对白必须是中文。用户用英文打字也要用中文回（界面是中文）。\n' +
        '不要输出乱码、特殊标记、思考过程。'
      );
    case 'ja':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = 日本語]\n' +
        'Reply in natural Japanese ONLY. Do not mix Chinese or English body text.'
      );
    case 'ko':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = 한국어]\n' +
        'Reply in natural Korean ONLY. Do not mix Chinese or English body text.'
      );
    case 'es':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = Español]\n' +
        'Reply in natural Spanish ONLY. No Chinese. No random English blocks.'
      );
    case 'fr':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = Français]\n' +
        'Reply in natural French ONLY. No Chinese. No random English blocks.'
      );
    case 'de':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = Deutsch]\n' +
        'Reply in natural German ONLY. No Chinese. No random English blocks.'
      );
    case 'pt':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = Português]\n' +
        'Reply in natural Portuguese ONLY. No Chinese. No random English blocks.'
      );
    case 'ru':
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = Русский]\n' +
        'Reply in natural Russian ONLY. No Chinese. No random English blocks.'
      );
    case 'en':
    default:
      return (
        '[LANGUAGE LOCK — CRITICAL — PAGE UI = English]\n' +
        'The app UI language is English. Reply in natural modern English ONLY.\n' +
        'Do NOT use any Chinese characters (汉字). Zero Chinese, Japanese, or Korean body text.\n' +
        'Even if the user types Chinese, still reply in English (UI is English).\n' +
        'No bilingual mixing. No garble, special tokens, or chain-of-thought.'
      );
  }
}
