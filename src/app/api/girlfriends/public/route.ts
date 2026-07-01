/**
 * 公开女友列表（landing page / 商城）
 *
 * 隐私策略（v2 修复 P0-1）：
 * - personality / character_card / backstory 等用户私有输入不返回
 * - only 公开可见字段 + image_url（OSS 签名）
 * - 分页使用 parsePagination 工具，强制 limit 上限
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';
import { parsePagination } from '@/lib/pagination';

// 公开列表允许返回的字段白名单（防止 schema 变更时意外泄露）
const PUBLIC_FIELDS =
  'id, name, age, slug, tags, short_description, portrait_url, avatar_url, is_public, review_status, created_at';

interface GirlfriendRow {
  id: string;
  name: string;
  age: number | null;
  slug: string | null;
  tags: string[] | null;
  short_description: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  review_status: string | null;
  created_at: string | null;
}

export const revalidate = 300; // ISR 5 分钟

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tag = searchParams.get('tag');
  const { page, limit, from, to } = parsePagination(req, { maxLimit: 100, defaultLimit: 24 });

  let query = getSupabaseClient()
    .from('girlfriends')
    .select(PUBLIC_FIELDS, { count: 'exact' })
    .eq('is_public', true)
    .eq('review_status', 'approved')
    .order('created_at', { ascending: false })
    .range(from, to)