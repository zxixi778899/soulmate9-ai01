import { NextResponse } from 'next/server';

/**
 * @deprecated Use /api/v2/admin/images/generate-from-meta instead
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/v2/admin/images/generate-from-meta' },
    { status: 410 }
  );
}
