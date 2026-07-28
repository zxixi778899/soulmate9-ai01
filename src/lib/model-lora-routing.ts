import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily } from '@/lib/image-generation-routing';

export type RoutedLora = {
  name: string;
  strength_model: number;
  strength_clip: number;
};

type ModelLoraPlan = {
  selected: RoutedLora[];
  configured: string[];
  missing: string[];
  inventorySource: string;
  triggerWords: string[];
};

const splitList = (value: string | undefined): string[] =>
  [...new Set(String(value || '').split(/[;,\n]/).map((item) => item.trim()).filter(Boolean))];

const DEFAULT_FAMILY_LORAS: Record<ImageModelFamily, Partial<Record<CompanionCategory | 'nsfw' | '2d', string[]>>> = {
  flux: {
    female: ['flux_realism_xlabs.safetensors', 'flux_add_details.safetensors', 'flux_uncensored.safetensors'],
    male: ['flux_krea_realism.safetensors', 'flux_add_details.safetensors', 'flux_uncensored.safetensors'],
    transgender: ['flux_hyperrealism_aidma.safetensors', 'flux_add_details.safetensors', 'flux_uncensored.safetensors'],
    anime: ['flux_detail_enhancer.safetensors'],
    nsfw: ['flux_nsfw_klein_v2.safetensors'],
  },
  pony: {
    female: ['pony_detailifier_v5.safetensors'],
    male: ['pony_detailifier_v5.safetensors'],
    transgender: ['pony_detailifier_v5.safetensors'],
    anime: ['pony_detailifier_v5.safetensors'],
    nsfw: ['pony_detailifier_v5.safetensors'],
  },
  illustrious: {
    female: ['AddMicroDetails_Illustrious_v6.safetensors', 'BackgroundDetailerV3-000004.safetensors'],
    male: ['AddMicroDetails_Illustrious_v6.safetensors', 'BackgroundDetailerV3-000004.safetensors'],
    transgender: ['AddMicroDetails_Illustrious_v6.safetensors', 'BackgroundDetailerV3-000004.safetensors'],
    anime: ['AddMicroDetails_Illustrious_v6.safetensors', 'BackgroundDetailerV3-000004.safetensors'],
    '2d': ['StS-Illustrious-Detail-Slider-v1.0.safetensors'],
  },
};

function inventoryForFamily(family: ImageModelFamily | 'sdxl'): { files: Set<string>; source: string } {
  const familyKey = family.toUpperCase();
  const familyValue = process.env[`RUNPOD_INSTALLED_LORAS_${familyKey}`];
  const sdxlValue = family === 'flux' ? '' : process.env.RUNPOD_INSTALLED_LORAS_SDXL;
  const fallback = family === 'flux' ? process.env.RUNPOD_INSTALLED_LORAS : '';
  const value = familyValue || sdxlValue || fallback || '';
  return {
    files: new Set(splitList(value)),
    source: familyValue
      ? `RUNPOD_INSTALLED_LORAS_${familyKey}`
      : sdxlValue
        ? 'RUNPOD_INSTALLED_LORAS_SDXL'
        : fallback
          ? 'RUNPOD_INSTALLED_LORAS'
          : 'unverified',
  };
}

function configuredCandidates(
  family: ImageModelFamily,
  category: CompanionCategory,
  intensity: NsfwIntensity,
  animeStyle: AnimeRenderStyle,
): string[] {
  const prefix = family === 'pony' ? 'RUNPOD_PONY' : family === 'illustrious' ? 'RUNPOD_ILLUSTRIOUS' : 'RUNPOD_FLUX';
  const normalizedCategory = category === 'anime' ? 'FEMALE' : category.toUpperCase();
  const values = [
    process.env[`${prefix}_${normalizedCategory}_LORAS`],
    intensity >= 3 ? process.env[`${prefix}_NSFW_LORAS`] : '',
    animeStyle === '2d' ? process.env[`${prefix}_2D_LORAS`] : '',
    animeStyle === '3d' ? process.env[`${prefix}_3D_LORAS`] : '',
    process.env[`${prefix}_LORAS`],
  ];
  const configured = [...new Set(values.flatMap(splitList))];
  if (configured.length > 0) return configured;
  const defaults = DEFAULT_FAMILY_LORAS[family];
  return [...new Set([
    ...(defaults[category] || defaults.female || []),
    ...(intensity >= 3 ? defaults.nsfw || [] : []),
    ...(animeStyle === '2d' ? defaults['2d'] || [] : []),
  ])];
}

