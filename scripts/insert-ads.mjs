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
  { title: 'New This Week — Voice · Memory · Milestones', image_url: '/ads/ad-weekly.webp', link_url: '/create', position: 'banner', sort_order: 0 },
  { title: 'Beta Launch · Aug 15 — Massive Points / Free Membership / iPhone 18 Pro', image_url: '/ads/ad-beta-launch.webp', link_url: '/quest', position: 'banner', sort_order: 1 },
  { title: 'Beta Sale — 2× Points · 50% Off Membership', image_url: '/ads/ad-beta-sale.webp', link_url: '/pricing', position: 'banner', sort_order: 2 },
];

// 1) Delete ALL existing banner rows (full replacement)
const delRes = await fetch(`${BASE}/rest/v1/admin_ads?position=eq.banner`, {
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
      link_url: a.link_url,
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
