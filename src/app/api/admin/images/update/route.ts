import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const client = guard.supabase;
  const body = await req.json();
  const { type, id, imageUrl, field } = body as {
    type: 'girlfriend' | 'outfit' | 'shop_item';
    id: string;
    imageUrl: string;
    field: string;
  };

  if (!type || !id || !imageUrl) {
    return NextResponse.json({ error: 'Missing required fields: type, id, imageUrl' }, { status: 400 });
  }

  let table: string;
  switch (type) {
    case 'girlfriend':
      table = 'girlfriends';
      break;
    case 'outfit':
      table = 'outfits';
      break;
    case 'shop_item':
      table = 'shop_items';
      break;
    default:
      return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
  }

  const updateField = field || 'portrait_url';

  const { error } = await client
    .from(table)
    .update({ [updateField]: imageUrl })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}