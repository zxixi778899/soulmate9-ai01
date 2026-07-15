import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const TRANSLATIONS_FILE = path.join(ROOT, 'src/lib/i18n/translations.ts');
export const TYPES_FILE = path.join(ROOT, 'src/lib/i18n/types.ts');
export const REQUIRED_LOCALES = ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de'];

export function readUtf8(file) {
  return fs.readFileSync(file, 'utf8');
}

export function localeBlock(source, locale) {
  const declaration = new RegExp(`(?:export\\s+)?const\\s+${locale}(?::\\s*Record<string,\\s*string>)?\\s*=\\s*\\{`);
  const match = declaration.exec(source);
  if (!match || match.index < 0) return null;
  const start = match.index;
  const bodyStart = start + match[0].length;
  const next = source.indexOf('\n};', bodyStart);
  if (next < 0) throw new Error(`Unclosed locale block: ${locale}`);
  return { start, bodyStart, bodyEnd: next, end: next + 3, body: source.slice(bodyStart, next) };
}

export function parseEntries(source, locale) {
  const block = localeBlock(source, locale);
  if (!block) return { entries: new Map(), duplicates: [] };
  const entries = new Map();
  const duplicates = [];
  const keyPattern = /^\s*'([^']+)'\s*:/gm;
  for (const match of block.body.matchAll(keyPattern)) {
    const key = match[1];
    if (entries.has(key)) duplicates.push(key);
    entries.set(key, true);
  }
  return { entries, duplicates };
}

export function configuredLocales(source) {
  return REQUIRED_LOCALES.filter((locale) => localeBlock(source, locale));
}

export function readAllowlist() {
  const file = path.join(ROOT, 'scripts/i18n-allowlist.json');
  if (!fs.existsSync(file)) return new Set();
  const parsed = JSON.parse(readUtf8(file));
  return new Set(Array.isArray(parsed.entries) ? parsed.entries : []);
}
