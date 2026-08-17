import type { CompanionCategory } from '@/lib/companion-category';
import type { AnimeRenderStyle, NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily, ImageSurface } from '@/lib/image-generation-routing';
import loraCatalog from '../../data/lora-catalog.json';

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

// Legacy SDXL defaults — retained for completeness; routing never hits them
// anymore because the whole site runs on the unified FLUX pipeline.
const DEFAULT_FAMILY_LORAS: Record<ImageModelFamily, Partial<Record<CompanionCategory | 'nsfw' | '2d', string[]>>> = {
  flux: {
    female: [],
    male: [],
    transgender: [],
    anime: [],
    nsfw: [],
  },
  pony: {
    female: ['pony_detailifier_v5.safetensors', 'pony_mature_female_slider_v2.safetensors'],
    male: ['pony_detailifier_v5.safetensors', 'pony_gender_transition_slider.safetensors'],
    transgender: [
      'pony_detailifier_v5.safetensors',
      'pony_gender_transition_slider.safetensors',
      'pony_futa_style.safetensors',
    ],
    anime: ['pony_detailifier_v5.safetensors'],
    nsfw: ['BackgroundDetailerV3-000004.safetensors'],
  },
  illustrious: {
    female: ['AddMicroDetails_Illustrious_v6.safetensors', 'illustrious_nsfw_slider_v1.safetensors'],
    male: ['AddMicroDetails_Illustrious_v6.safetensors', 'illustrious_gender_transition_slider.safetensors'],
    transgender: [
      'AddMicroDetails_Illustrious_v6.safetensors',
      'illustrious_gender_transition_slider.safetensors',
      'illustrious_nsfw_slider_v1.safetensors',
    ],
    anime: ['AddMicroDetails_Illustrious_v6.safetensors'],
    nsfw: ['illustrious_nsfw_slider_v1.safetensors'],
    '2d': ['StS-Illustrious-Detail-Slider-v1.0.safetensors'],
  },
};

// ─── 模型族隔离：SDXL/FLUX/Pony/Illustrious LoRA 完全隔离，不同模型不套用 ───
type CatalogEntry = { filename: string; family?: string };
const CATALOG_FAMILY_BY_FILE: Map<string, ImageModelFamily> = new Map(
  (loraCatalog.loras as CatalogEntry[])
    .filter((entry): entry is CatalogEntry & { family: ImageModelFamily } =>
      entry.family === 'flux' || entry.family === 'pony' || entry.family === 'illustrious',
    )
    .map((entry) => [entry.filename, entry.family]),
);

// 未登记文件的前缀兜底：一眼可判族的命名直接隔离，无需等 catalog 收录。
const FAMILY_PREFIX_RULES: Array<[RegExp, ImageModelFamily]> = [
  [/^flux[_-]/i, 'flux'],
  [/rdanimeflux/i, 'flux'],
  [/^pony[_-]/i, 'pony'],
  [/illustrious/i, 'illustrious'],
];

