import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

/**
 * @deprecated Use /api/v2/admin/images/generate-from-meta instead
 */
export async function POST(request: Request): Promise<NextResponse> {
  const authorization = await requireAdmin(request);
  if (authorization.error) return authorization.error;
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/v2/admin/images/generate-from-meta' },
    { status: 410 }
  );
}
