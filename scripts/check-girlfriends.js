/**
 * Check girlfriend visibility status in DB
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
  // 1. All girlfriends
  const { data: all } = await sb.from('girlfriends').select('id, name, is_public, review_status, access_status, is_featured, is_hot, portrait_url');
  console.log(`=== ALL girlfriends: ${(all || []).length} ===`);
  
  let publicApproved = 0;
  for (const g of (all || [])) {
    const isVis = g.is_public && g.review_status === 'approved';
    if (isVis) publicApproved++;
    console.log(`  [${g.id.substring(0,8)}] "${g.name}" | public=${g.is_public} review=${g.review_status} access=${g.access_status || 'N/A'} featured=${g.is_featured} hot=${g.is_hot} ${isVis ? '✅ VISIBLE' : '❌ HIDDEN'}`);
  }
  console.log(`\n=== Public + Approved (visible on frontend): ${publicApproved} ===`);

  // 2. Featured table
  const { data: featured } = await sb.from('featured_girlfriends').select('id, name, is_active, sort_order');
  console.log(`\n=== featured_girlfriends: ${(featured || []).length} ===`);
  for (const f of (featured || [])) {
    console.log(`  [${f.id.substring(0,8)}] "${f.name}" active=${f.is_active} order=${f.sort_order}`);
  }
}

main().catch(console.error);