function rankInventory(files: Set<string>, category: CompanionCategory, intensity: NsfwIntensity): string[] {
  const categoryPattern = category === 'transgender'
    ? /trans|futa|mtf|gender/
    : category === 'male'
      ? /male|masc|man|muscl/
      : /female|woman|curvy|breast|body/;
  const adultPattern = /nsfw|adult|pose|sex|anatomy|detail|skin|hand/;
  return [...files]
    .map((name) => ({
      name,
      score: (categoryPattern.test(name.toLowerCase()) ? 4 : 0) +
        (intensity >= 3 && adultPattern.test(name.toLowerCase()) ? 3 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((item) => item.name);
}

function triggersForLora(name: string): string[] {
  const lower = name.toLowerCase();
  if (lower.includes('detailifier')) return ['detailerlora'];
  if (lower.includes('backgrounddetailer')) return ['detailed background'];
  if (lower.includes('addmicrodetails')) return ['micro details', 'detailed skin'];
  if (lower.includes('detail-slider') || lower.includes('detail_slider')) return ['detail slider'];
  if (lower.includes('detail_enhancer') || lower.includes('detail-enhancer')) return ['intricate details'];
  if (lower.includes('add_details') || lower.includes('add-details')) return ['sharp focus'];
  if (lower.includes('xlabs') || lower.includes('realism_xlabs')) return ['raw photo'];
  if (lower.includes('krea')) return ['natural lighting'];
  if (lower.includes('hyperrealism') || lower.includes('aidma')) return ['hyperrealistic'];
  if (lower.includes('nsfw_klein') || lower.includes('klein')) return ['explicit'];
  return [];
}

function strengthForIntensity(intensity: NsfwIntensity, index: number): number {
  const base = intensity >= 5 ? 0.72 : intensity === 4 ? 0.65 : intensity === 3 ? 0.58 : 0.5;
  return Number(Math.max(0.35, base - index * 0.08).toFixed(2));
}

export function validateModelLoraName(
  family: ImageModelFamily | 'sdxl',
  requested: string,
): { name: string | null; reason?: string } {
  const base = requested.split(/[/\\]/).pop()?.trim() || '';
  if (!base.endsWith('.safetensors')) return { name: null, reason: 'invalid-extension' };
  const inventory = inventoryForFamily(family);
  // SDXL-family endpoints reject an unknown LoRA before sampling. Fail
  // closed until the selected endpoint's mounted inventory is configured.
  if (inventory.files.size === 0 && family !== 'flux') {
    return { name: null, reason: 'inventory-unavailable-strict' };
  }
  if (inventory.files.size === 0) return { name: base, reason: 'unverified-permissive' };
  if (inventory.files.has(base)) return { name: base };
  return { name: null, reason: `missing-from-${inventory.source}` };
}

export function resolveModelLoraPlan(input: {
  modelFamily: ImageModelFamily;
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle?: AnimeRenderStyle;
  requested?: RoutedLora[];
  maxLoras?: number;
}): ModelLoraPlan {
  const maxLoras = Math.min(4, Math.max(1, input.maxLoras || 3));
  const inventory = inventoryForFamily(input.modelFamily);
  const configured = configuredCandidates(
    input.modelFamily,
    input.category,
    input.intensity,
    input.animeStyle || 'realistic',
  );
  const requested = input.requested || [];
  const canAutoSelectInventory = inventory.source === `RUNPOD_INSTALLED_LORAS_${input.modelFamily.toUpperCase()}`;
  const inventoryCandidates = configured.length === 0 && canAutoSelectInventory
    ? rankInventory(inventory.files, input.category, input.intensity)
    : [];
  const names = [...new Set([...requested.map((item) => item.name), ...configured, ...inventoryCandidates])];
  const inventoryVerified = inventory.files.size > 0;
  const allowUnverified = input.modelFamily === 'flux';
  const verifiedNames = names.filter(
    (name) => inventory.files.has(name) || (!inventoryVerified && allowUnverified),
  );
  const fallbackNames = verifiedNames.length === 0 && canAutoSelectInventory
    ? rankInventory(inventory.files, input.category, input.intensity)
    : [];
  const allowed = [...new Set([...verifiedNames, ...fallbackNames])].slice(0, maxLoras);
  const selected = allowed.map((name, index) => {
    const explicit = requested.find((item) => item.name === name);
    const strength = strengthForIntensity(input.intensity, index);
    return {
      name,
      strength_model: Number(Math.min(0.9, explicit?.strength_model ?? strength).toFixed(2)),
      strength_clip: Number(Math.min(0.9, explicit?.strength_clip ?? explicit?.strength_model ?? strength).toFixed(2)),
    };
  });
  const total = selected.reduce((sum, item) => sum + item.strength_model, 0);
  const scale = total > 1.65 ? 1.65 / total : 1;
  return {
    selected: selected.map((item) => ({
      ...item,
      strength_model: Number((item.strength_model * scale).toFixed(2)),
      strength_clip: Number((item.strength_clip * scale).toFixed(2)),
    })),
    configured: names,
    missing: names.filter((name) => !inventory.files.has(name) && (inventoryVerified || !allowUnverified)),
    inventorySource: inventory.source,
    triggerWords: [...new Set(selected.flatMap((item) => triggersForLora(item.name)))],
  };
}
