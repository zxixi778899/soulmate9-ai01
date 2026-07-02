import { NextRequest, NextResponse } from 'next/server';
import { queryPg } from '@/storage/database/supabase-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  const out: any = {
    env_has_COZE_SUPABASE_DB_URL: !!process.env.COZE_SUPABASE_DB_URL,
    env_COZE_SUPABASE_DB_URL_prefix: process.env.COZE_SUPABASE_DB_URL?.slice(0, 70) + '...',
    env_COZE_SUPABASE_URL_prefix: process.env.COZE_SUPABASE_URL?.slice(0, 60),
  };
  try {
    // current DB
    const r1 = await queryPg<{ current_database: string; current_user: string; current_schema: string; search_path: string }>(
      `SELECT current_database(), current_user, current_schema(), current_setting('search_path') AS search_path`,
    );
    out.db = r1.rows?.[0];

    // schemas visible
    const r2 = await queryPg<{ nspname: string }>(
      `SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY nspname`,
    );
    out.schemas = r2.rows?.map((x) => x.nspname);

    // tables in public schema
    const r3 = await queryPg<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
    );
    out.tables_in_public = r3.rows?.map((x) => x.table_name);

    // try public.girlfriends explicitly
    const r4 = await queryPg<{ count: string }>(`SELECT COUNT(*) FROM public.girlfriends`);
    out.public_girlfriends_count = r4.rows?.[0]?.count;

    return NextResponse.json(out);
  } catch (e: any) {
    out.error = e?.message;
    return NextResponse.json(out, { status: 500 });
  }
}