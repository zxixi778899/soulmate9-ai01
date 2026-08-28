/**
 * ControlNet Multi-Unit System — Type Definitions
 *
 * Architecture: Three independent ControlNet units for pose/outfit/scene control
 * from preset library reference images.
 */

const generateUUID = () => crypto.randomUUID();

export type ControlNetType = 'openpose' | 'depth' | 'canny' | 'segment' | 'ipadapter';
export type PresetCategory = 'pose' | 'outfit' | 'scene';

/**
 * Single ControlNet unit configuration
 */
export interface ControlNetUnit {
  /** Unique identifier */
  id: string;
  /** ControlNet type */
  type: ControlNetType;
  /** Associated preset category */
  preset_category?: PresetCategory;
  /** Reference image URL (processor input) */
  image_url?: string;
  /** ControlNet weight (0.0~1.0) */
  weight: number;
  /** Guidance start step (0~1.0) */
  guidance_start: number;
  /** Guidance end step (0~1.0) */
  guidance_end: number;
  /** Resolution scaling strategy */
  resolution: 'auto' | 'original' | 'match_prompt';
  /** NSFW level limit (1~5) */
  nsfw_limit?: number;
  /** Dynamic parameter overrides */
  overrides?: {
    strength?: number;
    steps?: number;
  };
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Multi-unit ControlNet configuration组合
 */
export interface ControlNetMultiUnitConfig {
  pose_unit?: ControlNetUnit;      // OpenPose for pose control
  outfit_unit?: ControlNetUnit;    // Canny/Segment for outfit try-on
  scene_unit?: ControlNetUnit;     // Depth/Canny for scene depth
  identity_unit?: ControlNetUnit;  // IP-Adapter for face consistency
}

/**
 * ComfyUI workflow node mapping for ControlNet units
 */
export interface ComfyNetUnit extends ControlNetUnit {
  /** PreProcessor node input name */
  processor_preprocessor?: string;
  /** Conditioning output port name */
  model_conditioning?: string;
  /** PreProcessor strength (0~1) */
  preprocessor_strength?: number;
  /** ComfyUI node IDs for this unit */
  node_ids?: {
    preprocessor: string;
    controlnet_loader: string;
    controlnet_apply: string;
    clip_encode?: string;
  };
}

/**
 * Create OpenPose ControlNet unit from preset
 */
export function createOpenPoseUnit(config: {
  image_url: string;
  weight?: number;
  guidance_start?: number;
  guidance_end?: number;
  preset_category?: PresetCategory;
}): ControlNetUnit {
  return {
    id: generateUUID(),
    type: 'openpose',
    preset_category: preset_category || 'pose',
    image_url: config.image_url,
    weight: config.weight ?? 0.72,
    guidance_start: config.guidance_start ?? 0.1,
    guidance_end: config.guidance_end ?? 0.95,
    resolution: 'auto',
    metadata: {
      skeleton_format: 'json',
      keypoints: 18,
    },
  };
}

/**
 * Create Canny ControlNet unit for outfit/scene edge control
 */
export function createCannyUnit(config: {
  image_url: string;
  weight?: number;
  guidance_start?: number;
  guidance_end?: number;
  lower_threshold?: number;
  upper_threshold?: number;
  preset_category?: PresetCategory;
  segment_key?: string; // for clothing segmentation target
}): ControlNetUnit {
  return {
    id: generateUUID(),
    type: 'canny',
    preset_category: preset_category || 'outfit',
    image_url: config.image_url,
    weight: config.weight ?? 0.82,
    guidance_start: config.guidance_start ?? 0.1,
    guidance_end: config.guidance_end ?? 0.9,
    resolution: 'original',
    overrides: {
      strength: config.lower_threshold !== undefined && config.upper_threshold !== undefined
        ? ((config.lower_threshold + config.upper_threshold) / 400)
        : undefined,
    },
    metadata: {
      edge_detection: 'cv2',
      segment_target: config.segment_key,
    },
  };
}

/**
 * Create Depth ControlNet unit for scene depth control
 */
export function createDepthUnit(config: {
  image_url: string;
  weight?: number;
  guidance_start?: number;
  guidance_end?: number;
  preset_category?: PresetCategory;
}): ControlNetUnit {
  return {
    id: generateUUID(),
    type: 'depth',
    preset_category: preset_category || 'scene',
    image_url: config.image_url,
    weight: config.weight ?? 0.65,
    guidance_start: config.guidance_start ?? 0.1,
    guidance_end: config.guidance_end ?? 0.85,
    resolution: 'auto',
    metadata: {
      depth_estimator: 'midas',
    },
  };
}

/**
 * Create IP-Adapter unit for identity locking
 */
export function createIpAdapterUnit(config: {
  image_url: string;
  weight?: number;
  clip_vision_weight?: number;
}): ControlNetUnit {
  return {
    id: generateUUID(),
    type: 'ipadapter',
    image_url: config.image_url,
    weight: config.weight ?? 0.75,
    guidance_start: 0,
    guidance_end: 1,
    resolution: 'auto',
    nsfw_limit: 5, // Always allowed for identity lock
    metadata: {
      adapter_type: 'face',
      clip_vision_weight: config.clip_vision_weight ?? 0.8,
    },
  };
}

/**
 * Validate and sanitize multi-unit config
 */
export function validateAndSanitizeUnits(
  units: Partial<ControlNetMultiUnitConfig>,
): ControlNetMultiUnitConfig {
  const validated: ControlNetMultiUnitConfig = {};
  
  if (units.pose_unit) {
    validated.pose_unit = sanitizeUnit(units.pose_unit, 'openpose');
  }
  if (units.outfit_unit) {
    validated.outfit_unit = sanitizeUnit(units.outfit_unit, ['canny', 'segment']);
  }
  if (units.scene_unit) {
    validated.scene_unit = sanitizeUnit(units.scene_unit, ['depth', 'canny']);
  }
  if (units.identity_unit) {
    validated.identity_unit = sanitizeUnit(units.identity_unit, 'ipadapter');
  }
  
  return validated;
}

function sanitizeUnit(
  unit: ControlNetUnit,
  allowedTypes: ControlNetType | ControlNetType[],
): ControlNetUnit {
  const types = Array.isArray(allowedTypes) ? allowedTypes : [allowedTypes];
  if (!types.includes(unit.type)) {
    throw new Error(`Invalid ControlNet type ${unit.type}, expected one of: ${types.join(', ')}`);
  }
  
  return {
    ...unit,
    weight: Math.max(0, Math.min(1, unit.weight)),
    guidance_start: Math.max(0, Math.min(1, unit.guidance_start)),
    guidance_end: Math.max(0, Math.min(1, unit.guidance_end)),
  };
}

/**
 * Infer ControlNet units from selected presets
 */
export function inferControlNetUnitsFromPresets(presets: {
  pose?: { openpose_json?: string; body_depth_url?: string; ip_adapter_face?: string };
  outfit?: { canny_edge_url?: string; person_mask_url?: string; ip_adapter_face?: string };
  scene?: { body_depth_url?: string; canny_edge_url?: string; bg_mask_url?: string };
}): ControlNetMultiUnitConfig {
  const inferred: ControlNetMultiUnitConfig = {};
  
  // Pose unit (priority: openpose > depth)
  if (presets.pose?.openpose_json) {
    inferred.pose_unit = createOpenPoseUnit({
      image_url: presets.pose.openpose_json,
    });
  } else if (presets.pose?.body_depth_url) {
    inferred.pose_unit = createDepthUnit({
      image_url: presets.pose.body_depth_url,
      preset_category: 'pose',
    });
  }
  
  // Outfit unit (try-on mode with Canny/Segment)
  if (presets.outfit?.canny_edge_url) {
    inferred.outfit_unit = createCannyUnit({
      image_url: presets.outfit.canny_edge_url,
      preset_category: 'outfit',
      segment_key: 'person', // prioritize clothing segmentation
    });
  } else if (presets.outfit?.person_mask_url) {
    inferred.outfit_unit = {
      id: generateUUID(),
      type: 'segment',
      preset_category: 'outfit',
      image_url: presets.outfit.person_mask_url,
      weight: 0.75,
      guidance_start: 0.1,
      guidance_end: 0.85,
      resolution: 'original',
      metadata: {
        segment_target: 'clothing',
      },
    };
  }
  
  // Scene unit (depth or Canny)
  if (presets.scene?.body_depth_url) {
    inferred.scene_unit = createDepthUnit({
      image_url: presets.scene.body_depth_url,
    });
  } else if (presets.scene?.canny_edge_url) {
    inferred.scene_unit = createCannyUnit({
      image_url: presets.scene.canny_edge_url,
      preset_category: 'scene',
    });
  }
  
  // Identity unit (always prioritized if available)
  const identityImage = 
    presets.pose?.ip_adapter_face ||
    presets.outfit?.ip_adapter_face;
  
  if (identityImage) {
    inferred.identity_unit = createIpAdapterUnit({
      image_url: identityImage,
    });
  }
  
  return inferred;
}

/**
 * Legacy single-unit format (for backwards compatibility)
 */
export interface LegacyControlNetSingleUnit {
  type: 'openpose' | 'depth' | 'canny';
  image: string;
  strength: number;
}

/**
 * Convert legacy single-unit to multi-unit format
 */
export function convertLegacyToMultiUnit(legacy: LegacyControlNetSingleUnit): ControlNetMultiUnitConfig {
  switch (legacy.type) {
    case 'openpose':
      return {
        pose_unit: createOpenPoseUnit({ image_url: legacy.image }),
      };
    case 'depth':
      return {
        scene_unit: createDepthUnit({ image_url: legacy.image }),
      };
    case 'canny':
      return {
        outfit_unit: createCannyUnit({ image_url: legacy.image }),
      };
    default:
      throw new Error(`Unknown legacy ControlNet type: ${legacy.type}`);
  }
}

/**
 * Generate ComfyUI workflow nodes for multi-unit ControlNet
 */
export interface ComfyWorkflowContext {
  base_workflow: Record<string, unknown>;
  units: ComfyNetUnit[];
  connections: Record<string, string[]>;
}

export function buildComfyControlNetWorkflow(context: ComfyWorkflowContext): Record<string, unknown> {
  const { base_workflow, units, connections } = context;
  
  // This function will be implemented in Phase 2
  // For now, return the base workflow unchanged
  return base_workflow as Record<string, unknown>;
}
