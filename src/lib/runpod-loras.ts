/**
 * LoRAs that actually exist on the RunPod network volume (models/loras/).
 * Comfy validates lora_name against this list — anything else fails the job.
 * Update when you download more files to the volume.
 */
export const VOLUME_INSTALLED_LORAS = [
  'flux_body_curvy_v1.safetensors',
  'flux_body_pear_v1.safetensors',
  'flux_detail_hands_v1.safetensors',
  'flux_detail_skin_nplastic_v1.safetensors',
  'flux_detail_skin_v1.safetensors',
  'flux_style_hyperreal_aidma_v1.safetensors',
  'flux_style_photoreal_v1.safetensors',
] as const;

export type VolumeInstalledLora = (typeof VOLUME_INSTALLED_LORAS)[number];

const DEFAULT_FALLBACK: VolumeInstalledLora = 'flux_style_photoreal_v1.safetensors';

function parseEnvInstalled(): string[] {
  const raw = process.env.RUNPOD_INSTALLED_LORAS || process.env.COMFY_INSTALLED_LORAS || '';
  if (!raw.trim()) return [];
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.endsWith('.safetensors') ? s : `${s}.safetensors`));
}

/** Effective installed set: code allowlist + optional env extras. */
export function getInstalledLoraSet(): Set<string> {
  const set = new Set<string>(VOLUME_INSTALLED_LORAS);
  for (const extra of parseEnvInstalled()) set.add(extra);
  return set;
}

export function isLoraInstalled(name: string | null | undefined): boolean {
  if (!name?.trim()) return false;
  return getInstalledLoraSet().has(String(name).trim());
}

/**
 * Clamp a requested LoRA to something Comfy can load.
 * Missing pose/outfit files fall back to style photoreal (or first installed).
 */
export function sanitizeLoraForVolume(
  requested: string | null | undefined,
  opts?: { fallback?: string | null; allowNull?: boolean },
): { lora_name: string | null; changed: boolean; reason?: string } {
  const allowNull = opts?.allowNull !== false;
  const raw = requested == null ? '' : String(requested).trim();
  if (!raw) {
    return { lora_name: null, changed: false };
  }

  const installed = getInstalledLoraSet();
  if (installed.has(raw)) {
    return { lora_name: raw, changed: false };
  }

  // basename only
  const base = raw.split(/[/\\]/).pop() || raw;
  if (installed.has(base)) {
    return { lora_name: base, changed: base !== raw, reason: 'basename' };
  }

  const fb =
    opts?.fallback === null
      ? null
      : opts?.fallback && installed.has(opts.fallback)
        ? opts.fallback
        : installed.has(DEFAULT_FALLBACK)
          ? DEFAULT_FALLBACK
          : [...installed][0] || null;

  if (!fb) {
    return {
      lora_name: allowNull ? null : null,
      changed: true,
      reason: `missing:${raw}; no fallback on volume`,
    };
  }

  return {
    lora_name: fb,
    changed: true,
    reason: `missing:${raw}; fallback:${fb}`,
  };
}

/** Prefer first installed candidate in order. */
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
