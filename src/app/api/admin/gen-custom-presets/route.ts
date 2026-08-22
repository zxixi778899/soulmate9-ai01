/**
 * Admin CRUD for /generate workbench custom presets (pose / outfit / scene).
 *
 * GET    /api/admin/gen-custom-presets — full config
 * POST   /api/admin/gen-custom-presets — create one entry
 *          multipart: { category, label_en, label_zh?, prompt_hint?, file }
 *          JSON:      { category, label_en, label_zh?, prompt_hint?, url }
 *          replace-preview JSON: { category, slug, url } — swap an entry's image
 * DELETE /api/admin/gen-custom-presets?category=pose&slug=xxx — remove one entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { checkRateLimitAsync, rateLimitHeaders } from '@/lib/rate-limit';
import type { SiteSettingsClient } from '@/lib/site-settings-client';
import { uploadFile } from '@/lib/storage';
import {
  loadGenCustomPresets,
  addGenCustomPreset,
  setGenCustomPresetPreview,
  removeGenCustomPreset,
  invalidateGenCustomPresetsCache,
  isGenCustomPresetCategory,
  GEN_CUSTOM_PRESET_CATEGORIES,
} from '@/lib/gen-custom-presets-store';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const WRITE_LIMIT = { maxRequests: 60, windowMs: 60 * 60 * 1000 };

function cleanText(v: unknown, max = 80): string {
  return String(v || '').trim().slice(0, max);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  try {
    const config = await loadGenCustomPresets(admin.supabase as unknown as SiteSettingsClient);
    return NextResponse.json({ presets: config });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const rl = await checkRateLimitAsync(`admin-gen-presets:${admin.user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  try {
    const contentType = request.headers.get('content-type') || '';
    const client = admin.supabase as unknown as SiteSettingsClient;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      const category = String(body?.category || '').toLowerCase();
      const url = String(body?.url || body?.preview_url || '').trim();
      const slug = cleanText(body?.slug, 120);

      // Replace-preview branch: { category, slug, url }
      if (slug) {
        if (!isGenCustomPresetCategory(category)) {
          return NextResponse.json(
            { error: `category must be one of ${GEN_CUSTOM_PRESET_CATEGORIES.join(', ')}` },
            { status: 400 },
          );
        }
        if (!/^https?:\/\//.test(url)) {
          return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
        }
        const presets = await setGenCustomPresetPreview(category, slug, url, client);
        invalidateGenCustomPresetsCache();
        logger.info('[admin/gen-custom-presets] preview replaced', { category, slug });
        return NextResponse.json({ success: true, presets });
      }

      // Create branch: { category, label_en, label_zh?, prompt_hint?, url }
      const labelEn = cleanText(body?.label_en);
      if (!isGenCustomPresetCategory(category)) {
        return NextResponse.json(
          { error: `category must be one of ${GEN_CUSTOM_PRESET_CATEGORIES.join(', ')}` },
          { status: 400 },
        );
      }
      if (!labelEn) {
        return NextResponse.json({ error: 'label_en is required' }, { status: 400 });
      }
      if (!/^https?:\/\//.test(url)) {
        return NextResponse.json({ error: 'url must be a public http(s) image URL' }, { status: 400 });
      }
      const { config, entry } = await addGenCustomPreset(
        {
          category,
          label_en: labelEn,
          label_zh: cleanText(body?.label_zh),
          preview_url: url,
          prompt_hint: cleanText(body?.prompt_hint, 400),
        },
        client,
      );
      invalidateGenCustomPresetsCache();
      logger.info('[admin/gen-custom-presets] created', { category, slug: entry.slug });
      return NextResponse.json({ success: true, presets: config, entry });
    }

    // multipart: { category, label_en, label_zh?, prompt_hint?, file }
    const formData = await request.formData();
    const category = String(formData.get('category') || '').toLowerCase();
    const labelEn = cleanText(formData.get('label_en'));
    const file = formData.get('file') as File | null;

    if (!isGenCustomPresetCategory(category)) {
      return NextResponse.json(
        { error: `category must be one of ${GEN_CUSTOM_PRESET_CATEGORIES.join(', ')}` },
        { status: 400 },
      );
    }
    if (!labelEn) {
      return NextResponse.json({ error: 'label_en is required' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10MB.' }, { status: 400 });
    }

    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/webp' ? 'webp' : 'png';
    const safeLabel = labelEn.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadFile(
      buffer,
      `${category}-${safeLabel}-${Date.now()}.${ext}`,
      file.type,
      'gen-presets',
    );

    const { config, entry } = await addGenCustomPreset(
      {
        category,
        label_en: labelEn,
        label_zh: cleanText(formData.get('label_zh')),
        preview_url: result.url,
        prompt_hint: cleanText(formData.get('prompt_hint'), 400),
      },
      client,
    );
    invalidateGenCustomPresetsCache();
    logger.info('[admin/gen-custom-presets] created via upload', { category, slug: entry.slug });
    return NextResponse.json({ success: true, presets: config, entry });
  } catch (e) {
    logger.error('[admin/gen-custom-presets] create failed', {
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Create failed' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(request, 'admin');
  if (admin.error) return admin.error;

  const rl = await checkRateLimitAsync(`admin-gen-presets:${admin.user!.id}`, WRITE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl, WRITE_LIMIT) },
    );
  }

  const { searchParams } = new URL(request.url);
  const category = String(searchParams.get('category') || '').toLowerCase();
  const slug = cleanText(searchParams.get('slug'), 120);

  if (!isGenCustomPresetCategory(category)) {
    return NextResponse.json(
      { error: `category must be one of ${GEN_CUSTOM_PRESET_CATEGORIES.join(', ')}` },
      { status: 400 },
    );
  }
  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  try {
    const client = admin.supabase as unknown as SiteSettingsClient;
    const presets = await removeGenCustomPreset(category, slug, client);
    invalidateGenCustomPresetsCache();
    logger.info('[admin/gen-custom-presets] removed', { category, slug });
    return NextResponse.json({ success: true, presets });
  } catch (e) {
    logger.error('[admin/gen-custom-presets] delete failed', {
      category,
      slug,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Delete failed' },
      { status: 500 },
    );
  }
}
