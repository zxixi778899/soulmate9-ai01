import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';

interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

/**
 * Production startup contract:
 *  - COZE_SUPABASE_URL is required
 *  - COZE_SUPABASE_ANON_KEY is required
 *  - COZE_SUPABASE_SERVICE_ROLE_KEY is optional (falls back to anon key)
 *  - COZE_SUPABASE_DB_URL is required for raw pg queries
 *
 * If a required var is missing we throw immediately at startup, instead of
 * silently degrading. Lazy auto-fetch via dotenv / Python subprocess was
 * fragile (Python heredoc embedded a TS import which silently failed),
 * and on Vercel the env is always already populated by the platform.
 */

function getSupabaseCredentials(): SupabaseCredentials {
  const url = process.env.COZE_SUPABASE_URL;
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY;

  if (!url) {
    throw new Error('COZE_SUPABASE_URL is not set. Required for Supabase client.');
  }
  if (!anonKey) {
    throw new Error('COZE_SUPABASE_ANON_KEY is not set. Required for Supabase client.');
  }

  // Diagnostic: print byte-level signature of env values to expose
  // invisible characters (BOM, zero-width space, trailing \n / \r, etc.)
  // that fetch() rejects with "Cannot convert argument to a ByteString".
  // Logged once per getSupabaseClient() call — Supabase clients are
  // created per-request in this codebase, so this floods the log; the
  // intent is to make the bytes visible, not to be performant.
  const inspect = (label: string, value: string) => {
    const bytes = Buffer.from(value, 'utf8');
    // Show hex of first/last 4 bytes plus length — enough to spot BOM (EF BB BF),
    // trailing CR/LF, zero-width chars (E2 80 8B), or whitespace padding.
    const head = bytes.subarray(0, 4).toString('hex');
    const tail = bytes.subarray(Math.max(0, bytes.length - 4)).toString('hex');
    logger.warn(`[supabase-diag] ${label} len=${bytes.length} head=${head} tail=${tail}`);
  };
  inspect('COZE_SUPABASE_URL', url);
  inspect('COZE_SUPABASE_ANON_KEY', anonKey);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) inspect('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (process.env.NEXT_PUBLIC_COZE_SUPABASE_URL) inspect('NEXT_PUBLIC_COZE_SUPABASE_URL', process.env.NEXT_PUBLIC_COZE_SUPABASE_URL);
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) inspect('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (process.env.NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY) inspect('NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY);

  return { url, anonKey };
}

function getSupabaseServiceRoleKey(): string | undefined {
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;
}

export function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials();

  let key: string;
  if (token) {
    key = anonKey;
  } else {
    const serviceRoleKey = getSupabaseServiceRoleKey();
    key = serviceRoleKey ?? anonKey;
  }

  const globalOptions: { headers?: Record<string, string> } = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }

  return createClient(url, key, {
    global: globalOptions,
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// =============================================================================
// Direct Postgres (pg) connection — bypasses PostgREST schema cache
// =============================================================================
// Use when Supabase PostgREST cache is stale and you need raw SQL access.
// Requires COZE_SUPABASE_DB_URL env var (Transaction / Session pooler URL).
// =============================================================================

let pgPool: Pool | null = null;

/**
 * True when COZE_SUPABASE_DB_URL looks like a real Postgres URI
 * (not empty / placeholder / template text that causes ENOTFOUND base).
 */
export function isValidPostgresUrl(raw: string | undefined | null): boolean {
  const url = String(raw || '').trim();
  if (!url) return false;
  if (/placeholder|changeme|your[_-]?|example\.com|TODO|xxx/i.test(url)) return false;
  if (!/^postgres(ql)?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    const host = u.hostname || '';
    if (!host || host === 'base' || host === 'localhost' && url.includes('placeholder')) return false;
    // Real Supabase hosts look like db.xxx.supabase.co or pooler.supabase.com
    return host.includes('.') || host === 'localhost' || host === '127.0.0.1';
  } catch {
    return false;
  }
}

export function getPostgresUrlOrThrow(): string {
  const url = process.env.COZE_SUPABASE_DB_URL?.trim();
  if (!url) {
    throw new Error(
      'COZE_SUPABASE_DB_URL is not set. Copy the connection string from Supabase → Project Settings → Database → Connection string (URI).',
    );
  }
  if (!isValidPostgresUrl(url)) {
    throw new Error(
      'COZE_SUPABASE_DB_URL 无效（当前是占位符或格式错误，会导致 getaddrinfo ENOTFOUND base）。' +
        '请到 Supabase Dashboard → Project Settings → Database → Connection string，' +
        '复制 URI（推荐 Transaction pooler，端口 6543），写入 .env.local：' +
        'COZE_SUPABASE_DB_URL=postgresql://postgres.[ref]:[password]@aws-0-xx.pooler.supabase.com:6543/postgres',
    );
  }
  return url;
}

export function getPostgresPool(): Pool {
  if (pgPool) return pgPool;
  const url = getPostgresUrlOrThrow();

  pgPool = new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: url.includes('localhost') ? false : { rejectUnauthorized: false },
    application_name: 'soulmate-railway',
  });

  // ?SET search_pathpg.Pool options 
  pgPool.on('connect', (client) => {
    client.query('SET search_path TO public').catch((e) => {
      logger.error('[pg] SET search_path failed:', { data: e?.message });
    });
  });

  pgPool.on('error', (err) => {
    logger.error('Unexpected error on idle Postgres client', { data: err });
  });

  return pgPool;
}

export async function queryPg<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const pool = getPostgresPool();
  return pool.query<T>(text, params as never[]);
}

export async function queryPgOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const res = await queryPg<T>(text, params);
  return res.rows[0] ?? null;
}

export async function queryPgMany<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await queryPg<T>(text, params);
  return res.rows;
}

export async function withPgClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPostgresPool();
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}


