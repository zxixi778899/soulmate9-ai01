/**
 * TEMP: build homepage banner webp variants from existing companion artwork.
 * Wide banner crops — the banner component renders them full-bleed via
 * object-cover (ads are allowed to crop; focal point handled per slot).
 * Run: node scripts/_ads-banner-build.mjs
 */
import { createRequire } from 'node:module';
// sharp is a transitive (next) dep; load it from the .pnpm store.
const require = createRequire(import.meta.url);
const sharp = require('../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js');
import fs from 'node:fs';

async function banner(src, topFrac, hFrac, out) {
  const meta = await sharp(src).metadata();
  const sx = 0;
  const sy = Math.round(meta.height * topFrac);
  const sw = meta.width;
  const sh = Math.round(meta.height * hFrac);
  await sharp(src)
    .extract({ left: sx, top: sy, width: sw, height: sh })
    .resize(1600, 400, { fit: 'cover' })
    .webp({ quality: 78 })
    .toFile(out);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('built', out, kb + 'KB');
}

async function copy(src, out) {
  fs.copyFileSync(src, out);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log('copied', out, kb + 'KB');
}

await banner('public/avatars/sophie.jpg', 0.1, 0.48, 'public/ads/ad-weekly.webp');
await banner('public/avatars/maya.jpg', 0.48, 0.44, 'public/ads/ad-beta-launch.webp');
await copy('public/ads/ad-exclusive.webp', 'public/ads/ad-beta-sale.webp');
