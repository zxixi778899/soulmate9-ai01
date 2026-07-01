import { NextResponse } from 'next/server';

/**
 * @deprecated Use /api/v2/admin/images/generate-meta instead
 */
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Use /api/v2/admin/images/generate-meta' },
    { status: 410 }
  );
}
