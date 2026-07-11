import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

const c = new pg.Client({
  connectionString: process.env.COZE_SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const sql = fs.readFileSync(
  path.join(__dirname, '../db/migrations/0007_girlfriend_access_rarity.sql'),
  'utf8',
);
try {
  await c.query(sql);
  console.log('migration applied');
} catch (e) {
  console.log('migration error:', e.message);
}
const r = await c.query(
  `select column_name from information_schema.columns
   where table_name = 'girlfriends'
     and column_name = any($1::text[])`,
  [['access_status', 'rarity', 'unlock_price_tokens']],
);
console.log('cols', r.rows.map((x) => x.column_name));
await c.end();
