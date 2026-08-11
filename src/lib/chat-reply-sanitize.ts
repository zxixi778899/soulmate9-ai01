/**
 * Clean LLM assistant replies before showing / persisting.
 * Fixes: special tokens, reasoning leaks, mojibake, empty/garbage noise.
 */

const SPECIAL_TOKEN_RE =
  /<\|[^|>]{0,40}\|>|<\/?s>|<\/?pad>|<\/?unk>|<\|endoftext\|>|<\|im_start\|>|<\|im_end\|>|<\|eot_id\|>|<\|start_header_id\|>|<\|end_header_id\|>|\[INST\]|\[\/INST\]|<<SYS>>|<\/?SYS>>|<redacted_reasoning>|<\/?think>|<\/?thinking>|<\/?reason(?:ing)?>|```(?:thinking|reasoning)[\s\S]*?```/gi;

const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Common replacement-char mojibake from bad UTF-8 */
const REPLACEMENT_CHAR_RE = /\uFFFD+/g;

/** Roleplay system wrappers that sometimes leak into output */
const LEAKED_WRAPPER_RE =
  /<\/?user_message>|<\/?system>|^\s*\[SYSTEM\][^\n]*\n?/gim;

/** Repeated garbage runs (same char 8+ times, excluding ellipsis dots) */
const REPEATED_JUNK_RE = /([^\s.…·•.])\1{7,}/g;

/** Template variables occasionally leaked by small roleplay models. */
const TEMPLATE_PLACEHOLDER_RE =
  /\b(?:tableName|characterName|userName|assistantName|undefined|null)\b/gi;

/** Repeated word/phrase loop detection: same word 5+ times, or a short 3-6
 *  char catchphrase repeated 4+ times (model degeneration). */
const WORD_LOOP_RE = /\b([A-Za-z一-鿿]{1,6})\b(?:[\s…—~,，。！!？?*]+|\b)\1\b(?:[\s…—~,，。！!？?*]+|\b)\1\b(?:[\s…—~,，。！!？?*]+|\b)\1\b/g;
const PHRASE_LOOP_RE = /([^\n。！？!?]{2,8})\1{3,}/g;

/** Narrator / roleplay leak: replies that spin a detached third-person story
 *  ("She smiles at you") instead of speaking as the character. Only flag
 *  when there's no first/second-person dialogue at all. */
const NARRATOR_LEAK_RE = /(?:^|\n)\s*(?:she|her|he|his|the girl|the boy|the woman|the man)\s+(?:smiles?|smirks?|laughs?|giggles?|blushes?|sighs?|nods?|looks?|turns?|says?|whispers?|replies?|moves?|touches?|wraps?|tilts?)\b/i;

const SOFT_FALLBACK_EN =
  "Mmm… my mind blanked for a second. Say that again for me, baby? I want to answer you properly~";
const SOFT_FALLBACK_ZH =
  '嗯…刚才走神了一下。再说一遍好不好？我想认真回你～';

function looksMostlyChinese(text: string): boolean {
  const han = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return han >= 2 && han >= latin;
}

/**
 * True when text is too broken to show as a girlfriend reply.
 */
