import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { invalidateSettings } from '@/lib/revalidate';
import {
  loadPromptPresets,
  savePromptPresets,
  invalidatePromptPresetsCache,
  DEFAULT_PROMPT_PRESETS,
  type PromptPreset,
} from '@/lib/prompt-presets-store';

export const dynamic = 'force-dynamic';

// GET  list all presets (admin-only: presets contain NSFW prompt templates)
export async function GET(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const presets = await loadPromptPresets(guard.supabase);
  return NextResponse.json({ presets });
}

// POST  add a new preset
export async function POST(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  let body: { label?: string; positivePrompt?: string; negativePrompt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { label, positivePrompt, negativePrompt } = body;

  if (!label || !positivePrompt) {
    return NextResponse.json({ error: 'Missing required fields: label, positivePrompt' }, { status: 400 });
  }

  const presets = await loadPromptPresets(guard.supabase);
  const newPreset: PromptPreset = {
    id: `preset_${Date.now()}`,
    label,
    positivePrompt,
    negativePrompt: negativePrompt || DEFAULT_PROMPT_PRESETS[0].negativePrompt,
  };
  presets.push(newPreset);
  const { source } = await savePromptPresets(presets, guard.supabase);
  invalidatePromptPresetsCache();
  invalidateSettings();

  return NextResponse.json({ preset: newPreset, source });
}

// DELETE  remove a preset by id
export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin(req);
  if ('error' in guard && guard.error) return guard.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id query param' }, { status: 400 });
  }

  const presets = await loadPromptPresets(guard.supabase);
  const next = presets.filter((p) => p.id !== id);
  const { source } = await savePromptPresets(next, guard.supabase);
  invalidatePromptPresetsCache();
  invalidateSettings();

  return NextResponse.json({ success: true, source });
}
