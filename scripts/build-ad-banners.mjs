/**
 * 第七轮批注：广告图 = 伴侣人物 + 背景 + 文案（暧昧气氛 + 性格）。
 * 程序化 SVG 背景 + 真实伴侣立绘（Supabase 公开存储）右侧渐变融合 + 内嵌斜体性格文案，
 * sharp 光栅化为 webp 覆盖 public/ads。HTML 层 i18n 文案叠在左侧暗区。
 * 画布 1920×480（≈4:1），与首页横幅容器比例匹配，裁切最小化。
 * 用法：node scripts/build-ad-banners.mjs
 */
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920;
const H = 480;

/** 公开伴侣立绘（站点自有资产，public bucket） */
const PORTRAITS = {
  zoey: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/girlfriends/1f7f932c-ae7b-4979-a892-0e536b1ae506/1783978234653_jlqodf_gen_1783978234653.png',
  bianca: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/girlfriends/353ffc4b-b8c5-4555-b293-51650cafab2b/1784661294264_oi7t09_gen_1784661294264.png',
  daisy: 'https://vvblrkngzuyxeeoslzkl.supabase.co/storage/v1/object/public/portraits/girlfriends/4fefbce2-9e55-4998-a283-f1dd4fb42a4e/1783965896717_pqakqz_gen_1783965896717.png',
};

function bokeh(cx, cy, r, color, opacity) {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" opacity="${opacity}"/>`;
}

function svgWrap(body, defs = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs>${body}</svg>`;
}

/* ---------- 背景 1：weekly 玫瑰粉 + 青 · 声波暧昧 ---------- */
const weeklyDefs = `
  <linearGradient id="wBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#150818"/><stop offset="0.55" stop-color="#241026"/><stop offset="1" stop-color="#0d0a14"/>
  </linearGradient>
  <radialGradient id="wGlowA" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ff2e88" stop-opacity="0.5"/><stop offset="1" stop-color="#ff2e88" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="wGlowB" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#00e5ff" stop-opacity="0.28"/><stop offset="1" stop-color="#00e5ff" stop-opacity="0"/>
  </radialGradient>`;

const weeklyWave = Array.from({ length: 26 }, (_, i) => {
  const x = 60 + i * 26;
  const h = 12 + 44 * Math.abs(Math.sin(i * 0.42)) * Math.abs(Math.cos(i * 0.13));
  const o = 0.2 + 0.4 * Math.abs(Math.sin(i * 0.31));
  return `<rect x="${x}" y="${H - 56 - h / 2}" width="6" rx="3" height="${h}" fill="${i % 3 ? '#ff2e88' : '#00e5ff'}" opacity="${o.toFixed(2)}"/>`;
}).join('');

const weeklyBody = `
  <rect width="${W}" height="${H}" fill="url(#wBg)"/>
  <circle cx="1500" cy="240" r="460" fill="url(#wGlowA)"/>
  <circle cx="520" cy="470" r="320" fill="url(#wGlowB)"/>
  ${weeklyWave}
  <path d="M0 90 C 420 150 900 45 1400 105 S 1800 140 1920 90" fill="none" stroke="#ff6ba6" stroke-width="2" opacity="0.35"/>
  ${bokeh(240, 110, 4, '#ff9ec6', 0.8)} ${bokeh(460, 270, 3, '#00e5ff', 0.7)}
  ${bokeh(700, 150, 5, '#ff2e88', 0.5)} ${bokeh(940, 340, 3, '#ffd1e3', 0.6)}
  ${bokeh(1120, 110, 4, '#7df3ff', 0.6)}`;

/* ---------- 背景 2：launch 琥珀金 · 庆典 ---------- */
const launchDefs = `
  <linearGradient id="lBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#1a0f05"/><stop offset="0.5" stop-color="#2a1605"/><stop offset="1" stop-color="#100903"/>
  </linearGradient>
  <radialGradient id="lGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffb347" stop-opacity="0.55"/><stop offset="0.6" stop-color="#f59e0b" stop-opacity="0.16"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
  </radialGradient>`;

const launchConfetti = Array.from({ length: 34 }, (_, i) => {
  const x = (i * 173) % 1100;
  const y = (i * 97 + 30) % (H - 50);
  const rot = (i * 47) % 360;
  const c = ['#fbbf24', '#ff2e88', '#00e5ff', '#fde68a'][i % 4];
  return `<rect x="${x}" y="${y}" width="10" height="4" rx="2" fill="${c}" opacity="0.55" transform="rotate(${rot} ${x} ${y})"/>`;
}).join('');

const launchBody = `
  <rect width="${W}" height="${H}" fill="url(#lBg)"/>
  <circle cx="1450" cy="230" r="460" fill="url(#lGlow)"/>
  <ellipse cx="1450" cy="450" rx="640" ry="56" fill="#f59e0b" opacity="0.2"/>
  ${launchConfetti}
  <path d="M0 400 C 480 360 960 450 1440 390 S 1800 365 1920 395" fill="none" stroke="#fbbf24" stroke-width="2" opacity="0.3"/>
  ${bokeh(300, 110, 4, '#fde68a', 0.7)} ${bokeh(560, 310, 3, '#ff2e88', 0.5)} ${bokeh(820, 150, 5, '#fbbf24', 0.6)}`;

/* ---------- 背景 3：sale 祖母绿 · 宝石 ---------- */
const saleDefs = `
  <linearGradient id="sBg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#05170f"/><stop offset="0.55" stop-color="#07281e"/><stop offset="1" stop-color="#051209"/>
  </linearGradient>
  <radialGradient id="sGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#34d399" stop-opacity="0.45"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sGem" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#a7f3d0"/><stop offset="0.5" stop-color="#34d399"/><stop offset="1" stop-color="#0d9488"/>
  </linearGradient>`;

function gem(cx, cy, s, o = 1, rot = 0) {
  return `<g transform="rotate(${rot} ${cx} ${cy})" opacity="${o}"><polygon points="${cx - s},${cy - s * 0.3} ${cx},${cy - s} ${cx + s},${cy - s * 0.3} ${cx},${cy + s}" fill="url(#sGem)"/><polygon points="${cx},${cy - s} ${cx + s},${cy - s * 0.3} ${cx},${cy + s}" fill="#ffffff" opacity="0.18"/></g>`;
}

const saleBody = `
  <rect width="${W}" height="${H}" fill="url(#sBg)"/>
  <circle cx="1480" cy="230" r="440" fill="url(#sGlow)"/>
  ${gem(300, 110, 40, 0.7, -18)} ${gem(520, 320, 30, 0.6, 24)} ${gem(820, 130, 22, 0.5, -30)}
  <path d="M120 380 L 360 380 L 360 350 L 500 395 L 360 440 L 360 410 L 120 410 Z" fill="#34d399" opacity="0.4"/>
  <path d="M0 100 C 480 150 960 60 1440 120 S 1800 145 1920 100" fill="none" stroke="#34d399" stroke-width="2" opacity="0.3"/>
  ${bokeh(260, 220, 4, '#a7f3d0', 0.7)} ${bokeh(680, 240, 3, '#14b8a6', 0.6)} ${bokeh(980, 360, 4, '#fde68a', 0.5)}`;

/* ---------- 立绘左缘渐变 alpha 遮罩（融入背景） ---------- */
function maskSvg(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.35" stop-color="#000" stop-opacity="0.55"/><stop offset="0.6" stop-color="#000" stop-opacity="1"/><stop offset="1" stop-color="#000" stop-opacity="1"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#m)"/></svg>`;
}

