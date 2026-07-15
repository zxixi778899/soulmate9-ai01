/**
 * Gift persistence (cascade):
 * 1) chat_gifts table
 * 2) site_settings key = chat_gifts
 * 3) local file data/chat-gifts.json  ← works with zero migrations
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';
import {
  DEFAULT_CHAT_GIFTS,
  normalizeGiftRow,
  slugifyGiftCode,
  type ChatGift,
} from '@/lib/gifts/catalog';
import { isTableMissingError } from '@/lib/gifts/ensure-table';

export const SITE_SETTINGS_GIFTS_KEY = 'chat_gifts';

export type GiftStoreSource = 'db' | 'site_settings' | 'file' | 'defaults';

function giftsFilePath(): string {
  return path.join(process.cwd(), 'data', 'chat-gifts.json');
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `gf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function loadFromFile(): Promise<ChatGift[]> {
  try {
    const raw = await readFile(giftsFilePath(), 'utf8');
    const parsed = JSON.parse(raw) as { gifts?: unknown[] } | unknown[];
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { gifts?: unknown[] }).gifts)
        ? (parsed as { gifts: unknown[] }).gifts
        : [];
    return arr.map((r) => normalizeGiftRow(r as Record<string, unknown>));
  } catch {
    return [];
  }
}

async function saveToFile(gifts: ChatGift[]): Promise<{ ok: boolean; error?: string }> {
  try {
    const dir = path.dirname(giftsFilePath());
    await mkdir(dir, { recursive: true });
    await writeFile(
      giftsFilePath(),
      JSON.stringify({ gifts, updated_at: new Date().toISOString() }, null, 2),
      'utf8',
    );
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function loadFromSiteSettings(
  supabase: SupabaseClient,
): Promise<ChatGift[] | null> {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', SITE_SETTINGS_GIFTS_KEY)
      .maybeSingle();
    if (error) {
      if (isTableMissingError(error.message || '')) return null;
      logger.warn('[gifts/store] site_settings read failed', { err: error.message });
      return null;
    }
    const val = data?.value;
    if (!val) return [];
    const arr = Array.isArray(val)
      ? val
      : val && typeof val === 'object' && Array.isArray((val as { gifts?: unknown }).gifts)
        ? (val as { gifts: unknown[] }).gifts
        : null;
    if (!arr) return [];
    return arr.map((r) => normalizeGiftRow(r as Record<string, unknown>));
  } catch {
    return null;
  }
}

async function saveToSiteSettings(
  supabase: SupabaseClient,
  gifts: ChatGift[],
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('site_settings').upsert(
    {
      key: SITE_SETTINGS_GIFTS_KEY,
      value: { gifts, updated_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Persist to site_settings if possible, always mirror to file */
async function persistFallback(
  supabase: SupabaseClient | null,
  gifts: ChatGift[],
): Promise<{ ok: boolean; source: GiftStoreSource; error?: string }> {
  if (supabase) {
    const s = await saveToSiteSettings(supabase, gifts);
    if (s.ok) {
      await saveToFile(gifts).catch(() => undefined);
      return { ok: true, source: 'site_settings' };
    }
  }
  const f = await saveToFile(gifts);
  if (f.ok) return { ok: true, source: 'file' };
  return { ok: false, source: 'defaults', error: f.error || 'persist failed' };
}

