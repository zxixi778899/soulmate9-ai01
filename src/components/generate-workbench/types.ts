/**
 * Shared types for the Generate workbench (ourdream-style console).
 */

export interface Girl {
  id: string;
  name: string;
  portrait_url: string | null;
  avatar_url: string | null;
  image_url: string | null;
  /** Optional — present when /api/girlfriends returns full rows (select *). */
  gender?: string | null;
  /** realistic | anime | 3d — powers the 2D/anime filter tab. */
  appearance_style?: string | null;
}

/** Companion picker category tabs (all / male / female / trans / anime). */
export type CompanionCategory = 'all' | 'male' | 'female' | 'trans' | 'anime';

export function girlMatchesCategory(girl: Girl, category: CompanionCategory): boolean {
  const gender = String(girl.gender || '').toLowerCase();
  switch (category) {
    case 'all':
      return true;
    case 'male':
      return gender === 'male';
    case 'female':
      return gender === 'female' || gender === '';
    case 'trans':
      return gender === 'transgender' || gender === 'trans';
    case 'anime':
      return String(girl.appearance_style || '').toLowerCase() === 'anime';
    default:
      return true;
  }
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
  
  // ========== ControlNet Multi-Unit Resources ==========
  /** OpenPose skeleton JSON file URL (pose only) */
  openpose_json?: string;
  /** Body depth map PNG URL (pose/outfit) - renamed from depth_url for clarity */
  body_depth_url?: string;
  /** Canny edge map PNG URL (outfit/scene) */
  canny_edge_url?: string;
  /** Background segmentation mask PNG (scene background isolation) */
  bg_mask_url?: string;
  /** IP-Adapter face reference URL (all categories for identity lock) */
  ip_adapter_face?: string;
  /** Human segmentation mask PNG (outfit try-on) */
  person_mask_url?: string;
}

export interface OutfitOption {
  id: string;
  name: string;
  tier: string;
  category: string;
  wear_prompt: string;
  emoji?: string;
  preview_url?: string | null;
  
  // ========== ControlNet Multi-Unit Resources ==========
  /** Canny edge map for clothing outline preservation */
  canny_edge_url?: string;
  /** Human segmentation mask for try-on occlusion handling */
  person_mask_url?: string;
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
  
  // ========== ControlNet resources for custom presets ==========
  openpose_json?: string;
  body_depth_url?: string;
  canny_edge_url?: string;
  ip_adapter_face?: string;
  person_mask_url?: string;
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
