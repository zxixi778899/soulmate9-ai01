/**
 * Ensure chat_gifts (+ optional log helpers) exist.
 * Uses direct Postgres when available (bypasses PostgREST schema cache).
 */

import { logger } from '@/lib/logger';

const DDL = `
CREATE TABLE IF NOT EXISTS chat_gifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  emoji VARCHAR(32) NOT NULL DEFAULT '🎁',
  icon_url TEXT,
  cost_tokens INT NOT NULL DEFAULT 1,
  intimacy_boost INT NOT NULL DEFAULT 1,
  effect_type VARCHAR(32) NOT NULL DEFAULT 'float_emoji',
  effect_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  effect_asset_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_gifts_active_sort_idx
  ON chat_gifts (is_active, sort_order ASC);

CREATE TABLE IF NOT EXISTS proactive_message_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  girlfriend_id UUID NOT NULL,
  message_id UUID,
  time_slot VARCHAR(64) NOT NULL,
  replied BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let ensuredAt = 0;
let ensuredOk = false;

export type EnsureGiftsTableResult =
  | { ok: true; method: 'pg' | 'skip' | 'already' }
  | { ok: false; error: string; method: 'pg' | 'none' };

/**
 * Idempotent DDL. Safe to call on every admin gift write.
 */
export async function ensureChatGiftsTable(force = false): Promise<EnsureGiftsTableResult> {
  if (!force && ensuredOk && Date.now() - ensuredAt < 5 * 60_000) {
    return { ok: true, method: 'already' };
  }

  try {
    const { isValidPostgresUrl, queryPg } = await import('@/storage/database/supabase-client');
    const dbUrl = process.env.COZE_SUPABASE_DB_URL;
    if (!isValidPostgresUrl(dbUrl)) {
      return {
        ok: false,
        method: 'none',
        error:
          'COZE_SUPABASE_DB_URL 未配置或仍是占位符（placeholder_postgres_connection_string），' +
          '会出现 getaddrinfo ENOTFOUND base。\n' +
          '解决：① Supabase → SQL Editor 粘贴执行 db/migrations/0010_chat_gifts.sql\n' +
          '② 或把真实连接串写入 .env.local：Supabase → Settings → Database → Connection string (URI / Transaction pooler)',
      };
    }

    await queryPg(DDL);
    // widen emoji if table already existed with varchar(16)
    try {
      await queryPg(`ALTER TABLE chat_gifts ALTER COLUMN emoji TYPE VARCHAR(32)`);
    } catch {
      /* ignore if already wide enough */
    }
    ensuredOk = true;
    ensuredAt = Date.now();
    logger.info('[gifts] chat_gifts table ensured via pg');
    return { ok: true, method: 'pg' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('[gifts] ensureChatGiftsTable failed', { err: msg });
    // Soften ENOTFOUND into actionable Chinese
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) {
      return {
        ok: false,
        method: 'pg',
        error:
          `${msg}\n` +
          '数据库地址解析失败。请检查 .env.local 里 COZE_SUPABASE_DB_URL 是否为完整 postgresql://… 连接串，' +
          '或直接在 Supabase SQL Editor 执行 db/migrations/0010_chat_gifts.sql 建表。',
      };
    }
    return { ok: false, method: 'pg', error: msg };
  }
}

export function isTableMissingError(message: string): boolean {
  return /chat_gifts|schema cache|does not exist|Could not find the table/i.test(message);
}
