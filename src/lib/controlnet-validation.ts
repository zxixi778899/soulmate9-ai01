/**
 * Runtime validation schemas for ControlNet Multi-Unit System
 * 
 * Using Zod for type-safe validation of API requests and data integrity
 */

import { z } from 'zod';
import type { ControlNetMultiUnitConfig, ComfyNetUnit } from '@/lib/controlnet-units';

// ============================================
// Constants for validation
// ============================================

const CONTROLNET_TYPES = ['openpose', 'depth', 'canny', 'segment', 'ipadapter'] as const;
const RESOLUTION_STRATEGIES = ['auto', 'original', 'match_prompt'] as const;
const PRESET_CATEGORIES = ['pose', 'outfit', 'scene'] as const;

// ============================================
// Schema Definitions
// ============================================

/**
 * ControlNet unit base schema (shared across all types)
 */
export const controlnetUnitBaseSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(CONTROLNET_TYPES),
  preset_category: z.enum(PRESET_CATEGORIES).optional(),
  
  // Reference image URLs
  image_url: z.string().url().optional(),
  
  // Weight range: 0.0 ~ 1.0
  weight: z.number().min(0).max(1),
  
  // Guidance range: 0.0 ~ 1.0
  guidance_start: z.number().min(0).max(1),
  guidance_end: z.number().min(0).max(1),
  
  resolution: z.enum(RESOLUTION_STRATEGIES),
  nsfw_limit: z.number().min(1).max(5).optional(),
  
  // Dynamic overrides
  overrides: z.object({
    strength: z.number().min(0).max(1).optional(),
    steps: z.number().positive().optional(),
  }).optional(),
  
  // Additional metadata
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * OpenPose-specific unit schema
 */
export const openPoseUnitSchema = z.object({
  ...controlnetUnitBaseSchema.shape,
  type: z.literal('openpose'),
  processor_preprocessor: z.literal('dw_openpose_full').optional(),
  metadata: z.object({
    skeleton_format: z.literal('json'),
    keypoints: z.literal(18),
  }).optional(),
});

/**
 * Canny edge detection unit schema
 */
export const cannyUnitSchema = z.object({
  ...controlnetUnitBaseSchema.shape,
  type: z.literal('canny'),
  processor_preprocessor: z.union([
    z.literal('cv2_canny'),
    z.literal('appearance_matters'),
  ]).optional(),
  metadata: z.object({
    edge_detection: z.literal('cv2'),
    segment_target: z.string().optional(),
  }).optional(),
});

/**
 * Depth estimation unit schema
 */
export const depthUnitSchema = z.object({
  ...controlnetUnitBaseSchema.shape,
  type: z.literal('depth'),
  processor_preprocessor: z.union([
    z.literal('midas_thorough'),
    z.literal('midas_lite'),
  ]).optional(),
  metadata: z.object({
    depth_estimator: z.literal('midas'),
  }).optional(),
});

/**
 * Segmentation mask unit schema
 */
export const segmentUnitSchema = z.object({
  ...controlnetUnitBaseSchema.shape,
  type: z.literal('segment'),
  processor_preprocessor: z.union([
    z.literal('sam_vit_b'),
    z.literal('iso_vaet'),
  ]).optional(),
  metadata: z.object({
    segment_target: z.enum(['person', 'clothing', 'background']),
  }).optional(),
});

/**
 * IP-Adapter face recognition unit schema
 */
export const ipAdapterUnitSchema = z.object({
  ...controlnetUnitBaseSchema.shape,
  type: z.literal('ipadapter'),
  guidance_start: z.literal(0),
  guidance_end: z.literal(1),
  metadata: z.object({
    adapter_type: z.literal('face'),
    clip_vision_weight: z.number().min(0).max(1),
  }).optional(),
});

/**
 * ComfyUI workflow node mapping schema
 */
export const comfyNetUnitSchema = z.intersection(
  controlnetUnitBaseSchema,
  z.object({
    processor_preprocessor: z.string().optional(),
    model_conditioning: z.string().optional(),
    preprocessor_strength: z.number().min(0).max(1).optional(),
    node_ids: z.object({
      preprocessor: z.string(),
      controlnet_loader: z.string(),
      controlnet_apply: z.string(),
      clip_encode: z.string().optional(),
    }).optional(),
  })
);

/**
 * Single legacy ControlNet unit (backward compatibility)
 */
export const legacyControlNetUnitSchema = z.object({
  type: z.enum(['openpose', 'depth', 'canny']),
  image: z.string().url(),
  strength: z.number().min(0).max(1),
});

/**
 * Generate request body extension schema
 */
export const generationRequestWithControlNetSchema = z.object({
  // Existing required fields (simplified for brevity)
  prompt: z.string().min(1),
  width: z.number().min(256).max(2048),
  height: z.number().min(256).max(2048),
  
  // ========== NEW: ControlNet multi-unit config ==========
  controlnet_units: z.object({
    pose_unit: z.any().optional(),
    outfit_unit: z.any().optional(),
    scene_unit: z.any().optional(),
    identity_unit: z.any().optional(),
  }).optional(),
  
  // Legacy single-unit format (for backward compatibility)
  control: legacyControlNetUnitSchema.optional(),
});

/**
 * Batch asset processing result schema
 */
export const batchProcessingResultSchema = z.object({
  preset_id: z.string(),
  status: z.enum(['success', 'failed', 'skipped']),
  assets: z.record(z.string(), z.string().url()).optional(),
  error: z.string().optional(),
});

/**
 * Preset database entry schema (with ControlNet fields)
 */
