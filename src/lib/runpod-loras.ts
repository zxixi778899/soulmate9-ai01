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
import loraCatalog from '../../data/lora-catalog.json';

// ─── Category types ──────────────────────────────────────────
export type LoraCategory = 'style' | 'body' | 'detail' | 'outfit' | 'pose' | 'face';

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
type CatalogRegistryRow = {
  filename: string;
  label: string;
  category: string;
  default_strength: number;
  trigger_words?: string[];
};

/** Metadata catalog only. Runtime presence is always verified separately. */
export const LORA_REGISTRY: readonly LoraEntry[] = (
  (loraCatalog.loras || []) as CatalogRegistryRow[]
).map((item) => ({
  file: item.filename,
  label: item.label,
  category: item.category === 'action' ? 'pose' : item.category as LoraCategory,
  strength: item.default_strength,
  trigger_words: item.trigger_words || [],
}));

// ─── Installed set helpers ───────────────────────────────────

function parseEnvInstalled(): string[] {
  const raw = [
    process.env.RUNPOD_INSTALLED_LORAS,
    process.env.RUNPOD_INSTALLED_LORAS_FLUX,
    process.env.RUNPOD_INSTALLED_LORAS_PONY,
    process.env.RUNPOD_INSTALLED_LORAS_ILLUSTRIOUS,
    process.env.RUNPOD_INSTALLED_LORAS_SDXL,
    process.env.COMFY_INSTALLED_LORAS,
  ].filter(Boolean).join(',');
  if (!raw.trim()) return [];
  return [...new Set(raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith('.safetensors') ? s : `${s}.safetensors`)))];
}

/** Runtime inventory reported from the mounted RunPod volume. */
export function getVerifiedInstalledLoraSet(): Set<string> {
  return new Set(parseEnvInstalled());
}

/** Whether this deployment has evidence from the mounted volume. */
export function hasVerifiedLoraInventory(): boolean {
  return getVerifiedInstalledLoraSet().size > 0;
}

