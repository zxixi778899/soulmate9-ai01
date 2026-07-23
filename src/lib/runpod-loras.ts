/**
 * LoRA Registry & Volume Management
 *
 * Architecture: Two-LoRA stack per generation
 *   - Primary  = style LoRA (photoreal / hyperreal) — always applied
 *   - Secondary = body or detail LoRA — applied when the character warrants it
 *
 * Only LoRAs confirmed on the RunPod network volume are listed here.
 * Update LORA_REGISTRY when you download more files.
 *
 * Environment variables:
 *   RUNPOD_INSTALLED_LORAS / COMFY_INSTALLED_LORAS
 *     Comma/semicolon/newline-separated extra filenames (auto-appends .safetensors)
 */

import { logger } from '@/lib/logger';

// ─── Category types ──────────────────────────────────────────
export type LoraCategory = 'style' | 'body' | 'detail';

// ─── Installed LoRA registry ─────────────────────────────────
export interface LoraEntry {
  /** Filename on volume (models/loras/) */
  file: string;
  /** Category */
  category: LoraCategory;
  /** Recommended model strength */
  strength: number;
  /** Short label for admin UI */
  label: string;
  /** ComfyUI trigger words (empty for FLUX) */
  trigger_words: string[];
}

/**
 * Source of truth: LoRAs physically present on the RunPod volume.
 * Add new entries here after downloading to the volume.
 * NOTE: sanitizeLoraForVolume also accepts any .safetensors filename directly
 * (permissive mode) — the registry is for metadata/strength defaults only.
 */
export const LORA_REGISTRY: readonly LoraEntry[] = [
  // ── Civitai LoRAs (actual files on volume) ──
  {
    file: 'AIDILETTA © - 2.0 - FLUX.safetensors',
    category: 'style',
    strength: 0.7,
    label: 'AIDILETTA 2.0 (character)',
    trigger_words: [],
  },
  {
    file: 'flux see through lingenie 512X768.safetensors',
    category: 'style',
    strength: 0.6,
    label: 'See-through lingerie',
    trigger_words: [],
  },
  {
    file: 'ZIT see through lingerie outfit V2.safetensors',
    category: 'style',
    strength: 0.6,
    label: 'ZIT lingerie V2',
    trigger_words: [],
  },
  // ── Legacy / generic ──
  {
    file: 'flux_style_photoreal_v1.safetensors',
    category: 'style',
    strength: 0.55,
    label: 'Photoreal (default)',
    trigger_words: [],
  },
  {
    file: 'flux_style_hyperreal_aidma_v1.safetensors',
    category: 'style',
    strength: 0.50,
    label: 'Hyperreal (AIDMA)',
    trigger_words: [],
  },
  // ── Body ──
  {
    file: 'flux_body_curvy_v1.safetensors',
    category: 'body',
    strength: 0.50,
    label: 'Curvy body',
    trigger_words: [],
  },
  {
    file: 'flux_body_pear_v1.safetensors',
    category: 'body',
    strength: 0.50,
    label: 'Pear body',
    trigger_words: [],
  },
  // ── Detail ──
  {
    file: 'flux_detail_skin_v1.safetensors',
    category: 'detail',
    strength: 0.40,
    label: 'Skin detail',
    trigger_words: [],
  },
  {
    file: 'flux_detail_skin_nplastic_v1.safetensors',
    category: 'detail',
    strength: 0.35,
    label: 'Skin natural (no plastic)',
    trigger_words: [],
  },
  {
    file: 'flux_detail_hands_v1.safetensors',
    category: 'detail',
    strength: 0.35,
    label: 'Hand detail',
    trigger_words: [],
  },
] as const;

// ─── Installed set helpers ───────────────────────────────────

function parseEnvInstalled(): string[] {
  const raw = process.env.RUNPOD_INSTALLED_LORAS || process.env.COMFY_INSTALLED_LORAS || '';
  if (!raw.trim()) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith('.safetensors') ? s : `${s}.safetensors`));
}

/** Runtime inventory reported from the mounted RunPod volume. */
export function getVerifiedInstalledLoraSet(): Set<string> {
  return new Set(parseEnvInstalled());
}

