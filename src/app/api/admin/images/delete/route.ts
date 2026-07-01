import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { extractKeyFromUrl, deleteFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const client = guard.supabase;
  const body = await req.json();
  const { type, id, imageUrl, field } = body as {
    type: 'girlfriend' | 'outfit' | 'shop_item';
    id: string;
    imageUrl?: string;
    field?: string;
  };

  if (!type || !id) {
    return NextResponse.json({ error: 'Missing required fields: type, id' }, { status: 400 });
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

  // Determine which field to clear based on type
  let imageField: string;
  switch (type) {
    case 'girlfriend':
      imageField = 'avatar_url';
      break;
    case 'outfit':
      imageField = 'preview_url';
      break;
    case 'shop_item':
      imageField = 'image_url';
      break;
    default:
      return NextResponse.json({ error: `Invalid type: ${type}` }, { status: 400 });
  }

  // If imageUrl provided, delete the file from storage first
  if (imageUrl) {
    try {
      const key = extractKeyFromUrl(imageUrl);
      if (key) {
        await deleteFile(key);
      }
    } catch (e) {
      console.warn('Failed to delete file from storage:', e);
      // Continue even if storage deletion fails
    }
  }

  // Clear the image URL field (not delete the entire record)
  const { error } = await client
    .from(table)
    .update({ [imageField]: null })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}