/** 内嵌斜体性格文案层（右下，人物身前；y 上移确保横幅裁切后可见） */
function quoteSvg(quote, name) {
  return svgWrap(`
  <text x="${W - 56}" y="${H - 92}" text-anchor="end" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="32" fill="#ffffff" opacity="0.92">${quote}</text>
  <text x="${W - 56}" y="${H - 56}" text-anchor="end" font-family="Georgia, serif" font-style="italic" font-size="21" fill="#ffffff" opacity="0.6">— ${name}</text>`);
}

async function fetchPortrait(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`portrait fetch failed: ${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function maskedPortrait(url) {
  const raw = await fetchPortrait(url);
  const resized = await sharp(raw).resize({ height: H, fit: 'cover', position: 'top' }).png().toBuffer();
  const meta = await sharp(resized).metadata();
  const w = meta.width || 0;
  const mask = Buffer.from(maskSvg(w, H));
  const buf = await sharp(resized).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
  return { buf, width: w };
}

const targets = [
  { file: 'ad-weekly.webp', body: weeklyBody, defs: weeklyDefs, portrait: 'zoey', quote: '“Mmm… I saved every word you said.”', name: 'Zoey' },
  { file: 'ad-beta-launch.webp', body: launchBody, defs: launchDefs, portrait: 'bianca', quote: '“Tonight, I’m celebrating with you.”', name: 'Bianca' },
  { file: 'ad-beta-sale.webp', body: saleBody, defs: saleDefs, portrait: 'daisy', quote: '“Spoil me — I’ll make it worth it.”', name: 'Daisy' },
];

for (const t of targets) {
  const base = await sharp(Buffer.from(svgWrap(t.body, t.defs))).png().toBuffer();
  const { buf, width } = await maskedPortrait(PORTRAITS[t.portrait]);
  const quote = await sharp(Buffer.from(quoteSvg(t.quote, t.name))).png().toBuffer();
  const out = join(root, 'public', 'ads', t.file);
  await sharp(base)
    .composite([
      { input: buf, left: W - width + 30, top: 0 },
      { input: quote, left: 0, top: 0 },
    ])
    .webp({ quality: 82 })
    .toFile(out);
  console.log('built', t.file, '(portrait w=' + width + ')');
}
