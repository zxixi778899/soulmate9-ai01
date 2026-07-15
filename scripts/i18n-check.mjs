import {
  REQUIRED_LOCALES,
  TRANSLATIONS_FILE,
  configuredLocales,
  parseEntries,
  readUtf8,
} from './i18n-lib.mjs';

const source = readUtf8(TRANSLATIONS_FILE);
const locales = configuredLocales(source);
const errors = [];
const todoCount = (source.match(/\/\/ TODO\([^)]+\): translate/g) || []).length;
if (todoCount > 0) errors.push(`${todoCount} translation TODO placeholders remain`);

for (const locale of REQUIRED_LOCALES) {
  if (!locales.includes(locale)) errors.push(`Missing locale block: ${locale}`);
}

const base = parseEntries(source, 'en');
if (base.entries.size === 0) errors.push('English translation block is empty or missing');

for (const locale of locales) {
  const current = parseEntries(source, locale);
  if (current.duplicates.length > 0) {
    errors.push(`${locale}: duplicate keys: ${current.duplicates.join(', ')}`);
  }
  if (locale === 'en') continue;
  const missing = [...base.entries.keys()].filter((key) => !current.entries.has(key));
  const extra = [...current.entries.keys()].filter((key) => !base.entries.has(key));
  if (missing.length > 0) errors.push(`${locale}: ${missing.length} missing keys (${missing.slice(0, 12).join(', ')})`);
  if (extra.length > 0) errors.push(`${locale}: ${extra.length} keys not present in en (${extra.slice(0, 12).join(', ')})`);
}

if (errors.length > 0) {
  console.error('i18n check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`i18n check passed: ${base.entries.size} keys across ${locales.join(', ')}`);
