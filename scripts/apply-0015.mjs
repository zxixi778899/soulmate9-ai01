import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(String.fromCharCode(10))) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

const sql = fs.readFileSync(
  path.join(process.cwd(), 'db/migrations/0015_girlfriend_pin.sql'),
  'utf8',
);
const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const urls = [process.env.COZE_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
  .filter((value, index, all) => value && all.indexOf(value) === index);
if (!key || urls.length === 0) throw new Error('Supabase URL and service role key are required');

let lastError = 'No Supabase endpoint accepted exec_sql';
let completed = false;
for (const baseUrl of urls) {
  try {
    const verify = await fetch(baseUrl + '/rest/v1/girlfriends?select=is_pinned,pinned_at&limit=1', {
      headers: { apikey: key, Authorization: 'Bearer ' + key },
    });
    if (verify.ok) {
      console.log(JSON.stringify({ ok: true, migration: '0015_girlfriend_pin', alreadyApplied: true }));
      completed = true;
      break;
    }
  } catch {
    // Continue to the migration endpoint.
  }
  try {
    const response = await fetch(baseUrl + '/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({ query: sql }),
    });
    const body = await response.text();
    if (!response.ok) {
      lastError = 'HTTP ' + response.status + ': ' + body.slice(0, 240);
      continue;
    }
    console.log(JSON.stringify({ ok: true, migration: '0015_girlfriend_pin' }));
    completed = true;
    break;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
  }
}
if (!completed) throw new Error(lastError);