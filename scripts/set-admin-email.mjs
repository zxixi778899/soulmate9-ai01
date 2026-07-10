/**
 * One-off: promote user to admin by email via Supabase service role.
 * Usage: node scripts/set-admin-email.mjs zxixi7788@gmail.com
 */
import fs from 'fs';
import path from 'path';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email || !email.includes('@')) {
  console.error('Usage: node scripts/set-admin-email.mjs you@example.com');
  process.exit(1);
}

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnvLocal();
const url = env.COZE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.COZE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing COZE_SUPABASE_URL / SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
};

async function main() {
  // Auth admin list users (paginate a bit)
  let match = null;
  for (let page = 1; page <= 5 && !match; page++) {
    const uRes = await fetch(
      `${url}/auth/v1/admin/users?page=${page}&per_page=200`,
      { headers },
    );
    if (!uRes.ok) {
      console.error('Auth admin users failed', uRes.status, await uRes.text());
      process.exit(1);
    }
    const j = await uRes.json();
    const users = j.users || [];
    match = users.find((u) => (u.email || '').toLowerCase() === email) || null;
    if (users.length < 200) break;
  }

  if (!match) {
    console.error(
      JSON.stringify({
        ok: false,
        error: 'User not found in auth.users. Please register/login once first.',
        email,
      }),
    );
    process.exit(2);
  }

  const uid = match.id;
  console.log(JSON.stringify({ found: true, userId: uid, email: match.email }));

  // Patch profiles.role
  let patch = await fetch(`${url}/rest/v1/profiles?user_id=eq.${uid}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ role: 'admin' }),
  });
  let body = await patch.json();
  console.log(JSON.stringify({ patchStatus: patch.status, rows: body }));

  if (!patch.ok || (Array.isArray(body) && body.length === 0)) {
    // try insert
    const ins = await fetch(`${url}/rest/v1/profiles`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: uid,
        role: 'admin',
        membership_tier: 'free',
        credits_remaining: 50,
      }),
    });
    const insBody = await ins.json();
    console.log(JSON.stringify({ insertStatus: ins.status, rows: insBody }));
    if (!ins.ok) process.exit(3);
  }

  // verify
  const v = await fetch(
    `${url}/rest/v1/profiles?user_id=eq.${uid}&select=user_id,role,membership_tier`,
    { headers },
  );
  console.log(JSON.stringify({ verify: await v.json(), ok: true }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
