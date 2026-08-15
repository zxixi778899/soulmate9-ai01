// 临时脚本：在 7 个语言块的 home.promoTopupDesc 之后插入 home.betaAnnouncement
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/lib/i18n/translations.ts';
// 语言块顺序：en, zh, ja, ko, fr, es, de
const VALUES = [
  'Highly anticipated beta test kicks off officially on August 15. Win an iPhone 18 Pro, an Unlimited annual pass, and loads of points.',
  '备受期待的 Beta 测试将于 8 月 15 日正式启动，赢取 iPhone 18 Pro、Unlimited 年卡与海量积分。',
  '大好評のベータテストが8月15日に正式スタート。iPhone 18 Pro・Unlimited 年額パス・大量ポイントが当たる。',
  '기대 가득한 베타 테스트가 8월 15일 정식 시작됩니다. iPhone 18 Pro, Unlimited 연간권, 풍성한 포인트를 받아보세요.',
  'La bêta très attendue démarre officiellement le 15 août. Gagnez un iPhone 18 Pro, un pass annuel Unlimited et des tonnes de points.',
  'La esperada beta comienza oficialmente el 15 de agosto. Gana un iPhone 18 Pro, un pase anual Unlimited y montones de puntos.',
  'Die mit Spannung erwartete Beta startet offiziell am 15. August. Gewinne ein iPhone 18 Pro, einen Unlimited-Jahrespass und jede Menge Punkte.',
];

const src = readFileSync(FILE, 'utf8');
const lines = src.split('\n');
let idx = 0;
const out = [];
for (const line of lines) {
  out.push(line);
  if (line.includes("'home.promoTopupDesc':") && idx < VALUES.length) {
    const indent = line.match(/^\s*/)[0];
    out.push(`${indent}'home.betaAnnouncement': ${JSON.stringify(VALUES[idx])},`);
    idx += 1;
  }
}
if (idx !== 7) {
  console.error(`expected 7 insertions, got ${idx}`);
  process.exit(1);
}
writeFileSync(FILE, out.join('\n'));
console.log('inserted', idx);
