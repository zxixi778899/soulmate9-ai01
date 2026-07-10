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
// Direct Postgres (pg) connection ?bypasses PostgREST schema cache
// =============================================================================
// Use when Supabase PostgREST cache is stale and you need raw SQL access.
// Requires COZE_SUPABASE_DB_URL env var (Transaction pooler URL).
// =============================================================================

let pgPool: Pool | null = null;

export function getPostgresPool(): Pool {
  if (pgPool) return pgPool;
  const url = process.env.COZE_SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      'COZE_SUPABASE_DB_URL is not set. Add the Supabase Transaction pooler URL to Railway env.',
    );
  }

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


