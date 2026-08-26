/* Check admin user permissions for admin888@oxmate.com */
const https = require('https');

// Load from process.env (already set)
const adminKey = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
const supabaseUrl = process.env.COZE_SUPABASE_URL.replace(/\/$/, '');

if (!adminKey || !supabaseUrl) {
  console.error('❌ Missing env vars: COZE_SUPABASE_URL and COZE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const targetEmail = 'admin888@oxmate.com';

console.log(`🔍 Checking admin permissions for ${targetEmail}...\n`);

const options = {
  hostname: new URL(supabaseUrl).hostname,
  port: 443,
  path: `/rest/v1/profiles?email=eq.${encodeURIComponent(targetEmail)}`,
  method: 'GET',
  headers: {
    'apikey': adminKey,
    'Authorization': `Bearer ${adminKey}`,
    'Content-Type': 'application/json',
    'preference': 'json',
    'select': '*',
  },
};

const req = https.request(options, res => {
  let data = '';
  
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      
      if (res.statusCode === 200 && Array.isArray(parsed) && parsed.length > 0) {
        const row = parsed[0];
        
        console.log(`✅ Found profile:\n`);
        console.log(`   User ID:     ${row.user_id}`);
        console.log(`   Email:       ${row.email}`);
        console.log(`   Role:        ${row.role || '(null)'} ← NEEDS TO BE 'admin' OR 'superadmin'`);
        console.log(`   Created:     ${row.created_at}`);
        console.log();
        
        const role = row.role || null;
        if (role === 'admin' || role === 'superadmin') {
          console.log(`✅ ADMIN ACCESS GRANTED! You can enter /admin dashboard.`);
          console.log();
          console.log(`Next steps:`);
          console.log(`  1. Login with this account`);
          console.log(`  2. Visit: https://yourdomain.com/admin`);
        } else {
          console.log(`❌ ADMIN ACCESS DENIED!`);
          console.log();
          console.log(`Current role is "${role}" which doesn't grant admin access.`);
          console.log();
          console.log(`Fix options:`);
          console.log(`  A) Run SQL in Supabase:`);
          console.log(`     UPDATE profiles SET role='admin' WHERE email='${targetEmail}';`);
          console.log();
          console.log(`  B) Or add to Vercel env var:`);
          console.log(`     ALLOWED_ADMIN_EMAILS=${targetEmail}`);
          console.log(`     Then Redeploy`);
        }
        
      } else if (Array.isArray(parsed) && parsed.length === 0) {
        console.log(`❌ No profile found for ${targetEmail}`);
        console.log();
        console.log(`Creating profile record...`);
        console.log(`Run SQL in Supabase:`);
        console.log(`INSERT INTO profiles (user_id, email, role, membership_tier, credits_remaining, created_at, updated_at)`);
        console.log(`SELECT auth.users.id, email, 'admin', 'free', 50, NOW(), NOW()`);
        console.log(`FROM auth.users WHERE email = '${targetEmail}';`);
        
      } else {
        console.log(`❌ HTTP ${res.statusCode}: ${data}`);
      }
    } catch (e) {
      console.error('Parse error:', e.message);
      console.error('Raw response:', data);
    }
  });
});

req.on('error', e => {
  console.error('Request error:', e);
  process.exit(1);
});

req.end();
