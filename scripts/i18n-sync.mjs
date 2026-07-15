import fs from 'node:fs';
import {
  REQUIRED_LOCALES,
  TRANSLATIONS_FILE,
  localeBlock,
  parseEntries,
  readUtf8,
} from './i18n-lib.mjs';

let source = readUtf8(TRANSLATIONS_FILE);
const englishBlock = localeBlock(source, 'en');
if (!englishBlock) throw new Error('English locale block not found');

const englishKeys = [...parseEntries(source, 'en').entries.keys()];

for (const locale of REQUIRED_LOCALES.filter((item) => item !== 'en')) {
  let block = localeBlock(source, locale);
  if (!block) {
    const anchor = source.indexOf('\nconst translations:');
    if (anchor < 0) throw new Error('translations map not found');
    source = `${source.slice(0, anchor)}\nconst ${locale}: Record<string, string> = {\n};\n${source.slice(anchor)}`;
    block = localeBlock(source, locale);
  }
  const current = parseEntries(source, locale).entries;
  const missing = englishKeys.filter((key) => !current.has(key));
  if (missing.length === 0 || !block) continue;
  const additions = missing
    .map((key) => `  // TODO(${locale}): translate\n  '${key}': '',`)
    .join('\n');
  source = `${source.slice(0, block.bodyEnd)}\n${additions}${source.slice(block.bodyEnd)}`;
}

source = source.replace(
  /const translations: Record<string, Record<string, string>> = \{[^}]+\};/,
  `const translations: Record<string, Record<string, string>> = { ${REQUIRED_LOCALES.join(', ')} };`,
);

// Older sync output used the key itself as the value, which leaked internal
// identifiers into the UI. Empty values intentionally fall back to English.
source = source.replace(
  /(\/\/ TODO\([^)]+\): translate\r?\n\s*'[^']+': )"[^"]*",/g,
  "$1'',",
);

fs.writeFileSync(TRANSLATIONS_FILE, source, 'utf8');
console.log('i18n sync complete. Search for TODO(locale) and replace placeholder values before release.');
