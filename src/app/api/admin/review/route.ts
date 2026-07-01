/**
 * 管理员审核 API（v2 修复 P0-2）
 *
 * 修复：原实现强制覆盖 slug 为 'user-xxxxxxxx'，破坏已分享的公开链接。
 * 改为：仅在 slug 为空时，基于 name 或 id 生成可读 slug。
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const { data: pending, error } = await supabase
    .from('girlfriends')
    .select('*')
    .eq('review_status', 'pending')
    .order('submitted_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ girlfriends: pending || [] });
}

/**
 * 审核 PATCH 体 schema 校验
 */
const PatchBodySchema = {
  validate(body: unknown): { id: string; action: 'approve' | 'reject' } | { error: string } {
    if (!body || typeof body !== 'object') return { error: 'Invalid body' };
    const b = body as Record<string, unknown>;
    if (typeof b.id !== 'string' || !b.id) return { error: 'id is required' };
    if (b.action !== 'approve' && b.action !== 'reject') {
      return { error: 'action must be approve or reject' };
    }
    return { id: b.id, action: b.action };
  },
};

/**
 * 基于 name 生成可读 slug，失败回退到 id 前 8 位
 */
function generateSlug(name: string | null | undefined, id: string): string {
  if (name) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64);
    if (slug.length > 0) return `${slug}-${id.slice(0, 6)}`;
  }
  return `gf-${id.slice(0, 12)}`;
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;
  const { supabase } = adminCheck;

  const raw = awa