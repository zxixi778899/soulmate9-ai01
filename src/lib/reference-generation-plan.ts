import type { AnimeRenderStyle } from '@/lib/comfy-console/studio-profile';
import type { CompanionCategory } from '@/lib/companion-category';
import type { ImageModelFamily, ImageSurface } from '@/lib/image-generation-routing';

export type ReferenceRole =
  | 'identity'
  | 'pose'
  | 'style'
  | 'composition'
  | 'outfit'
  | 'prop'
  | 'environment'
  | 'quality';

export type ReferenceAsset = {
  id: string;
  url: string;
  role: ReferenceRole;
  category?: CompanionCategory | 'all';
  renderStyle?: AnimeRenderStyle | 'all';
  modelFamily?: ImageModelFamily | 'all';
  companionId?: string;
  nsfwLevel?: number;
  qualityScore?: number;
  promptHint?: string;
  tags?: string[];
};

export type ReferenceControlSettings = {
  enabled: boolean;
  autoSelect: boolean;
  maxReferences: number;
  identityStrength: number;
  poseStrength: number;
  styleStrength: number;
  compositionStrength: number;
  requireExactCategory: boolean;
  requireExactStyle: boolean;
};

export type ReferenceGenerationPlan = {
  primaryIdentity: ReferenceAsset | null;
  selected: ReferenceAsset[];
  promptHints: string[];
  controls: ReferenceControlSettings;
  trace: {
    surface: ImageSurface;
    candidateCount: number;
    excludedCrossCharacterIdentity: number;
    selectedRoles: ReferenceRole[];
  };
};

export const DEFAULT_REFERENCE_CONTROLS: ReferenceControlSettings = {
  enabled: true,
  autoSelect: true,
  maxReferences: 5,
  identityStrength: 0.82,
  poseStrength: 0.68,
  styleStrength: 0.32,
  compositionStrength: 0.48,
  requireExactCategory: true,
  requireExactStyle: true,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeReferenceControls(
  input?: Partial<ReferenceControlSettings> | null,
): ReferenceControlSettings {
  return {
    ...DEFAULT_REFERENCE_CONTROLS,
    ...input,
    maxReferences: clamp(Math.round(Number(input?.maxReferences ?? 5)), 1, 8),
    identityStrength: clamp(Number(input?.identityStrength ?? 0.82), 0, 1),
    poseStrength: clamp(Number(input?.poseStrength ?? 0.68), 0, 1),
    styleStrength: clamp(Number(input?.styleStrength ?? 0.32), 0, 1),
    compositionStrength: clamp(Number(input?.compositionStrength ?? 0.48), 0, 1),
  };
}

function compatible(
  asset: ReferenceAsset,
  input: {
    category: CompanionCategory;
    renderStyle: AnimeRenderStyle;
    modelFamily: ImageModelFamily;
    companionId?: string;
    nsfwLevel: number;
    allowIdentity: boolean;
    controls: ReferenceControlSettings;
  },
): boolean {
  if (!asset.url) return false;
  if (asset.modelFamily && asset.modelFamily !== 'all' && asset.modelFamily !== input.modelFamily) return false;
  if (asset.nsfwLevel && asset.nsfwLevel > input.nsfwLevel) return false;
  if (
    input.controls.requireExactCategory &&
    asset.category &&
    asset.category !== 'all' &&
    asset.category !== input.category
  ) return false;
  if (
    input.controls.requireExactStyle &&
    asset.renderStyle &&
    asset.renderStyle !== 'all' &&
    asset.renderStyle !== input.renderStyle
  ) return false;
  if (asset.role === 'identity') {
    if (!input.allowIdentity || !input.companionId) return false;
    return asset.companionId === input.companionId;
  }
  return true;
}

const ROLE_PRIORITY: Record<ReferenceRole, number> = {
  identity: 100,
  pose: 80,
  composition: 70,
  style: 60,
  outfit: 50,
  prop: 45,
  environment: 40,
  quality: 30,
};

export function buildReferenceGenerationPlan(input: {
  surface: ImageSurface;
  category: CompanionCategory;
  renderStyle: AnimeRenderStyle;
  modelFamily: ImageModelFamily;
  companionId?: string;
  nsfwLevel: number;
  assets: ReferenceAsset[];
  controls?: Partial<ReferenceControlSettings> | null;
  allowIdentity?: boolean;
}): ReferenceGenerationPlan {
  const controls = normalizeReferenceControls(input.controls);
  if (!controls.enabled) {
    return {
      primaryIdentity: null,
      selected: [],
      promptHints: [],
      controls,
      trace: {
        surface: input.surface,
        candidateCount: input.assets.length,
        excludedCrossCharacterIdentity: 0,
        selectedRoles: [],
      },
    };
  }

  const allowIdentity = input.allowIdentity !== false;
  const excludedCrossCharacterIdentity = input.assets.filter(
    (asset) =>
      asset.role === 'identity' &&
      (!allowIdentity || !input.companionId || asset.companionId !== input.companionId),
  ).length;
  const eligible = input.assets
    .filter((asset) => compatible(asset, { ...input, allowIdentity, controls }))
    .sort((a, b) => {
      const role = ROLE_PRIORITY[b.role] - ROLE_PRIORITY[a.role];
      if (role !== 0) return role;
      return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
    });

  const selected: ReferenceAsset[] = [];
  const usedRoles = new Set<ReferenceRole>();
  for (const asset of eligible) {
    if (selected.length >= controls.maxReferences) break;
    if (asset.role !== 'identity' && usedRoles.has(asset.role)) continue;
    selected.push(asset);
    usedRoles.add(asset.role);
  }

  const primaryIdentity = selected.find((asset) => asset.role === 'identity') || null;
  return {
    primaryIdentity,
    selected,
    promptHints: [...new Set(selected.map((asset) => asset.promptHint?.trim()).filter(Boolean) as string[])],
    controls,
    trace: {
      surface: input.surface,
      candidateCount: input.assets.length,
      excludedCrossCharacterIdentity,
      selectedRoles: selected.map((asset) => asset.role),
    },
  };
}

export function companionIdentityAssets(
  companionId: string,
  urls: string[],
  input: {
    category: CompanionCategory;
    renderStyle: AnimeRenderStyle;
    modelFamily: ImageModelFamily;
  },
): ReferenceAsset[] {
  return [...new Set(urls.filter(Boolean))].map((url, index) => ({
    id: `${companionId}:identity:${index}`,
    url,
    role: 'identity',
    companionId,
    category: input.category,
    renderStyle: input.renderStyle,
    modelFamily: input.modelFamily,
    qualityScore: 100 - index,
  }));
}