/** Authoritative runtime allowlist. Static metadata never proves a file exists. */
export function getInstalledLoraSet(): Set<string> {
  return getVerifiedInstalledLoraSet();
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
  const result: Record<LoraCategory, LoraEntry[]> = { style: [], body: [], detail: [], outfit: [], pose: [], face: [] };
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

/** Minimum valid LoRA file size (100 KB). Files below this are likely corrupted/placeholder. */
export const MIN_LORA_FILE_BYTES = 100 * 1024;

export type LoraHealthEntry = {
  file: string;
  label: string;
  category: LoraCategory;
  status: 'ok' | 'missing' | 'suspect' | 'unknown';
  note: string;
  /** Actual file size in bytes (if reported by volume scan). */
  fileSizeBytes?: number;
  /** Whether the file passes the minimum size threshold. */
  sizeValid?: boolean;
};

export type LoraHealthReport = {
  total: number;
  ok: number;
  missing: number;
  suspect: number;
  unknown: number;
  entries: LoraHealthEntry[];
  checkedAt: string;
  inventorySource: 'runtime-volume' | 'unavailable';
  inventoryCount: number;
  /** Summary of integrity issues for quick admin glance. */
  issues: string[];
};

/**
 * Verify LoRA authenticity by cross-referencing the registry against the
 * installed set (volume listing). Flags entries that are registered but not
 * physically present on the RunPod volume.
 *
 * @param fileSizes - Optional map of filename → size in bytes (from volume scan).
 *   When provided, files below MIN_LORA_FILE_BYTES are flagged as 'suspect'.
 *
 * Call this from the admin API to give the operator a health dashboard.
 */
export function verifyLoraHealth(fileSizes?: Record<string, number>): LoraHealthReport {
  const installed = getVerifiedInstalledLoraSet();
  const inventoryAvailable = installed.size > 0;
  const issues: string[] = [];

  const entries: LoraHealthEntry[] = LORA_REGISTRY.map((entry) => {
    const present = installed.has(entry.file);
    const size = fileSizes?.[entry.file];
    const sizeValid = size != null ? size >= MIN_LORA_FILE_BYTES : undefined;

    let status: LoraHealthEntry['status'];
    let note: string;

    if (!present) {
      status = inventoryAvailable ? 'missing' : 'unknown';
      note = inventoryAvailable
        ? 'NOT found in runtime mounted-volume inventory'
        : 'Registry entry only; runtime volume inventory unavailable';
      if (inventoryAvailable) issues.push(`${entry.label}: missing from volume`);
    } else if (sizeValid === false) {
      status = 'suspect';
      note = `File too small (${(size! / 1024).toFixed(1)} KB < ${MIN_LORA_FILE_BYTES / 1024} KB) — likely corrupted or placeholder`;
      issues.push(`${entry.label}: suspect (${(size! / 1024).toFixed(1)} KB)`);
    } else {
      status = 'ok';
      note = size != null
        ? `Confirmed on volume (${(size / 1024 / 1024).toFixed(1)} MB)`
        : 'Confirmed by runtime mounted-volume inventory';
    }

    return {
      file: entry.file,
      label: entry.label,
      category: entry.category,
      status,
      note,
      fileSizeBytes: size,
      sizeValid,
    };
  });

  // Also check env-declared extras that are not in registry
  const envExtras = parseEnvInstalled();
  for (const extra of envExtras) {
    if (!LORA_REGISTRY.some((e) => e.file === extra)) {
      const size = fileSizes?.[extra];
      const sizeValid = size != null ? size >= MIN_LORA_FILE_BYTES : undefined;
      const suspect = sizeValid === false;
      if (suspect) issues.push(`${extra}: suspect (${((size ?? 0) / 1024).toFixed(1)} KB)`);
      entries.push({
        file: extra,
        label: extra.replace('.safetensors', ''),
        category: 'style',
        status: suspect ? 'suspect' : 'ok',
        note: suspect
          ? `File too small — likely corrupted`
          : 'Declared via env (not in registry)',
        fileSizeBytes: size,
        sizeValid,
      });
    }
  }

  const ok = entries.filter((e) => e.status === 'ok').length;
  const missing = entries.filter((e) => e.status === 'missing').length;
  const suspect = entries.filter((e) => e.status === 'suspect').length;
  return {
    total: entries.length,
    ok,
    missing,
    suspect,
    unknown: entries.length - ok - missing - suspect,
    entries,
    checkedAt: new Date().toISOString(),
    inventorySource: inventoryAvailable ? 'runtime-volume' : 'unavailable',
    inventoryCount: installed.size,
    issues,
  };
}

/**
 * Deep integrity check: verifies presence AND file size for a batch of LoRAs.
 * Use after a volume scan reports file sizes (e.g. from RunPod `ls -l` output).
 * Returns only entries with problems (missing or suspect).
 */
export function verifyLoraIntegrity(
  fileSizes: Record<string, number>,
): { healthy: string[]; problems: LoraHealthEntry[] } {
  const report = verifyLoraHealth(fileSizes);
  const healthy = report.entries.filter((e) => e.status === 'ok').map((e) => e.file);
  const problems = report.entries.filter((e) => e.status !== 'ok');
  return { healthy, problems };
}

/**
 * Quick check: is a specific LoRA file authentic (present + non-zero)?
 * Returns a reason string if problematic, null if OK.
 *
 * @param fileSizeBytes - Optional known file size for size validation.
 */
export function checkLoraAuthenticity(filename: string, fileSizeBytes?: number): string | null {
  const trimmed = filename.trim();
  if (!trimmed) return 'Empty filename';
  if (!trimmed.endsWith('.safetensors')) return 'Not a .safetensors file';

  // Size validation when provided
  if (fileSizeBytes != null) {
    if (fileSizeBytes === 0) return 'File is 0 bytes — download failed or placeholder';
    if (fileSizeBytes < MIN_LORA_FILE_BYTES) {
      return `File too small (${(fileSizeBytes / 1024).toFixed(1)} KB < ${MIN_LORA_FILE_BYTES / 1024} KB minimum) — likely corrupted`;
    }
  }

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
