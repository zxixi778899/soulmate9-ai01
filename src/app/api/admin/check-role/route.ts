import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

/**
 * 管理端入口权限探测。
 * 统一复用 requireAdmin，避免页面入口与实际管理 API 使用两套权限规则。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const authorization = await requireAdmin(request, 'reviewer');
  if (authorization.error) {
    const body = await authorization.error.json().catch(() => ({ error: 'Forbidden' }));
    return NextResponse.json(
      {
        isAdmin: false,
        reason: authorization.error.status === 401 ? 'unauthorized' : 'forbidden',
        error: typeof body.error === 'string' ? body.error : 'Admin access required',
      },
      { status: authorization.error.status },
    );
  }

  return NextResponse.json({
    isAdmin: true,
    role: authorization.profile?.role || 'reviewer',
    email: authorization.user?.email || authorization.profile?.email || null,
    hasProfile: Boolean(authorization.profile),
  });
}