export async function listGifts(
  supabase: SupabaseClient,
  opts?: { includeInactive?: boolean },
): Promise<{ gifts: ChatGift[]; source: GiftStoreSource; hint?: string }> {
  // 1) Dedicated table
  let q = supabase.from('chat_gifts').select('*').order('sort_order', { ascending: true });
  if (!opts?.includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (!error) {
    return {
      gifts: (data || []).map((r) => normalizeGiftRow(r as Record<string, unknown>)),
      source: 'db',
    };
  }

  // 2) site_settings
  if (isTableMissingError(error.message || '') || error) {
    const fromSettings = await loadFromSiteSettings(supabase);
    if (fromSettings !== null && fromSettings.length > 0) {
      const list = opts?.includeInactive
        ? fromSettings
        : fromSettings.filter((g) => g.is_active);
      return {
        gifts: list,
        source: 'site_settings',
        hint: '使用 site_settings 存储（chat_gifts 表不存在）',
      };
    }
  }

  // 3) local file
  const fromFile = await loadFromFile();
  if (fromFile.length > 0) {
    const list = opts?.includeInactive ? fromFile : fromFile.filter((g) => g.is_active);
    return {
      gifts: list,
      source: 'file',
      hint: '使用本地 data/chat-gifts.json（数据库无 chat_gifts / site_settings 表）',
    };
  }

  return {
    gifts: DEFAULT_CHAT_GIFTS,
    source: 'defaults',
    hint:
      '数据库尚无礼物表。保存将写入本地 data/chat-gifts.json。' +
      '建议在 Supabase SQL 执行完整建表脚本后迁移到正式表。',
  };
}

export async function createGift(
  supabase: SupabaseClient,
  input: Partial<ChatGift> & { name: string },
): Promise<{ gift: ChatGift; source: GiftStoreSource } | { error: string }> {
  const gift: ChatGift = {
    id: randomId(),
    code: (input.code || slugifyGiftCode(input.name)).slice(0, 64),
    name: input.name.trim().slice(0, 128),
    description: input.description || '',
    emoji: (input.emoji || '🎁').slice(0, 32),
    icon_url: input.icon_url || null,
    cost_tokens: Math.max(0, Number(input.cost_tokens) || 0),
    intimacy_boost: Math.max(0, Number(input.intimacy_boost) || 0),
    effect_type: input.effect_type || 'float_emoji',
    effect_config: input.effect_config || {},
    effect_asset_url: input.effect_asset_url || null,
    sort_order: Math.round(Number(input.sort_order) || 0),
    is_active: input.is_active !== false,
  };

  const row = {
    code: gift.code,
    name: gift.name,
    description: gift.description,
    emoji: gift.emoji,
    icon_url: gift.icon_url,
    cost_tokens: gift.cost_tokens,
    intimacy_boost: gift.intimacy_boost,
    effect_type: gift.effect_type,
    effect_config: gift.effect_config,
    effect_asset_url: gift.effect_asset_url,
    sort_order: gift.sort_order,
    is_active: gift.is_active,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('chat_gifts').insert(row).select('*').single();
  if (!error && data) {
    // mirror file for backup
    const listed = await listGifts(supabase, { includeInactive: true });
    if (listed.source === 'db') {
      await saveToFile(listed.gifts).catch(() => undefined);
    }
    return { gift: normalizeGiftRow(data as Record<string, unknown>), source: 'db' };
  }

  // Fallback path
  let existing: ChatGift[] = [];
  const fromSettings = await loadFromSiteSettings(supabase);
  if (fromSettings) existing = fromSettings;
  else existing = await loadFromFile();

  if (existing.length === 0) {
    // start from defaults so we don't lose seed list
    existing = DEFAULT_CHAT_GIFTS.map((g) => ({ ...g, id: randomId() }));
  }

  if (existing.some((g) => g.code === gift.code)) {
    gift.code = `${gift.code}_${Date.now().toString(36).slice(-4)}`;
  }
  const next = [...existing, gift];
  const saved = await persistFallback(supabase, next);
  if (!saved.ok) {
    return {
      error:
        saved.error ||
        error?.message ||
        '保存失败',
    };
  }
  return { gift, source: saved.source };
}

export async function updateGift(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<ChatGift>,
): Promise<{ gift: ChatGift; source: GiftStoreSource } | { error: string }> {
  if (id.startsWith('seed-')) {
    // Convert seed edit into create-with-defaults overlay
    const base = DEFAULT_CHAT_GIFTS.find((g) => g.id === id || g.code === id.replace(/^seed-/, ''));
    const created = await createGift(supabase, {
      ...(base || {}),
      ...patch,
      name: patch.name || base?.name || 'Gift',
      code: patch.code || base?.code,
    });
    return created;
  }

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const map: Array<keyof ChatGift> = [
    'name',
    'description',
    'emoji',
    'icon_url',
    'cost_tokens',
    'intimacy_boost',
    'effect_type',
    'effect_config',
    'effect_asset_url',
    'sort_order',
    'is_active',
  ];
  for (const k of map) {
    if (patch[k] !== undefined) row[k] = patch[k];
  }

  const { data, error } = await supabase
    .from('chat_gifts')
    .update(row)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (!error && data) {
    return { gift: normalizeGiftRow(data as Record<string, unknown>), source: 'db' };
  }

  let existing = (await loadFromSiteSettings(supabase)) || (await loadFromFile());
  if (existing.length === 0) existing = DEFAULT_CHAT_GIFTS.map((g) => ({ ...g, id: randomId() }));

  const idx = existing.findIndex((g) => g.id === id || g.code === id);
  if (idx < 0) return { error: error?.message || '礼物不存在' };

  const merged: ChatGift = {
    ...existing[idx],
    ...patch,
    id: existing[idx].id,
    code: existing[idx].code,
  };
  existing[idx] = merged;
  const saved = await persistFallback(supabase, existing);
  if (!saved.ok) return { error: saved.error || '更新失败' };
  return { gift: merged, source: saved.source };
}

export async function deleteGift(
  supabase: SupabaseClient,
  id: string,
  soft: boolean,
): Promise<{ ok: true; source: GiftStoreSource } | { error: string }> {
  if (id.startsWith('seed-')) {
    return { error: '种子数据请先同步后再删除' };
  }

  if (soft) {
    const { error } = await supabase
      .from('chat_gifts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) return { ok: true, source: 'db' };
  } else {
    const { error } = await supabase.from('chat_gifts').delete().eq('id', id);
    if (!error) return { ok: true, source: 'db' };
  }

  const existing = (await loadFromSiteSettings(supabase)) || (await loadFromFile());
  const next = soft
    ? existing.map((g) => (g.id === id ? { ...g, is_active: false } : g))
    : existing.filter((g) => g.id !== id);
  const saved = await persistFallback(supabase, next);
  if (!saved.ok) return { error: saved.error || '删除失败' };
  return { ok: true, source: saved.source };
}

export async function seedDefaultGifts(
  supabase: SupabaseClient,
): Promise<{ seeded: number; source: GiftStoreSource; error?: string }> {
  let seeded = 0;
  let tableWorks = true;

  for (const g of DEFAULT_CHAT_GIFTS) {
    const row = {
      code: g.code,
      name: g.name,
      description: g.description,
      emoji: g.emoji,
      cost_tokens: g.cost_tokens,
      intimacy_boost: g.intimacy_boost,
      effect_type: g.effect_type,
      effect_config: g.effect_config,
      sort_order: g.sort_order,
      is_active: true,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('chat_gifts').upsert(row, { onConflict: 'code' });
    if (error) {
      if (isTableMissingError(error.message || '')) {
        tableWorks = false;
        break;
      }
      logger.warn('[gifts/store] seed row failed', { code: g.code, err: error.message });
    } else {
      seeded += 1;
    }
  }
  if (tableWorks && seeded > 0) {
    return { seeded, source: 'db' };
  }

  // Merge into fallback store
  const existing = (await loadFromSiteSettings(supabase)) || (await loadFromFile());
  const byCode = new Map(existing.map((g) => [g.code, g]));
  for (const g of DEFAULT_CHAT_GIFTS) {
    if (!byCode.has(g.code)) {
      byCode.set(g.code, { ...g, id: randomId() });
      seeded += 1;
    } else {
      // refresh defaults lightly
      const prev = byCode.get(g.code)!;
      byCode.set(g.code, {
        ...prev,
        name: prev.name || g.name,
        emoji: prev.emoji || g.emoji,
        effect_type: prev.effect_type || g.effect_type,
      });
    }
  }
  const list = Array.from(byCode.values()).sort((a, b) => a.sort_order - b.sort_order);
  const saved = await persistFallback(supabase, list);
  if (!saved.ok) {
    return { seeded: 0, source: 'defaults', error: saved.error || 'seed failed' };
  }
  return { seeded: Math.max(seeded, list.length), source: saved.source };
}
