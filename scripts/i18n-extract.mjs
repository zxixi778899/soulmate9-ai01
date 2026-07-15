import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './i18n-lib.mjs';

const srcRoot = path.join(ROOT, 'src');
const candidates = [];
const skip = new Set(['node_modules', '.next', '__tests__']);
const quotedEnglish = /(['"`])([^\n'"`]*[A-Za-z][^\n'"`]*)\1/g;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(ts|tsx)$/.test(entry.name) && !file.endsWith(path.join('i18n', 'translations.ts'))) scan(file);
  }
}

function scan(file) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/\b(import|export)\b/.test(line) || /\bt\(\s*['"]/.test(line)) return;
    for (const match of line.matchAll(quotedEnglish)) {
      const value = match[2].trim();
      if (value.length < 4 || /^[A-Za-z0-9_.:/@-]+$/.test(value)) continue;
      candidates.push(`${path.relative(ROOT, file)}:${index + 1}: ${value.slice(0, 120)}`);
    }
  });
}

visit(srcRoot);
console.log(candidates.length ? candidates.join('\n') : 'No hard-coded English candidates found.');
console.log(`\n${candidates.length} candidate(s). Review manually; this command does not modify source files.`);

