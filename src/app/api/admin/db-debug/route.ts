import { NextRequest, NextResponse } from 'next/server';
import { queryPg } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/require-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.SUPABASE_URL_FOR_REFRESH ||
  process.env.COZE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  '';
const SUPABASE_KEY =
  process.env.SUPABASE_KEY_FOR_REFRESH ||
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  '';

export async function GET(req: NextRequest) {
  //  superadmin  ENABLE_DEBUG_ROUTES 
  const guard = await requireAdmin(req, 'superadmin');
  if (guard.error) return guard.error;

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

    // search anything resembling girlfriend/character/ai_companion
    const r5 = await queryPg<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%girl%' OR table_name ILIKE '%companion%' OR table_name ILIKE '%character%' OR table_name ILIKE '%ai_%') ORDER BY table_name`,
    );
    out.girlfriend_like_tables = r5.rows?.map((x) => x.table_name);

    // list buckets via REST
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const bRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        out.buckets_status = bRes.status;
        if (bRes.ok) {
          const buckets = await bRes.json();
          out.buckets = buckets.map((b: any) => ({ name: b.name, public: b.public, file_size_limit: b.file_size_limit }));

          //  portraits  publicservice_role  private
          const portraitBucket = buckets.find((b: any) => b.name === 'portraits');
          if (portraitBucket && !portraitBucket.public) {
            const updRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket/portraits`, {
              method: 'PUT',
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ public: true, file_size_limit: 5242880 }),
            });
            out.portrait_bucket_update_status = updRes.status;
            out.portrait_bucket_update_body = (await updRes.text()).slice(0, 300);
          }
        } else {
          out.buckets_error = (await bRes.text()).slice(0, 300);
        }
      } catch (e: any) {
        out.buckets_exception = e?.message;
      }

      // try GET the portrait URL that refresh returned
      const u = `${SUPABASE_URL}/storage/v1/object/portraits/portraits/luna_1783036793301.png`;
      try {
        const objRes = await fetch(u, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        });
        out.portrait_get_status = objRes.status;
        out.portrait_get_body = (await objRes.text()).slice(0, 300);
      } catch (e: any) {
        out.portrait_get_exception = e?.message;
      }
    } else {
      out.buckets_skipped = 'SUPABASE_URL or KEY missing';
    }

    return NextResponse.json(out);
  } catch (e: any) {
    out.error = e?.message;
    return NextResponse.json(out, { status: 500 });
  }
}