export function isLoraFamilyCompatible(name: string, family: ImageModelFamily | 'sdxl'): boolean {
  const base = name.split(/[/\\]/).pop()?.trim() || name;
  const catalogFamily = CATALOG_FAMILY_BY_FILE.get(base);
  if (catalogFamily) {
    return family === 'sdxl' ? catalogFamily !== 'flux' : catalogFamily === family;
  }
  const lower = base.toLowerCase();
  for (const [pattern, detected] of FAMILY_PREFIX_RULES) {
    if (pattern.test(lower)) {
      return family === 'sdxl' ? detected !== 'flux' : detected === family;
    }
  }
  // 未登记且前缀无法判族：放行，交由运行时库存校验兜底。
  return true;
}

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
  const categoryConfigured = process.env[`${prefix}_${normalizedCategory}_LORAS`];
  const nsfwConfigured = intensity >= 3 ? process.env[`${prefix}_NSFW_LORAS`] : '';
  const values = family === 'flux' && intensity >= 3
    ? [
        nsfwConfigured,
        categoryConfigured,
        animeStyle === '2d' ? process.env[`${prefix}_2D_LORAS`] : '',
        animeStyle === '3d' ? process.env[`${prefix}_3D_LORAS`] : '',
        process.env[`${prefix}_LORAS`],
      ]
    : [
        categoryConfigured,
        nsfwConfigured,
        animeStyle === '2d' ? process.env[`${prefix}_2D_LORAS`] : '',
        animeStyle === '3d' ? process.env[`${prefix}_3D_LORAS`] : '',
        process.env[`${prefix}_LORAS`],
      ];
  const configured = [...new Set(values.flatMap(splitList))].filter((name) =>
    family !== 'flux' || intensity < 3 || !/uncensored/i.test(name) || !nsfwConfigured,
  );
  if (configured.length > 0) return configured;
  const defaults = DEFAULT_FAMILY_LORAS[family];
  const categoryDefaults = defaults[category] || defaults.female || [];
  const compatibleCategoryDefaults = family === 'flux' && intensity >= 3
    ? categoryDefaults.filter((name) => !/uncensored/i.test(name))
    : categoryDefaults;
  return [...new Set([
    ...(family === 'flux' && intensity >= 3 ? defaults.nsfw || [] : []),
    ...compatibleCategoryDefaults,
    ...(family !== 'flux' && intensity >= 3 ? defaults.nsfw || [] : []),
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

export type FluxScenarioLora = { name: string; strength: number };

/**
 * Curated FLUX LoRA plans per scenario (全站 FLUX 重构).
 * Every filename below is on the RUNPOD_INSTALLED_LORAS_FLUX inventory;
 * resolveModelLoraPlan still verifies against the mounted volume and drops
 * anything missing. Explicit env overrides (RUNPOD_FLUX_*_LORAS) win when set.
 */
export function fluxScenarioPlan(input: {
  category: CompanionCategory;
  intensity: NsfwIntensity;
  animeStyle: AnimeRenderStyle;
  surface?: ImageSurface;
  sceneText?: string;
}): FluxScenarioLora[] {
  const nsfw = input.intensity >= 3;

  // ─── 换装任务：按场景意图挑服装 LoRA + 写实底 ────────────────────────────
  if (input.surface === 'outfit') {
    const scene = String(input.sceneText || '').toLowerCase();
    const outfit = /latex|leather|pvc|rubber/.test(scene)
      ? { name: 'flux_outfit_latex_v1.safetensors', strength: 0.55 }
      : /bikini|swim|beach|pool/.test(scene)
        ? { name: 'flux_outfit_bikini_v1.safetensors', strength: 0.55 }
        : /bunny|playboy|兔女郎/.test(scene)
          ? { name: 'flux_outfit_bunny_v1.safetensors', strength: 0.55 }
          : /maid|女仆/.test(scene)
            ? { name: 'flux_outfit_maid_v1.safetensors', strength: 0.55 }
            : /school|uniform|制服/.test(scene)
              ? { name: 'flux_outfit_school_v1.safetensors', strength: 0.5 }
              : { name: 'flux_outfit_lingerie_v1.safetensors', strength: 0.55 };
    // 服装(0.55) + 写实底(0.35) = 0.9 ≤ 1.0 总强度约束
    return [outfit, { name: 'flux_style_photoreal_v1.safetensors', strength: 0.35 }];
  }

  // ─── 二次元 2D ────────────────────────────────────────────────────────────
  if (input.animeStyle === '2d') {
    // NSFW 时 anime(0.6) + lewd(0.35) = 0.95 ≤ 1.0
    const plan: FluxScenarioLora[] = [{ name: 'rdanimefluxv1rapid.safetensors', strength: 0.6 }];
    if (nsfw) plan.push({ name: 'flux_lewd_v1.safetensors', strength: 0.35 });
    return plan;
  }

  // ─── 3D 渲染 ──────────────────────────────────────────────────────────────
  if (input.animeStyle === '3d') {
    return [{ name: 'flux_3d_render_v1.safetensors', strength: 0.6 }];
  }

  // ─── 男性 ─────────────────────────────────────────────────────────────────
  if (input.category === 'male') {
    return nsfw
      ? [
          // NSFW：0.4 + 0.3 + 0.3 = 1.0
          { name: 'flux_male_masc_v1.safetensors', strength: 0.4 },
          { name: 'flux_male_muscle_v1.safetensors', strength: 0.3 },
          { name: 'flux_lewd_v1.safetensors', strength: 0.3 },
        ]
      : [
          // SFW：0.5 + 0.4 = 0.9
          { name: 'flux_male_masc_v1.safetensors', strength: 0.5 },
          { name: 'flux_style_photoreal_v1.safetensors', strength: 0.4 },
        ];
  }

  // ─── 跨性别 ───────────────────────────────────────────────────────────────
  if (input.category === 'transgender') {
    // NSFW：0.6 + 0.35 = 0.95 ≤ 1.0
    const plan: FluxScenarioLora[] = [{ name: 'realistic-mtf-trans.safetensors', strength: 0.6 }];
    if (nsfw) plan.push({ name: 'flux_lewd_v1.safetensors', strength: 0.35 });
    return plan;
  }

  // ─── 女性写实 ─────────────────────────────────────────────────────────────
  if (!nsfw) {
    // SFW：风格(0.3) + 皮肤细节(0.2) = 0.5，符合风格+细节 ≤0.5 约束
    return [
      { name: 'flux_style_photoreal_v1.safetensors', strength: 0.3 },
      { name: 'flux_detail_skin_v1.safetensors', strength: 0.2 },
    ];
  }
  if (input.intensity === 3) {
    // NSFW 3：lewd(0.5) + 皮肤细节(0.2) = 0.7 ≤ 1.0
    return [
      { name: 'flux_lewd_v1.safetensors', strength: 0.5 },
      { name: 'flux_detail_skin_v1.safetensors', strength: 0.2 },
    ];
  }
  // NSFW 4~5：lewd(0.4) + 动态姿势(0.35) + 高潮表情(0.25) = 1.0
  return [
    { name: 'flux_lewd_v1.safetensors', strength: 0.4 },
    { name: 'flux_pose_nsfw_dynamic_v1.safetensors', strength: 0.35 },
    { name: 'flux_face_ahegao_v1.safetensors', strength: 0.25 },
  ];
}

function triggersForLora(name: string): string[] {
  const lower = name.toLowerCase();
  // Curated FLUX LoRAs: only identity-relevant ones carry trigger words;
  // style/detail LoRAs stay trigger-free so prompts are not polluted.
  if (lower.includes('realistic-mtf-trans') || lower.includes('mtf_trans')) return ['transgender woman', 'developed breasts'];
  if (lower.includes('rdanimeflux')) return ['anime style', 'cel shading'];
  if (lower.includes('flux_3d_render')) return ['3d character render'];
  if (lower.includes('male_masc')) return ['masculine adult man'];
  if (lower.includes('male_muscle')) return ['muscular male body'];
  if (lower.includes('femboy')) return ['femboy'];
  if (lower.startsWith('flux_')) return [];
  if (lower.includes('detailifier')) return ['detailerlora'];
  if (lower.includes('backgrounddetailer')) return ['detailed background'];
  if (lower.includes('addmicrodetails')) return ['micro details', 'detailed skin'];
  if (lower.includes('detail-slider') || lower.includes('detail_slider')) return ['detail slider'];
  if (lower.includes('gender_transition') || lower.includes('gender-transition')) return ['adult', 'mature body'];
  if (lower.includes('futa')) return ['adult transgender', 'futanari'];
  if (lower.includes('nsfw_slider') || lower.includes('nsfw-slider')) return ['explicit adult'];
  if (lower.includes('sex_box') || lower.includes('sex-box')) return ['s3xb0x'];
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
  if (inventory.files.size === 0) return { name: null, reason: 'inventory-unavailable-strict' };
  if (!isLoraFamilyCompatible(base, family)) return { name: null, reason: 'family-mismatch' };
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
  identityAsset?: boolean;
  /** Runtime inventory supplied by the browser/admin volume API. */
  installedFiles?: Iterable<string>;
  /** Generation surface — 'outfit' activates the outfit-swap LoRA plan. */
  surface?: ImageSurface;
  /** Scene/prompt text used to detect outfit intent (latex/bikini/lingerie). */
  sceneText?: string;
}): ModelLoraPlan {
  // Identity anchors use the base checkpoint only. Style/detail LoRAs can change
  // age, facial geometry and colour before a stable identity exists.
  if (input.identityAsset) {
    return {
      selected: [],
      configured: [],
      missing: [],
      inventorySource: inventoryForFamily(input.modelFamily).source,
      triggerWords: [],
    };
  }
  const maxLoras = input.identityAsset
    ? 1
    : Math.min(4, Math.max(1, input.maxLoras || 3));
  const suppliedInventory = input.installedFiles ? new Set(input.installedFiles) : null;
  const inventory = suppliedInventory
    ? { files: suppliedInventory, source: 'runtime-volume' }
    : inventoryForFamily(input.modelFamily);
  const configured = configuredCandidates(
    input.modelFamily,
    input.category,
    input.intensity,
    input.animeStyle || 'realistic',
  );
  // FLUX: curated scenario plan replaces the old empty defaults. Explicit env
  // configuration (RUNPOD_FLUX_*_LORAS) still wins when present.
  const fluxPlan = input.modelFamily === 'flux'
    ? fluxScenarioPlan({
        category: input.category,
        intensity: input.intensity,
        animeStyle: input.animeStyle || 'realistic',
        surface: input.surface,
        sceneText: input.sceneText,
      })
    : [];
  const planStrength = new Map(fluxPlan.map((item) => [item.name, item.strength]));
  const effectiveConfigured = input.modelFamily === 'flux' && configured.length === 0
    ? fluxPlan.map((item) => item.name)
    : configured;
  const requested = input.requested || [];
  const canAutoSelectInventory = inventory.source === 'runtime-volume' || inventory.source === `RUNPOD_INSTALLED_LORAS_${input.modelFamily.toUpperCase()}`;
  const inventoryCandidates = effectiveConfigured.length === 0 && canAutoSelectInventory
    ? rankInventory(inventory.files, input.category, input.intensity)
    : [];
  const requestedNames = requested.map((item) => item.name);
  // FLUX: curated plan leads, manual picks fill remaining slots. Legacy
  // families keep their previous priority order.
  const prioritizedNames = input.modelFamily === 'flux'
    ? [...effectiveConfigured, ...requestedNames]
    : input.intensity >= 3
      ? [...effectiveConfigured, ...requestedNames]
      : [...requestedNames, ...effectiveConfigured];
  const names = [...new Set([...prioritizedNames, ...inventoryCandidates])]
    .filter((name) => isLoraFamilyCompatible(name, input.modelFamily))
    .filter((name) =>
      !input.identityAsset ||
      !/(?:add[_-]?details?|detail|skin|micro|hyperreal|aidma|nsfw|uncensored|pose|body|anatomy)/i.test(name),
    );
  const verifiedNames = names.filter((name) => inventory.files.has(name));
  const fallbackNames = (verifiedNames.length === 0 && canAutoSelectInventory
    ? rankInventory(inventory.files, input.category, input.intensity)
    : []).filter((name) => isLoraFamilyCompatible(name, input.modelFamily));
  const allowed = [...new Set([...verifiedNames, ...fallbackNames])].slice(0, maxLoras);
  const selected = allowed.map((name, index) => {
    const explicit = requested.find((item) => item.name === name);
    const baseStrength = input.identityAsset
      ? 0.3
      : explicit?.strength_model ?? planStrength.get(name) ?? strengthForIntensity(input.intensity, index);
    const maxStrength = input.identityAsset ? 0.32 : 0.9;
    return {
      name,
      strength_model: Number(Math.min(maxStrength, baseStrength).toFixed(2)),
      strength_clip: Number(Math.min(maxStrength, explicit?.strength_clip ?? baseStrength).toFixed(2)),
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
    missing: names.filter((name) => !inventory.files.has(name)),
    inventorySource: inventory.source,
    triggerWords: [...new Set(selected.flatMap((item) => triggersForLora(item.name)))],
  };
}