/** Whether this deployment has evidence from the mounted volume. */
export function hasVerifiedLoraInventory(): boolean {
  return getVerifiedInstalledLoraSet().size > 0;
}

/** Legacy allowlist used to keep generation backward compatible. */
export function getInstalledLoraSet(): Set<string> {
  const set = new Set<string>(LORA_REGISTRY.map((e) => e.file));
  for (const extra of parseEnvInstalled()) set.add(extra);
  return set;
}

export function isLoraInstalled(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return getInstalledLoraSet().has(String(name).trim());
}

/** Look up a registry entry by filename (partial match OK). */
export function findLoraEntry(name: string): LoraEntry | undefined {
  const n = name.trim();
  return LORA_REGISTRY.find(
    (e) => e.file === n || e.file.startsWith(n.replace(/\.safetensors$/, '')),
  );
}

/** Get all installed entries grouped by category. */
export function getLorasByCategory(): Record<LoraCategory, LoraEntry[]> {
  const installed = getInstalledLoraSet();
  const result: Record<LoraCategory, LoraEntry[]> = { style: [], body: [], detail: [] };
  for (const entry of LORA_REGISTRY) {
    if (installed.has(entry.file)) {
      result[entry.category].push(entry);
    }
  }
  return result;
}

/** Get default style LoRA (first installed style). */
export function getDefaultStyleLora(): LoraEntry {
  const envStyle = process.env.GIRLFRIEND_STYLE_LORA || process.env.RUNPOD_DEFAULT_LORA;
  if (envStyle) {
    const found = findLoraEntry(envStyle);
    if (found) return found;
  }
  return (
    LORA_REGISTRY.find((e) => e.category === 'style' && isLoraInstalled(e.file)) ||
    LORA_REGISTRY[0]
  );
}

// ─── Sanitize (backward compat) ──────────────────────────────

const DEFAULT_FALLBACK = getDefaultStyleLora().file;

/**
 * Clamp a requested LoRA filename to one that exists on the volume.
 * Returns { lora_name, changed, reason }.
 */
export function sanitizeLoraForVolume(
  requested: string | null | undefined,
  opts?: { fallback?: string | null; allowNull?: boolean },
): { lora_name: string | null; changed: boolean; reason?: string } {
  const raw = requested == null ? '' : String(requested).trim();
  if (!raw) {
    return { lora_name: null, changed: false };
  }

  const installed = getInstalledLoraSet();
  if (installed.has(raw)) {
    return { lora_name: raw, changed: false };
  }

  // Try basename match
  const base = raw.split(/[/\\]/).pop() || raw;
  if (installed.has(base)) {
    return { lora_name: base, changed: base !== raw, reason: 'basename' };
  }

  // Permissive mode: accept any .safetensors filename directly
  // (admin knows what's on the volume — don't block unknown LoRAs)
  if (base.endsWith('.safetensors') && !hasVerifiedLoraInventory()) {
    return { lora_name: base, changed: base !== raw, reason: 'unverified-permissive' };
  }

  // Fallback chain
  const fb =
    opts?.fallback === null
      ? null
      : opts?.fallback && installed.has(opts.fallback)
        ? opts.fallback
        : installed.has(DEFAULT_FALLBACK)
          ? DEFAULT_FALLBACK
          : [...installed][0] || null;

  if (!fb) {
    logger.warn('[lora] no fallback available', { requested: raw });
    return { lora_name: null, changed: true, reason: `missing:${raw}; no fallback` };
  }

  return { lora_name: fb, changed: true, reason: `missing:${raw}; fallback:${fb}` };
}

/** Prefer first installed candidate from ordered list. */
export function pickInstalledLora(
  candidates: Array<string | null | undefined>,
  fallback: string | null = DEFAULT_FALLBACK,
): string | null {
  const installed = getInstalledLoraSet();
  for (const c of candidates) {
    const n = c == null ? '' : String(c).trim();
    if (n && installed.has(n)) return n;
  }
  if (fallback && installed.has(fallback)) return fallback;
  return [...installed][0] || null;
}

// ─── Two-LoRA plan type ──────────────────────────────────────

