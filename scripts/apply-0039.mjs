/**
 * Apply 0039_generation_jobs migration.
 * Uses COZE_SUPABASE_DB_URL (pg) if set, else prints SQL for SQL Editor.
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  const env = {};
  if (!fs.existsSync(p)) return env;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
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

const env = { ...process.env, ...loadEnvLocal() };
const sqlPath = path.join(process.cwd(), 'db/migrations/0039_generation_jobs.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

const dbUrl = env.COZE_SUPABASE_DB_URL || env.DATABASE_URL || env.SUPABASE_DB_URL;

if (!dbUrl || dbUrl.includes('placeholder')) {
  console.error('No COZE_SUPABASE_DB_URL in .env.local — open Supabase SQL Editor and paste:');
  console.error('File: db/migrations/0039_generation_jobs.sql');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query(sql);
  const check = await client.query(
    "SELECT to_regclass('public.generation_jobs') AS exists",
  );
  console.log(JSON.stringify({ ok: true, migration: '0039_generation_jobs', table: check.rows[0] }));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
