import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

/**
 * 
 *
 * image_generation_tasks
 *   CREATE TABLE image_generation_tasks (
 *     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id uuid NOT NULL,
 *     entity_type text NOT NULL CHECK (entity_type IN ('girlfriend','outfit','shop_item')),
 *     entity_id text NOT NULL,
 *     status text NOT NULL DEFAULT 'queued',
 *     progress int DEFAULT 0,
 *     batch_size int DEFAULT 4,
 *     completed_count int DEFAULT 0,
 *     failed_count int DEFAULT 0,
 *     runpod_job_ids text[] DEFAULT '{}',
 *     positive_prompt text,
 *     negative_prompt text,
 *     params jsonb,
 *     result_urls text[] DEFAULT '{}',
 *     error text,
 *     created_at timestamptz DEFAULT now(),
 *     updated_at timestamptz DEFAULT now(),
 *     completed_at timestamptz
 *   );
 *   CREATE INDEX idx_img_tasks_user_status ON image_generation_tasks(user_id, status);
 *   CREATE INDEX idx_img_tasks_entity ON image_generation_tasks(entity_type, entity_id);
 *
 * GET    /api/v2/admin/images/tasks?status=running&limit=20
 * POST   /api/v2/admin/images/tasks  body={entity_type, entity_id, batch_size, params}
 */

const ALLOWED_STATUS = new Set([
  'queued',
  'running',
  'uploading',
  'completed',
  'failed',
  'cancelled',
]);

export async function GET(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req, 'reviewer');
  if ('error' in admin && admin.error) return admin.error;
  if (!('supabase' in admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { supabase } = admin;

  const status = req.nextUrl.searchParams.get('status');
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10) || 20, 100);
  const entityType = req.nextUrl.searchParams.get('entity_type');

  let query = supabase
    .from('image_generation_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status && ALLOWED_STATUS.has(status)) query = query.eq('status', status);
  if (entityType) query = query.eq('entity_type', entityType);

  const { data, error } = await query;
  if (error) {
    logger.error('image task list failed', { err: error.message });
    return NextResponse.json({ tasks: [] });
  }
  return NextResponse.json({ tasks: data ?? [] });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin(req, 'reviewer');
  if ('error' in admin && admin.error) return admin.error;
  if (!('supabase' in admin)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { user, supabase } = admin;

  const body = (await req.json().catch(() => ({}))) as {
    entity_type?: string;
    entity_id?: string;
    batch_size?: number;
    positive_prompt?: string;
    negative_prompt?: string;
    params?: Record<string, unknown>;
  };

  if (!body.entity_type || !body.entity_id) {
    return NextResponse.json({ error: 'entity_type and entity_id required' }, { status: 400 });
  }
  if (!['girlfriend', 'outfit', 'shop_item'].includes(body.entity_type)) {
    return NextResponse.json({ error: 'Invalid entity_type' }, { status: 400 });
  }
  const batchSize = Math.min(Math.max(body.batch_size ?? 4, 1), 8);

  const { data, error } = await supabase
    .from('image_generation_tasks')
    .insert({
      user_id: user.id,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      batch_size: batchSize,
      positive_prompt: body.positive_prompt ?? null,
      negative_prompt: body.negative_prompt ?? null,
      params: body.params ?? {},
      status: 'queued',
    })
    .select('*')
    .single();

  if (error) {
    logger.error('image task create failed', { err: error.message });
    return NextResponse.json({ error: 'Create failed' }, { status: 500 });
  }
  return NextResponse.json({ task: data });
}