export const workbenchPresetWithControlNetSchema = z.object({
  slug: z.string().min(1),
  category: z.enum(PRESET_CATEGORIES),
  label_en: z.string().min(1),
  label_zh: z.string().min(1),
  preview_url: z.string().url().optional(),
  nsfw_level: z.number().min(1).max(5),
  tier: z.string(),
  locked: z.boolean(),
  
  // ControlNet resources
  openpose_json: z.string().url().optional(),
  body_depth_url: z.string().url().optional(),
  canny_edge_url: z.string().url().optional(),
  bg_mask_url: z.string().url().optional(),
  ip_adapter_face: z.string().url().optional(),
  person_mask_url: z.string().url().optional(),
});

// ============================================
// Type Exports from Schemas
// ============================================

export type ControlNetUnitInput = z.infer<typeof controlnetUnitBaseSchema>;
export type OpenPoseUnitInput = z.infer<typeof openPoseUnitSchema>;
export type CannyUnitInput = z.infer<typeof cannyUnitSchema>;
export type DepthUnitInput = z.infer<typeof depthUnitSchema>;
export type SegmentUnitInput = z.infer<typeof segmentUnitSchema>;
export type IpAdapterUnitInput = z.infer<typeof ipAdapterUnitSchema>;
export type ComfyNetUnitInput = z.infer<typeof comfyNetUnitSchema>;
export type GenerationRequestWithControlNet = z.infer<typeof generationRequestWithControlNetSchema>;
export type BatchProcessingResult = z.infer<typeof batchProcessingResultSchema>;
export type WorkbenchPresetWithControlNet = z.infer<typeof workbenchPresetWithControlNetSchema>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validate a ControlNet unit input based on its type
 */
export function validateControlNetUnit(input: unknown): z.ZodSafeParseResult<ControlNetUnitInput> {
  if (!input || typeof input !== 'object') {
    return { success: false, error: new z.ZodError([{ message: 'Input must be an object' }]) };
  }
  
  const typedInput = input as Record<string, unknown>;
  const unitType = typedInput.type as string;
  
  switch (unitType) {
    case 'openpose':
      return openPoseUnitSchema.safeParse(typedInput);
    case 'canny':
      return cannyUnitSchema.safeParse(typedInput);
    case 'depth':
      return depthUnitSchema.safeParse(typedInput);
    case 'segment':
      return segmentUnitSchema.safeParse(typedInput);
    case 'ipadapter':
      return ipAdapterUnitSchema.safeParse(typedInput);
    default:
      return { success: false, error: new z.ZodError([
        { message: `Unknown ControlNet type: ${unitType}`, path: ['type'] }
      ]) };
  }
}

/**
 * Validate entire multi-unit configuration
 */
export function validateControlNetMultiUnitConfig(input: unknown): z.ZodSafeParseResult<ControlNetMultiUnitConfig> {
  const result = generationRequestWithControlNetSchema.safeParse({ controlnet_units: input });
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  const units = result.data.controlnet_units;
  
  // Each unit must be valid based on its declared type
  const validatedUnits: Partial<Record<'pose_unit' | 'outfit_unit' | 'scene_unit' | 'identity_unit', unknown>> = {};
  
  if (units?.pose_unit) {
    const poseValidation = validateControlNetUnit(units.pose_unit);
    if (!poseValidation.success) return { success: false, error: poseValidation.error };
  }
  
  if (units?.outfit_unit) {
    const outfitValidation = validateControlNetUnit(units.outfit_unit);
    if (!outfitValidation.success) return { success: false, error: outfitValidation.error };
  }
  
  if (units?.scene_unit) {
    const sceneValidation = validateControlNetUnit(units.scene_unit);
    if (!sceneValidation.success) return { success: false, error: sceneValidation.error };
  }
  
  if (units?.identity_unit) {
    const identityValidation = validateControlNetUnit(units.identity_unit);
    if (!identityValidation.success) return { success: false, error: identityValidation.error };
  }
  
  return { success: true, data: units as ControlNetMultiUnitConfig };
}

/**
 * Parse and sanitize ControlNet unit input (converts strings to numbers where needed)
 */
export function parseAndSanitizeControlNetUnit(input: unknown): {
  success: boolean;
  data?: ControlNetUnitInput;
  error?: z.ZodError;
} {
  const validation = validateControlNetUnit(input);
  
  if (!validation.success) {
    return { success: false, error: validation.error };
  }
  
  const validData = validation.data as Record<string, unknown>;
  
  // Convert string weights/steps to numbers
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(validData)) {
    if (key === 'weight' || key === 'guidance_start' || key === 'guidance_end') {
      sanitized[key] = typeof value === 'string' ? parseFloat(value) : value;
    } else if (key === 'nsfw_limit' && typeof value === 'string') {
      sanitized[key] = parseInt(value, 10);
    } else {
      sanitized[key] = value;
    }
  }
  
  return { success: true, data: sanitized as ControlNetUnitInput };
}

// ============================================
// Export all schemas for reuse
// ============================================

export const ControlNetSchemas = {
  base: controlnetUnitBaseSchema,
  openPose: openPoseUnitSchema,
  canny: cannyUnitSchema,
  depth: depthUnitSchema,
  segment: segmentUnitSchema,
  ipAdapter: ipAdapterUnitSchema,
  multiUnit: generationRequestWithControlNetSchema,
  preset: workbenchPresetWithControlNetSchema,
};

export type ControlNetSchemaTypes = {
  base: typeof controlnetUnitBaseSchema;
  openPose: typeof openPoseUnitSchema;
  canny: typeof cannyUnitSchema;
  depth: typeof depthUnitSchema;
  segment: typeof segmentUnitSchema;
  ipAdapter: typeof ipAdapterUnitSchema;
  multiUnit: typeof generationRequestWithControlNetSchema;
  preset: typeof workbenchPresetWithControlNetSchema;
};
