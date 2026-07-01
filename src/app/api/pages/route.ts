import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const slug = searchParams.get('slug');

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_page_by_slug`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ slug }),
    });

    if (!res.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const page = await res.json();
    return NextResponse.json(page);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}