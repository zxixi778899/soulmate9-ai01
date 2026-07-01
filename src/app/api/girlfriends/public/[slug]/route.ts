/**
 * 公开女友详情（landing page 跳转目标）
 *
 * 隐私策略（v2 修复 P0-1）：
 * - character_card 含 system_prompt 等用户私有输入，公开页只返回安全字段
 * - personality / backstory / 私密 tag 不返回
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveImageUrl } from '@/lib/storage';

// 公开详情允许返回的字段白名单
const PUBLIC_DETAIL_FIELDS =
  'id, name, age, slug, tags, short_description, portrait_url, avatar_url, is_public, review_status, created_at, voice_id';

interface PublicGirlfriend {
  id: string;
  name: string;
  age: number | null;
  slug: string | null;
  tags: string[] | null;
  short_description: string | null;
  portrait_url: string | null;
  avatar_url: string | null;
  voice_id: string | null;
  created_at: string | null;
}

export const revalidate = 600; // ISR 10 分钟

export async function GET(
  req: NextRequest,
  {