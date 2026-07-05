/**
 *    limit=100000  DB
 */
import { NextRequest } from 'next/server';

export interface PaginationOptions {
  /** limit  100 */
  maxLimit?: number;
  /** limit  20 */
  defaultLimit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  /** Supabase `.range(from, to)`  from */
  from: number;
  /** Supabase `.range(from, to)`  to */
  to: number;
  /** offset  from */
  offset: number;
}

/**
 *  page/limit query 
 * 
 */
export function parsePagination(
  req: NextRequest | URL,
  opts: PaginationOptions = {},
): PaginationResult {
  const maxLimit = Math.max(1, opts.maxLimit ?? 100);
  const defaultLimit = Math.max(1, Math.min(opts.defaultLimit ?? 20, maxLimit));

  const url = req instanceof URL ? req : new URL(req.url);
  const sp = url.searchParams;

  const rawPage = Number.parseInt(sp.get('page') || '1', 10);
  const rawLimit = Number.parseInt(sp.get('limit') || String(defaultLimit), 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  const limit = Math.min(safeLimit, maxLimit);

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return { page, limit, from, to, offset: from };
}
// touched at Wed Jul  1 18:49:08 UTC 2026
// bumped 1782931844
