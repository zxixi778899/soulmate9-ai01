/**
 * Debug: Check what the v2 products API would return
 * vs what's in the DB.
 */
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const { createClient } = require('@supabase/supabase-js');

const url = process.env.COZE_SUPABASE_URL;
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

const sb = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // 1. All products
  const { data: all } = await sb.from('products').select('id, name, type, status, category, subcategory, virtual_meta, is_active');
  console.log(`=== ALL products: ${(all || []).length} ===`);
  for (const p of (all || [])) {
    const meta = p.virtual_meta || {};
    console.log(`  [${p.id.substring(0,8)}] "${p.name}" | type=${p.type} status=${p.status} category=${p.category} subcategory=${p.subcategory} is_active=${p.is_active} collection=${meta.collection}`);
  }

  // 2. What v2 API returns (type='virtual' AND status='active')
  const { data: v2 } = await sb.from('products')
    .select('id, name, category, subcategory, virtual_meta')
    .eq('type', 'virtual')
    .eq('status', 'active');
  console.log(`\n=== V2 API filter (type=virtual AND status=active): ${(v2 || []).length} ===`);
  for (const p of (v2 || [])) {
    console.log(`  [${p.id.substring(0,8)}] "${p.name}" category=${p.category} subcategory=${p.subcategory}`);
  }

  // 3. What frontend shows as "skins" (category === 'outfit')
  const skins = (v2 || []).filter(p => p.category === 'outfit');
  console.log(`\n=== Frontend "Skins" (category=outfit): ${skins.length} ===`);
  for (const p of skins) {
    console.log(`  [${p.id.substring(0,8)}] "${p.name}"`);
  }

  // 4. Check for issues
  const nonActive = (all || []).filter(p => p.status !== 'active' || p.type !== 'virtual');
  if (nonActive.length > 0) {
    console.log(`\n=== FILTERED OUT by v2 API: ${nonActive.length} ===`);
    for (const p of nonActive) {
      console.log(`  [${p.id.substring(0,8)}] "${p.name}" type=${p.type} status=${p.status}`);
    }
  }
}

main().catch(console.error);
