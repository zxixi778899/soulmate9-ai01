import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // 双层防御：仅 superadmin 可访问；与 ENABLE_DEBUG_ROUTES 互不替代。
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

  const candidates = [
    { name: 'SUPABASE_KEY_FOR_REFRESH', val: process.env.SUPABASE_KEY_FOR_REFRESH },
    { name: 'COZE_SUPABASE_SERVICE_ROLE_KEY', val: process.env.COZE_SUPABASE_SERVICE_ROLE_KEY },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', val: process.env.SUPABASE_SERVICE_ROLE_KEY },
  ];

  // 密钥 prefix 长度即足以区分；不返回明文前缀，避免日志/Sentry 抓取时泄漏。
  return NextResponse.json({
    found: candidates.filter((c) => !!c.val).length,
    items: candidates.map((c) => ({
      name: c.name,
      present: !!c.val,
      length: c.val?.length || 0,
      // 解码 JWT 中段看 role
      role_from_payload: decodeRole(c.val),
    })),
  });
}

function decodeRole(jwt: string | undefined): string | null {
  if (!jwt) return null;
  const parts = jwt.split('.');
  if (parts.length < 2) return 'not-a-jwt';
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    return payload.role || 'no-role-field';
  } catch (e: any) {
    return `decode-err: ${e?.message}`;
  }
}