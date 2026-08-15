/**
 * 第六轮批注：广告区"换背景图，性格，精致一些"。
 * 用 SVG 程序化绘制 3 张精致渐变横幅背景，sharp 光栅化为 webp 覆盖 public/ads。
 * 用法：node scripts/build-ad-banners.mjs
 */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920;
const H = 640;

/** 星点/光斑粒子 */
function bokeh(cx, cy, r, color, opacity) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
}

function svgWrap(body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
  ${body}
</svg>`;
}

/* ---------- 1. weekly：玫瑰粉 + 青 · 声波低语剪影 ---------- */
const weeklyDefs = `
  <linearGradient id="wBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#120714"/>
    <stop offset="0.55" stop-color="#1c0a1e"/>
    <stop offset="1" stop-color="#0a0a12"/>
  </linearGradient>
  <radialGradient id="wGlowA" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ff2e88" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ff2e88" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="wGlowB" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#00e5ff" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="wStreak" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#ff2e88" stop-opacity="0"/>
    <stop offset="0.5" stop-color="#ff6ba6" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
  </linearGradient>`;

const weeklyWave = Array.from({ length: 46 }, (_, i) => {
  const x = 980 + i * 20;
  const h = 18 + 60 * Math.abs(Math.sin(i * 0.42)) * Math.abs(Math.cos(i * 0.13));
  const o = 0.25 + 0.5 * Math.abs(Math.sin(i * 0.31));
  return `<rect x="${x}" y="${H / 2 - h / 2}" width="6" rx="3" height="${h}" fill="${i % 3 ? '#ff2e88' : '#00e5ff'}" opacity="${o.toFixed(2)}"/>`;
}).join('\n  ');

const weeklyBody = `
  <rect width="${W}" height="${H}" fill="url(#wBg)"/>
  <circle cx="1560" cy="300" r="420" fill="url(#wGlowA)"/>
  <circle cx="760" cy="560" r="360" fill="url(#wGlowB)"/>
  <!-- 侧脸剪影：由发光曲线勾勒 -->
  <path d="M1560 90 C1470 130 1452 220 1470 290 C1480 330 1462 356 1436 388 C1420 408 1430 436 1458 442 C1446 470 1462 492 1490 496 C1486 528 1508 552 1548 550 C1620 546 1668 480 1676 400 C1684 300 1650 140 1560 90 Z"
    fill="#12060f" stroke="#ff2e88" stroke-width="3" opacity="0.92"/>
  <path d="M1560 90 C1470 130 1452 220 1470 290" fill="none" stroke="#00e5ff" stroke-width="1.5" opacity="0.55"/>
  ${weeklyWave}
  <path d="M0 500 C 360 430 720 560 1080 470 S 1700 380 1920 460" fill="none" stroke="url(#wStreak)" stroke-width="3"/>
  <path d="M0 150 C 420 220 900 90 1400 170 S 1800 210 1920 150" fill="none" stroke="url(#wStreak)" stroke-width="2" opacity="0.6"/>
  ${bokeh(220, 120, 4, '#ff9ec6', 0.8)} ${bokeh(420, 340, 3, '#00e5ff', 0.7)}
  ${bokeh(660, 180, 5, '#ff2e88', 0.55)} ${bokeh(900, 420, 3, '#ffd1e3', 0.6)}
  ${bokeh(1240, 130, 4, '#7df3ff', 0.65)} ${bokeh(1720, 520, 5, '#ff6ba6', 0.5)}
  ${bokeh(150, 480, 6, '#c026d3', 0.4)} ${bokeh(1050, 260, 2.5, '#ffffff', 0.8)}`;

/* ---------- 2. beta-launch：琥珀金 · 庆典光芒 ---------- */
const launchDefs = `
  <linearGradient id="lBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#160d04"/>
    <stop offset="0.5" stop-color="#241204"/>
    <stop offset="1" stop-color="#0d0803"/>
  </linearGradient>
  <radialGradient id="lGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffb347" stop-opacity="0.6"/>
    <stop offset="0.6" stop-color="#f59e0b" stop-opacity="0.18"/>
    <stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="lBeam" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#fbbf24" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#fbbf24" stop-opacity="0"/>
  </linearGradient>`;

const launchRays = Array.from({ length: 13 }, (_, i) => {
  const a = (i / 12) * Math.PI;
  const x2 = 1400 + Math.cos(a) * 700;
  const y2 = 320 - Math.sin(a) * 700;
  return `<line x1="1400" y1="320" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="url(#lBeam)" stroke-width="${i % 2 ? 14 : 8}" opacity="0.35"/>`;
}).join('\n  ');

const launchConfetti = Array.from({ length: 40 }, (_, i) => {
  const x = (i * 173) % W;
  const y = (i * 97 + 40) % (H - 60);
  const rot = (i * 47) % 360;
  const c = ['#fbbf24', '#ff2e88', '#00e5ff', '#fde68a'][i % 4];
  return `<rect x="${x}" y="${y}" width="10" height="4" rx="2" fill="${c}" opacity="0.6" transform="rotate(${rot} ${x} ${y})"/>`;
}).join('\n  ');

const launchBody = `
  <rect width="${W}" height="${H}" fill="url(#lBg)"/>
  <circle cx="1400" cy="320" r="470" fill="url(#lGlow)"/>
  ${launchRays}
  <!-- 舞台地平线光带 -->
  <ellipse cx="1400" cy="560" rx="620" ry="60" fill="#f59e0b" opacity="0.22"/>
  <ellipse cx="1400" cy="560" rx="360" ry="30" fill="#fde68a" opacity="0.28"/>
  ${launchConfetti}
  <path d="M0 520 C 480 470 960 580 1440 500 S 1800 470 1920 510" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.35"/>
  ${bokeh(300, 150, 4, '#fde68a', 0.7)} ${bokeh(560, 420, 3, '#ff2e88', 0.5)}
  ${bokeh(820, 200, 5, '#fbbf24', 0.6)} ${bokeh(180, 380, 3, '#7df3ff', 0.45)}`;

/* ---------- 3. beta-sale：祖母绿 + 蓝绿 · 宝石与翻倍 ---------- */
const saleDefs = `
  <linearGradient id="sBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#04150f"/>
    <stop offset="0.55" stop-color="#06251c"/>
    <stop offset="1" stop-color="#04100c"/>
  </linearGradient>
  <radialGradient id="sGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#34d399" stop-opacity="0.5"/>
    <stop offset="1" stop-color="#34d399" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="sGlowB" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#14b8a6" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#14b8a6" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sGem" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#a7f3d0"/>
    <stop offset="0.5" stop-color="#34d399"/>
    <stop offset="1" stop-color="#0d9488"/>
  </linearGradient>
  <linearGradient id="sGemDark" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#10b981"/>
    <stop offset="1" stop-color="#065f46"/>
  </linearGradient>`;

function gem(cx, cy, s, o = 1, rot = 0) {
  return `<g transform="rotate(${rot} ${cx} ${cy})" opacity="${o}">
    <polygon points="${cx - s},${cy - s * 0.3} ${cx},${cy - s} ${cx + s},${cy - s * 0.3} ${cx},${cy + s}" fill="url(#sGem)"/>
    <polygon points="${cx - s},${cy - s * 0.3} ${cx},${cy + s} ${cx},${cy - s}" fill="url(#sGemDark)" opacity="0.55"/>
    <polygon points="${cx},${cy - s} ${cx + s},${cy - s * 0.3} ${cx},${cy + s}" fill="#ffffff" opacity="0.18"/>
  </g>`;
}

const saleBody = `
  <rect width="${W}" height="${H}" fill="url(#sBg)"/>
  <circle cx="1480" cy="280" r="430" fill="url(#sGlow)"/>
  <circle cx="500" cy="520" r="340" fill="url(#sGlowB)"/>
  ${gem(1480, 290, 120, 1, -8)}
  ${gem(1250, 430, 56, 0.8, 18)}
  ${gem(1680, 170, 44, 0.75, -24)}
  ${gem(1620, 470, 66, 0.7, 30)}
  <!-- 翻倍箭头光带 -->
  <path d="M180 460 L 420 460 L 420 420 L 560 480 L 420 540 L 420 500 L 180 500 Z" fill="#34d399" opacity="0.5"/>
  <path d="M620 400 L 860 400 L 860 360 L 1000 420 L 860 480 L 860 440 L 620 440 Z" fill="#a7f3d0" opacity="0.35"/>
  <path d="M0 130 C 480 200 960 80 1440 160 S 1800 190 1920 130" fill="none" stroke="#34d399" stroke-width="2" opacity="0.35"/>
  ${bokeh(260, 200, 4, '#a7f3d0', 0.7)} ${bokeh(520, 300, 3, '#14b8a6', 0.6)}
  ${bokeh(780, 500, 5, '#34d399', 0.5)} ${bokeh(1120, 150, 3, '#fde68a', 0.55)}
  ${bokeh(1780, 360, 4, '#a7f3d0', 0.6)}`;

const targets = [
  { file: 'ad-weekly.webp', svg: svgWrap(weeklyBody, weeklyDefs) },
  { file: 'ad-beta-launch.webp', svg: svgWrap(launchBody, launchDefs) },
  { file: 'ad-beta-sale.webp', svg: svgWrap(saleBody, saleDefs) },
];

for (const { file, svg } of targets) {
  const out = join(root, 'public', 'ads', file);
  await sharp(Buffer.from(svg)).webp({ quality: 82 }).toFile(out);
  console.log('built', file);
}