export function isGarbageReply(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < 2) return true;

  const printable = t.replace(/\s/g, '');
  if (!printable) return true;

  // Too many replacement chars
  const bad = (t.match(/\uFFFD/g) || []).length;
  if (bad >= 3 || (t.length > 0 && bad / t.length > 0.08)) return true;

  // Mostly non-letter symbols (except short emoji replies)
  const letters = (t.match(/[\p{L}\p{N}]/gu) || []).length;
  const emoji = (t.match(/\p{Extended_Pictographic}/gu) || []).length;
  if (t.length >= 12 && letters < 3 && emoji < 2) return true;

  // Special-token residue
  if (/<\|[^|>]{0,40}\|>|\[INST\]|<<SYS>>/i.test(t)) return true;

  // Long runs of same junk
  if (/([^\s.…·•])\1{12,}/.test(t)) return true;

  // Word/phrase loop degeneration
  if (WORD_LOOP_RE.test(t)) return true;
  if (PHRASE_LOOP_RE.test(t)) return true;

  // Pure third-person narration with no dialogue (leaked by roleplay models)
  const hasQuotes = /["'「」"']/.test(t);
  const hasFirstPerson = /\b(?:我|我们|俺|咱|I'?m|I |we|my|me)\b/i.test(t);
  const hasSecondPerson = /\b(?:你|你们|您|你|you'?re|you|your)\b/i.test(t);
  if (!hasQuotes && !hasFirstPerson && !hasSecondPerson && t.length > 20) {
    const narratorBeats = (t.match(NARRATOR_LEAK_RE) || []).length;
    if (narratorBeats >= 2) return true;
  }

  return false;
}

/**
 * Soft language cleanup when model ignores UI lock.
 * - preferZh: drop long pure-English paragraphs
 * - preferEn: drop lines that are mostly Han characters
 */
function stripWrongLanguageBlocks(text: string, preferZh?: boolean): string {
  const lines = text.split('\n').map((line) => {
    if (!preferZh) return line;
    // Remove inline English roleplay beats as well as full English lines.
    // Small models often emit: "中文。 Takes a sip and smiles" on one line.
    return line
      .replace(/\*[^*\n]*[A-Za-z][^*\n]*\*/g, ' ')
      .replace(
        /(?:[A-Za-z][A-Za-z'’.-]*)(?:[\s,;:—-]+[A-Za-z][A-Za-z'’.-]*){2,}(?:[.!?~…]+|$)?/g,
        ' ',
      )
      .replace(/[A-Za-z][A-Za-z'’.-]*/g, ' ')
      .replace(/[\u0400-\u04ff]+/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  });
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (!s) return true;
    // Keep short action beats only when they use the requested language.
    if (/^\*[^*]{1,120}\*$/.test(s)) {
      return preferZh ? /[\u4e00-\u9fff]/.test(s) : !/[\u4e00-\u9fff]/.test(s);
    }

    const han = (s.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (s.match(/[A-Za-z]/g) || []).length;
    if (preferZh) {
      // Drop long English-only lines when UI is Chinese
      if (latin >= 18 && han === 0) return false;
      return true;
    }
    // EN UI: drop lines that are mostly Chinese
    if (han >= 4 && han >= latin * 0.6) return false;
    return true;
  });
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Sanitize a full assistant reply string.
 */
export function sanitizeAssistantReply(
  raw: string,
  opts?: { preferZh?: boolean },
): string {
  let t = String(raw ?? '');
  if (!t) return '';

  // Normalize newlines
  t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Drop leaked thinking blocks first
  t = t.replace(/<think>[\s\S]*?<\/think>/gi, '');
  t = t.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  t = t.replace(/```(?:thinking|reasoning)[\s\S]*?```/gi, '');

  t = t.replace(SPECIAL_TOKEN_RE, '');
  t = t.replace(LEAKED_WRAPPER_RE, '');
  t = t.replace(CONTROL_CHARS_RE, '');
  t = t.replace(REPLACEMENT_CHAR_RE, '');
  t = t.replace(REPEATED_JUNK_RE, '$1$1$1');
  t = t.replace(TEMPLATE_PLACEHOLDER_RE, '');

  // Early loop detection — catch repeated words/phrases BEFORE they bloat the output
  if (WORD_LOOP_RE.test(t) || PHRASE_LOOP_RE.test(t)) {
    // Find the first clean sentence before the loop and cut there
    const beforeLoop = t.split(/([^。！？!?]*(?:[。！？!?]|$))/);
    let cleaned = '';
    for (const seg of beforeLoop) {
      if (!seg.trim()) continue;
      if (WORD_LOOP_RE.test(seg) || PHRASE_LOOP_RE.test(seg)) break;
      cleaned += seg;
    }
    if (cleaned.trim().length >= 10) t = cleaned;
    else t = t.replace(WORD_LOOP_RE, '').replace(PHRASE_LOOP_RE, '');
  }

  // Strip leading assistant labels the model sometimes emits
  t = t.replace(
    /^(Assistant|AI|Bot|Girlfriend|System|助手|系统)\s*[:：]\s*/i,
    '',
  );

  // Collapse excessive blank lines
  t = t.replace(/\n{4,}/g, '\n\n');
  t = t.replace(/[ \t]{3,}/g, ' ');
  t = t.trim();

  // Cap pathological length (model loops)
  if (t.length > 3500) {
    t = t.slice(0, 3500).replace(/\s+\S*$/, '') + '…';
  }

  t = stripWrongLanguageBlocks(t, opts?.preferZh);

  if (opts?.preferZh) {
    const han = (t.match(/[\u4e00-\u9fff]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    const cyrillic = (t.match(/[\u0400-\u04ff]/g) || []).length;
    // Never show an English-dominant response in a Chinese turn.
    if (han < 2 || latin > 0 || cyrillic > 0) return SOFT_FALLBACK_ZH;
  }

  if (isGarbageReply(t)) {
    return opts?.preferZh ? SOFT_FALLBACK_ZH : SOFT_FALLBACK_EN;
  }

  return t;
}

/**
 * Dialogue mode cleanup: keep only spoken words by stripping narration.
 * Removes *asterisk* beats and bracketed stage directions.
 */
export function stripActionBeats(text: string): string {
  const t = String(text ?? '');
  if (!t) return '';
  let out = t
    .replace(/[*_~`]{2,}/g, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*[^*]*\*/g, ' ')
    .replace(/[（(]\s*(?:smiles?|smirk|laughs?|giggles?|blushes?|sighs?|whispers?|leans?|nuzzles?|bites?|licks?|touches?|caresses?|kisses?|moves?|nods?|shakes?|grins?|looks?|turns?|steps?|pulls?|pushes?|strokes?|wraps?|tilts?|flips?|tucks?|winks?|groans?|moans?|breathes?|pants?)[^)）]{0,40}[)）]\s*/gi, ' ');
  // Drop narration-only lines (no quote marks, no dialogue verbs, short).
  out = out
    .split('\n')
    .map((line) => {
      const s = line.trim();
      if (!s) return '';
      if (/^["'“”‘’]/.test(s) || /["'“”‘’]$/.test(s)) return s;
      if (/^(she|her|he|his|i)\s+(smiles?|smirks?|laughs?|giggles?|blushes?|sighs?|whispers?|leans?|bites?|touches?|kisses?|moves?|nods?|shakes?|grins?|looks?|turns?|steps?|pulls?|pushes?|strokes?|wraps?|tilts?|winks?|groans?|moans?|breathes?|pants?)\b/i.test(s) && s.length < 120) return '';
      return s;
    })
    .filter(Boolean)
    .join('\n');
  out = out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * Clean a single history line before sending to the LLM.
 * Returns empty string if the line should be dropped.
 */
export function sanitizeHistoryContent(role: string, content: string): string {
  let t = String(content ?? '').trim();
  if (!t) return '';

  if (role === 'assistant') {
    t = sanitizeAssistantReply(t, { preferZh: looksMostlyChinese(t) });
    if (isGarbageReply(t)) return '';
  } else {
    t = t.replace(CONTROL_CHARS_RE, '').replace(REPLACEMENT_CHAR_RE, '').trim();
    if (t.length > 4000) t = t.slice(0, 4000);
  }

  // Drop pure system soft-error spam from history to avoid model mimicry
  if (
    /my (signal|connection) (glitched|hiccuped)/i.test(t) ||
    /刚才走神了一下/.test(t)
  ) {
    return '';
  }

  return t;
}
