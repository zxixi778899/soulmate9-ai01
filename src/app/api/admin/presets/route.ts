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
import { makeGirlfriendSlug } from '@/lib/girlfriend-slug';
import { presetPortraitKey } from '@/lib/preset-portrait-cache';
import { deleteFile } from '@/lib/storage';

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
        .select('*')
        .order('sort_order', { ascending: true })
        .order('usage_count', { ascending: false })
        .limit(300);

      // Merge portrait cache info for previews
      const { data: stats } = await admin.supabase
        .from('preset_portrait_stats')
        .select('slug, cached, portrait_url, hits, misses');
      const statBySlug = new Map(
        ((stats || []) as Array<Record<string, unknown>>).map((s) => [String(s.slug), s]),
      );

      const rows = ((data || []) as Array<Record<string, unknown>>).map((row) => {
        const slug = String(row.slug || '');
        const stat = slug ? statBySlug.get(slug) : undefined;
        return {
          ...row,
          portrait_cached: Boolean(stat?.cached),
          portrait_url: (stat?.portrait_url as string | undefined) || row.thumbnail_url || null,
          portrait_hits: Number(stat?.hits || 0),
          portrait_misses: Number(stat?.misses || 0),
        };
      });
      return NextResponse.json({ character_presets: rows });
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

      case 'character_preset': {
        if (!data?.name) {
          return NextResponse.json({ error: 'name required' }, { status: 400 });
        }
        const str = (v: unknown): string | null => {
          const s = String(v ?? '').trim();
          return s || null;
        };
        const list = (v: unknown): string[] | null => {
          if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
          if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
          return null;
        };
        const slug = makeGirlfriendSlug(data.name, str(data.slug));
        const gender = str(data.gender) || 'Female';
        const insert = {
          name: data.name,
          name_zh: str(data.name_zh),
          slug,
          description: str(data.description),
          description_zh: str(data.description_zh),
          short_description: str(data.short_description),
          thumbnail_url: str(data.thumbnail_url),
          visual_style: str(data.visual_style) || 'realistic',
          gender,
          ethnicity: str(data.ethnicity),
          face_shape: str(data.face_shape),
          hair_style: str(data.hair_style),
          hair_color: str(data.hair_color),
          eye_color: str(data.eye_color),
          body_type: str(data.body_type),
          fashion_style: str(data.fashion_style),
          personality_tags: list(data.personality_tags) || [],
          voice: str(data.voice),
          occupation: str(data.occupation),
          relationship: str(data.relationship) || (gender === 'Male' ? 'boyfriend' : 'girlfriend'),
          age: typeof data.age === 'number' ? data.age : 22,
          sort_order: typeof data.sort_order === 'number' ? data.sort_order : 0,
          is_active: data.is_active !== false,
          default_name: str(data.default_name),
          rarity: str(data.rarity),
          vibe_tags: list(data.vibe_tags),
          traits: data.traits && typeof data.traits === 'object' ? data.traits : null,
          greeting_en: str(data.greeting_en),
          greeting_zh: str(data.greeting_zh),
          scene_id: str(data.scene_id),
          portrait_outfit: str(data.portrait_outfit),
          folder_id: str(data.folder_id),
        };
        const { data: row, error } = await admin.supabase
          .from('character_presets')
          .insert(insert)
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ success: true, character_preset: row });
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
    character_preset: 'character_presets',
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

  // Library preset: also clean up the shared portrait cache + stats
  if (type === 'character_preset') {
    try {
      const { data: presetRow } = await admin.supabase
        .from('character_presets')
        .select('slug')
        .eq('id', id)
        .maybeSingle();
      const { error } = await admin.supabase.from('character_presets').delete().eq('id', id);
      if (error) throw error;
      const slug = String((presetRow as { slug?: string | null } | null)?.slug || '');
      if (slug) {
        try {
          await deleteFile(presetPortraitKey(slug));
        } catch (e) {
          logger.warn('[admin/presets] portrait cache cleanup failed', { slug, err: String(e) });
        }
        try {
          await admin.supabase.from('preset_portrait_stats').delete().eq('slug', slug);
        } catch (e) {
          logger.warn('[admin/presets] portrait stats cleanup failed', { slug, err: String(e) });
        }
      }
      return NextResponse.json({ success: true, deleted: id });
    } catch (error) {
      logger.error('[admin/presets] DELETE error', { type, id, error: String(error) });
      return NextResponse.json({ error: String(error) }, { status: 500 });
    }
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
