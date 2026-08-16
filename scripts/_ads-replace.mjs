/**
 * TEMP: replace the 3 homepage banner base images with new artwork.
 * Full image is preserved (no crop) — the banner component renders it
 * centered via object-contain. Run: node scripts/_ads-replace.mjs <img1> <img2> <img3>
 */
import { createRequire } from 'node:module';
// sharp is a transitive (next) dep; load it from the .pnpm store.
const require = createRequire(import.meta.url);
const sharp = require('../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js');
import fs from 'node:fs';

const [img1, img2, img3] = process.argv.slice(2);
const jobs = [
  [img1, 'public/ads/ad-weekly.webp'],
  [img2, 'public/ads/ad-beta-launch.webp'],
  [img3, 'public/ads/ad-beta-sale.webp'],
];

for (const [src, out] of jobs) {
  if (!src) continue;
  // Keep the whole artwork: fit inside 1600x1067, centered, transparent-free dark pad.
  await sharp(src)
    .resize(1600, 1067, { fit: 'inside' })
    .webp({ quality: 80 })
    .toFile(out);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('replaced', out, kb + 'KB');
}
