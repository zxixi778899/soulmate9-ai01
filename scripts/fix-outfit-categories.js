/**
 * One-time fix: restore category for outfit products corrupted by
 * the admin shop PATCH handler's full-overwrite bug.
 *
 * Finds products where virtual_meta.collection = 'outfit' but
 * category was changed to something else (e.g. 'effect').
 */
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('Missing COZE_SUPABASE_URL or keys in .env.local');
  process.exit(1);
}

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. Fetch all products
  const { data: all, error } = await sb.from('products').select('id, name, category, subcategory, virtual_meta, status');
  if (error) { console.error('Fetch error:', error.message); process.exit(1); }

  // 2. Find corrupted outfit products
  const corrupted = (all || []).filter((p) => {
    const meta = p.virtual_meta || {};
    return meta.collection === 'outfit' && p.category !== 'outfit';
  });

  console.log(`Total products: ${all.length}`);
  console.log(`Corrupted outfit products: ${corrupted.length}`);

  if (corrupted.length === 0) {
    console.log('No corrupted products found. All good!');
    return;
  }

  // 3. Show what will be fixed
  for (const p of corrupted) {
    console.log(`  [${p.id}] "${p.name}" category: ${p.category} → outfit (status: ${p.status})`);
  }

  // 4. Fix each one
  let fixed = 0;
  for (const p of corrupted) {
    const { error: upErr } = await sb
      .from('products')
      .update({ category: 'outfit', subcategory: 'outfit' })
      .eq('id', p.id);
    if (upErr) {
      console.error(`  Failed to fix ${p.id}:`, upErr.message);
    } else {
      fixed++;
    }
  }

  console.log(`\nFixed ${fixed}/${corrupted.length} products.`);
}

main().catch(console.error);