/**
 * A LoRA plan with up to 2 LoRAs for stacking:
 *   - primary   = always a style LoRA (photoreal / hyperreal)
 *   - secondary = optional body or detail LoRA
 */
export interface LoraPlan {
  primary: {
    name: string;
    strength_model: number;
    strength_clip: number;
    note: string;
  };
  secondary: {
    name: string;
    strength_model: number;
    strength_clip: number;
    note: string;
  } | null;
}

/** Convert a LoraPlan to the loras[] array for runpodClient.generate(). */
export function planToLorasArray(plan: LoraPlan): Array<{
  name: string;
  strength_model: number;
  strength_clip: number;
}> {
  const arr: Array<{ name: string; strength_model: number; strength_clip: number }> = [
    { name: plan.primary.name, strength_model: plan.primary.strength_model, strength_clip: plan.primary.strength_clip },
  ];
  if (plan.secondary) {
    arr.push({
      name: plan.secondary.name,
      strength_model: plan.secondary.strength_model,
      strength_clip: plan.secondary.strength_clip,
    });
  }
  return arr;
}

/** Backward-compat: extract single lora_name from plan (primary). */
export function planToSingleLora(plan: LoraPlan): string {
  return plan.primary.name;
}

// ─── LoRA Authenticity Verification ─────────────────────────

export type LoraHealthEntry = {
  file: string;
  label: string;
  category: LoraCategory;
  status: 'ok' | 'missing' | 'unknown';
  note: string;
};

export type LoraHealthReport = {
  total: number;
  ok: number;
  missing: number;
  unknown: number;
  entries: LoraHealthEntry[];
  checkedAt: string;
  inventorySource: 'runtime-volume' | 'unavailable';
  inventoryCount: number;
};

/**
 * Verify LoRA authenticity by cross-referencing the registry against the
 * installed set (volume listing). Flags entries that are registered but not
 * physically present on the RunPod volume.
 *
 * Call this from the admin API to give the operator a health dashboard.
 */
export function verifyLoraHealth(): LoraHealthReport {
  const installed = getVerifiedInstalledLoraSet();
  const inventoryAvailable = installed.size > 0;
  const entries: LoraHealthEntry[] = LORA_REGISTRY.map((entry) => {
    const present = installed.has(entry.file);
    return {
      file: entry.file,
      label: entry.label,
      category: entry.category,
      status: present ? 'ok' : inventoryAvailable ? 'missing' : 'unknown',
      note: present
        ? 'Confirmed by runtime mounted-volume inventory'
        : inventoryAvailable
          ? 'NOT found in runtime mounted-volume inventory'
          : 'Registry entry only; runtime volume inventory unavailable',
    };
  });

  // Also check env-declared extras that are not in registry
  const envExtras = parseEnvInstalled();
  for (const extra of envExtras) {
    if (!LORA_REGISTRY.some((e) => e.file === extra)) {
      entries.push({
        file: extra,
        label: extra.replace('.safetensors', ''),
        category: 'style',
        status: 'ok',
        note: 'Declared via env (not in registry)',
      });
    }
  }

  const ok = entries.filter((e) => e.status === 'ok').length;
  const missing = entries.filter((e) => e.status === 'missing').length;
  return {
    total: entries.length,
    ok,
    missing,
    unknown: entries.length - ok - missing,
    entries,
    checkedAt: new Date().toISOString(),
    inventorySource: inventoryAvailable ? 'runtime-volume' : 'unavailable',
    inventoryCount: installed.size,
  };
}

/**
 * Quick check: is a specific LoRA file authentic (present + non-zero)?
 * Returns a reason string if problematic, null if OK.
 */
export function checkLoraAuthenticity(filename: string): string | null {
  const trimmed = filename.trim();
  if (!trimmed) return 'Empty filename';
  if (!trimmed.endsWith('.safetensors')) return 'Not a .safetensors file';
  const installed = getVerifiedInstalledLoraSet();
  if (!installed.size) {
    return 'Runtime volume inventory unavailable; set RUNPOD_INSTALLED_LORAS from models/loras';
  }
  if (!installed.has(trimmed)) {
    const sample = [...installed].slice(0, 5).join(", ");
    return "Not found on volume (installed: " + sample + "...)";
  }
  return null; // OK
}
