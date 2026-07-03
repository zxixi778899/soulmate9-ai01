import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const candidates = [
    { name: 'SUPABASE_KEY_FOR_REFRESH', val: process.env.SUPABASE_KEY_FOR_REFRESH },
    { name: 'COZE_SUPABASE_SERVICE_ROLE_KEY', val: process.env.COZE_SUPABASE_SERVICE_ROLE_KEY },
    { name: 'SUPABASE_SERVICE_ROLE_KEY', val: process.env.SUPABASE_SERVICE_ROLE_KEY },
  ];

  return NextResponse.json({
    found: candidates.filter((c) => !!c.val).length,
    items: candidates.map((c) => ({
      name: c.name,
      present: !!c.val,
      length: c.val?.length || 0,
      prefix: c.val?.slice(0, 50) || null,
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