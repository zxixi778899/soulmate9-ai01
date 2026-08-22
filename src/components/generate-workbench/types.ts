/**
 * Shared types for the Generate workbench (ourdream-style console).
 */

export interface Girl {
  id: string;
  name: string;
  portrait_url: string | null;
  avatar_url: string | null;
  image_url: string | null;
}

export interface WorkbenchPreset {
  category: string;
  slug: string;
  label_en: string;
  label_zh: string;
  preview_url: string | null;
  nsfw_level: number;
  tier: string;
  locked: boolean;
  pose_reference?: string | null;
  /** Admin custom presets carry a free-form prompt hint instead of a catalog slug. */
  prompt_hint?: string;
}

export interface OutfitOption {
  id: string;
  name: string;
  tier: string;
  category: string;
  wear_prompt: string;
  emoji?: string;
  preview_url?: string | null;
}

export interface HistoryJob {
  id: string;
  kind: string;
  status: string;
  girlfriend_id: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  created_at: string;
  publish_status?: 'none' | 'pending' | 'approved' | 'rejected';
}

/** Admin-managed custom preset card (pose / outfit / scene) from site_settings. */
export interface GenCustomPresetItem {
  slug: string;
  category: 'pose' | 'outfit' | 'scene';
  label_en: string;
  label_zh: string;
  preview_url: string;
  prompt_hint: string;
}

/** Personal library entry — one finished image flattened from history jobs. */
export interface PersonalWork {
  jobId: string;
  url: string;
}

export interface Candidate {
  job_id: string | null;
  image_url: string | null;
  status: string;
}

export type WorkbenchMode = 'image' | 'video';
export type WorkbenchSubMode = 'create' | 'edit';
export type SlotKind = 'pose' | 'outfit' | 'scene';

/** Custom presets created by admins use the custom- slug prefix. */
export function isCustomPresetSlug(slug: string): boolean {
  return slug.startsWith('custom-');
}
export type GalleryFilter = 'all' | 'images' | 'videos' | 'liked';

export const IMAGE_KINDS = new Set(['image', 'chat_image', 'portrait', 'tryon']);

export function girlIdentityUrl(girl: Girl | null): string | null {
  if (!girl) return null;
  return girl.portrait_url || girl.image_url || girl.avatar_url || null;
}

export function girlAvatarUrl(girl: Girl | null): string | null {
  if (!girl) return null;
  return girl.avatar_url || girl.portrait_url || girl.image_url || null;
}
