/**
 * Admin API: Preset & Scene Management
 *
 * GET    /api/admin/presets - list templates, references, gen_presets
 * POST   /api/admin/presets - create template/reference/preset
 * PATCH  /api/admin/presets - update
 * DELETE /api/admin/presets - remove
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// --- GET: List all preset data ---

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type'); // optional filter

  try {
    // M4: library preset usage telemetry (drives expansion decisions)
    if (type === 'character_presets') {
      const { data } = await admin.supabase
        .from('character_presets')
        .select(
          'id, name, name_zh, slug, rarity, gender, visual_style, relationship, usage_count, last_used_at, is_active, sort_order',
        )
        .order('usage_count', { ascending: false })
        .limit(200);
      return NextResponse.json({ character_presets: data || [] });
    }

    let templates: any[] = [];
    let references: any[] = [];
    let genPresets: any[] = [];

    if (!type || type === 'templates') {
      const { data } = await admin.supabase
        .from('pregen_scene_templates')
        .select('*')
        .order('weight', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200);
      templates = data || [];
    }

    if (!type || type === 'references') {
      const { data } = await admin.supabase
        .from('character_references')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      references = data || [];
    }

    if (!type || type === 'gen_presets') {
      const { data } = await admin.supabase
        .from('generation_presets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      genPresets = data || [];
    }

    return NextResponse.json({ templates, references, gen_presets: genPresets });
  } catch (error) {
    logger.error('[admin/presets] GET error', { error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// --- POST: Create ---

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, data } = body as { type: string; data: any };

  try {
    switch (type) {
      case 'template': {
        if (!data?.prompt_template || !data?.category) {
          return NextResponse.json({ error: 'prompt_template and category required' }, { status: 400 });
        }
        const insert = {
          prompt_template: data.prompt_template,
          category: data.category,
          tags: data.tags || [],
          weight: data.weight ?? 50,
          name: data.name || '',
          negative_prompt: data.negative_prompt || '',
          width: data.width || 704,
          height: data.height || 960,
          steps: data.steps || 20,
          cfg: data.cfg || 2.5,
          enabled: data.enabled ?? true,
          created_by: admin.user.id,
        };
        const { data: row, error } = await admin.supabase
          .from('pregen_scene_templates')
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, template: row });
      }

      case 'reference': {
        if (!data?.image_url) {
          return NextResponse.json({ error: 'image_url required' }, { status: 400 });
        }
        const insert = {
          image_url: data.image_url,
          character_name: data.character_name || '',
          companion_id: data.companion_id || null,
          tags: data.tags || [],
          notes: data.notes || '',
          created_by: admin.user.id,
        };
        const { data: row, error } = await admin.supabase
          .from('character_references')
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, reference: row });
      }

      case 'gen_preset': {
        if (!data?.name) {
          return NextResponse.json({ error: 'name required' }, { status: 400 });
        }
        const insert = {
          name: data.name,
          checkpoint: data.checkpoint || '',
          lora_stack: data.lora_stack || [],
          steps: data.steps || 20,
          cfg: data.cfg || 2.5,
          sampler: data.sampler || 'euler_ancestral',
          scheduler: data.scheduler || 'normal',
          width: data.width || 704,
          height: data.height || 960,
          notes: data.notes || '',
          created_by: admin.user.id,
        };
        const { data: row, error } = await admin.supabase
          .from('generation_presets')
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, gen_preset: row });
      }

      case 'batch_pregen': {
        // Trigger pre-generation for selected companions + scenes
        const { companion_ids, template_ids } = data as { companion_ids: string[]; template_ids: string[] };
        if (!companion_ids?.length || !template_ids?.length) {
          return NextResponse.json({ error: 'companion_ids and template_ids required' }, { status: 400 });
        }
        // Queue the pre-generation job (actual processing would be handled by a worker)
        const { error } = await admin.supabase.from('pregen_queue').insert({
          companion_ids,
          template_ids,
          status: 'queued',
          requested_by: admin.user.id,
        });
        if (error) {
          // Table might not exist yet - return success with note
          return NextResponse.json({ success: true, queued: false, note: 'pregen_queue table not available' });
        }
        return NextResponse.json({ success: true, queued: true, count: companion_ids.length * template_ids.length });
      }

      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    logger.error('[admin/presets] POST error', { type, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// --- PATCH: Update ---

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type, id, data } = body as { type: string; id: string; data: any };
  if (!id || !data) {
    return NextResponse.json({ error: 'id and data required' }, { status: 400 });
  }

  const tableMap: Record<string, string> = {
    template: 'pregen_scene_templates',
    reference: 'character_references',
    gen_preset: 'generation_presets',
  };

  const table = tableMap[type];
  if (!table) {
    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }

  try {
    const { data: row, error } = await admin.supabase
      .from(table)
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, updated: row });
  } catch (error) {
    logger.error('[admin/presets] PATCH error', { type, id, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// --- DELETE: Remove ---

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request);
  if ('error' in admin) return admin.error;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');

  if (!type || !id) {
    return NextResponse.json({ error: 'type and id query params required' }, { status: 400 });
  }

  const tableMap: Record<string, string> = {
    template: 'pregen_scene_templates',
    reference: 'character_references',
    gen_preset: 'generation_presets',
  };

  const table = tableMap[type];
  if (!table) {
    return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
  }

  try {
    const { error } = await admin.supabase
      .from(table)
      .delete()
      .eq('id', id);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    logger.error('[admin/presets] DELETE error', { type, id, error: String(error) });
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
