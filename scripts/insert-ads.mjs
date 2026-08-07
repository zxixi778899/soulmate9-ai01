/**
 * Insert / replace homepage banner ads (admin_ads, position=banner) via Coze proxy (PostgREST).
 * Usage: node scripts/insert-ads.mjs  (reads COZE_SUPABASE_URL / COZE_SUPABASE_SERVICE_ROLE_KEY from .env.local)
 * Idempotent: rows with the same image_url are replaced.
 */
import fs from 'node:fs';

const env = fs.readFileSync('.env.local', 'utf8');
function get(key) {
  const m = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return null;
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const BASE = get('COZE_SUPABASE_URL');
const KEY = get('COZE_SUPABASE_SERVICE_ROLE_KEY');
if (!BASE || !KEY) throw new Error('COZE_SUPABASE_URL / service role key missing');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const ads = [
  { title: 'Your AI Companion, Reimagined', image_url: '/ads/ad-features.png', position: 'banner', sort_order: 0 },
  { title: 'Hot Beta · Official Launch Aug 15', image_url: '/ads/ad-launch.png', position: 'banner', sort_order: 1 },
  { title: 'Your Exclusive Companion', image_url: '/ads/ad-exclusive.png', position: 'banner', sort_order: 2 },
];

// 1) Delete existing rows with these image_urls (idempotent)
const urlEnc = ads.map((a) => encodeURIComponent(a.image_url)).join(',');
const delRes = await fetch(`${BASE}/rest/v1/admin_ads?image_url=in.(${urlEnc})`, {
  method: 'DELETE',
  headers,
});
if (delRes.status !== 200 && delRes.status !== 204) {
  console.log('DELETE status', delRes.status, await delRes.text());
}

// 2) Insert
const insRes = await fetch(`${BASE}/rest/v1/admin_ads`, {
  method: 'POST',
  headers,
  body: JSON.stringify(
    ads.map((a) => ({
      title: a.title,
      image_url: a.image_url,
      link_url: null,
      position: a.position,
      active: true,
      sort_order: a.sort_order,
    })),
  ),
});
const insText = await insRes.text();
console.log('INSERT status', insRes.status);
if (!insRes.ok) {
  console.log(insText.slice(0, 500));
  process.exit(1);
}
for (const row of JSON.parse(insText)) {
  console.log('inserted', row.id, '|', row.title, '|', row.image_url, '| sort', row.sort_order);
}

// 3) Verify
const listRes = await fetch(`${BASE}/rest/v1/admin_ads?position=eq.banner&select=title,image_url,active,sort_order&order=sort_order`, {
  headers,
});
const list = await listRes.json();
console.log('banner ads now:', list.length);
for (const row of list) console.log(' ', row.title, '|', row.image_url, '| active=', row.active);
