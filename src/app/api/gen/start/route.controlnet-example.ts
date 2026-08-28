/**
 * API Route Example: Integrating ControlNet Multi-Unit into /api/gen/start
 * 
 * 此文件展示如何将 ControlNet 多单元配置集成到现有的生成请求中
 * 需要修改 src/app/api/gen/start/route.ts 和 src/app/api/chat/generate-image/route.ts
 */

import { type GenerationRequest } from '@/lib/types/extension';
import { inferControlNetUnitsFromRequest } from '@/lib/controlnet-units';
import { buildMultiControlnetWorkflow } from '@/lib/comfy-workflow-builder';

/**
 * Request Body Extension - Add controlnet_units support
 */
interface ExtendedGenerationRequestBody extends GenerationRequest {
  /** ControlNet multi-unit configuration (optional) */
  controlnet_units?: {
    pose_unit?: unknown;
    outfit_unit?: unknown;
    scene_unit?: unknown;
    identity_unit?: unknown;
  };
  
  /** Legacy single-unit format for backwards compatibility */
  control?: {
    type: 'openpose' | 'depth' | 'canny';
    image: string;
    strength: number;
  };
}

/**
 * 1. Extract ControlNet configuration from request body
 */
function extractControlNetConfig(
  body: ExtendedGenerationRequestBody,
  presets: {
    pose?: WorkbenchPreset;
    outfit?: OutfitOption;
    scene?: WorkbenchPreset;
  }
): ControlNetMultiUnitConfig | null {
  // Try new multi-unit format first
  if (body.controlnet_units) {
    return validateAndSanitizeUnits(body.controlnet_units);
  }
  
  // Fallback to legacy single-unit
  if (body.control) {
    const legacy = createLegacyControlNetUnit(body.control.type, body.control.image, body.control.strength);
    return legacy ? { pose_unit: legacy } : null;
  }
  
  // Auto-infer from selected presets
  const inferred = inferControlNetUnitsFromRequest(body, presets);
  return Object.keys(inferred).length > 0 ? inferred : null;
}

/**
 * 2. Build ComfyUI workflow with multiple ControlNet units
 */
async function buildControlnetEnhancedWorkflow(
  baseWorkflow: Record<string, unknown>,
  controlnetConfig: ControlNetMultiUnitConfig,
  generationParams: {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    seed: number;
  }
): Promise<Record<string, unknown>> {
  const builder = new ControlNetWorkflowBuilder(baseWorkflow);
  
  // Add Pose Unit (OpenPose)
  if (controlnetConfig.pose_unit && controlnetConfig.pose_unit.image_url) {
    const poseUnit = createOpenPoseUnit({
      image_url: controlnetConfig.pose_unit.image_url,
      weight: controlnetConfig.pose_unit.weight,
      guidance_start: controlnetConfig.pose_unit.guidance_start,
      guidance_end: controlnetConfig.pose_unit.guidance_end,
    });
    builder.addUnit(poseUnit);
  }
  
  // Add Outfit Unit (Canny or Segmentation)
  if (controlnetConfig.outfit_unit && controlnetConfig.outfit_unit.image_url) {
    if (controlnetConfig.outfit_unit.type === 'segment') {
      const outfitUnit = createSegmentUnit({
        image_url: controlnetConfig.outfit_unit.image_url,
        weight: controlnetConfig.outfit_unit.weight,
        target_class: ['clothing'],
      });
      builder.addUnit(outfitUnit);
    } else {
      const outfitUnit = createCannyUnit({
        image_url: controlnetConfig.outfit_unit.image_url,
        weight: controlnetConfig.outfit_unit.weight,
      });
      builder.addUnit(outfitUnit);
    }
  }
  
  // Add Scene Unit (Depth or Canny)
  if (controlnetConfig.scene_unit && controlnetConfig.scene_unit.image_url) {
    if (controlnetConfig.scene_unit.type === 'depth') {
      const sceneUnit = createDepthUnit({
        image_url: controlnetConfig.scene_unit.image_url,
        weight: controlnetConfig.scene_unit.weight,
      });
      builder.addUnit(sceneUnit);
    } else {
      const sceneUnit = createCannyUnit({
        image_url: controlnetConfig.scene_unit.image_url,
        weight: controlnetConfig.scene_unit.weight,
      });
      builder.addUnit(sceneUnit);
    }
  }
  
  // Add Identity Unit (IP-Adapter)
  if (controlnetConfig.identity_unit && controlnetConfig.identity_unit.image_url) {
    const identityUnit = createIpAdapterUnit({
      image_url: controlnetConfig.identity_unit.image_url,
      weight: controlnetConfig.identity_unit.weight,
    });
    builder.addUnit(identityUnit);
  }
  
  // Build final workflow
  return builder.build();
}

/**
 * 3. Integration example in POST handler
 */
export async function POST(request: NextRequest) {
  // ... existing auth & validation code ...
  
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  
  // ========== NEW: Extract ControlNet configuration ==========
  const presets = await loadSelectedPresets(body);
  const controlnetConfig = extractControlNetConfig(body as ExtendedGenerationRequestBody, presets);
  
  if (controlnetConfig) {
    logger.info('[gen/start] ControlNet multi-unit enabled', {
      units: Object.keys(controlnetConfig).join(', '),
      hasIdentity: !!controlnetConfig.identity_unit,
    });
    
    // ========== Modify workflow generation ==========
    const baseWorkflow = await loadBaseWorkflow('flux-text2img.json');
    const enhancedWorkflow = await buildControlnetEnhancedWorkflow(
      baseWorkflow,
      controlnetConfig,
      {
        width: body.width || 768,
        height: body.height || 1024,
        steps: body.steps || 28,
        cfg: body.cfg || 7.0,
        seed: body.seed || Math.floor(Math.random() * 2 ** 32),
      }
    );
    
    // Send enhanced workflow to ComfyUI worker
    body.comfy_workflow = enhancedWorkflow;
  }
  
  // ... rest of generation logic ...
  return generateImage(body);
}

/**
 * Load selected presets from database
 */
async function loadSelectedPresets(body: any) {
  const client = getSupabaseClient();
  const presets: Record<string, WorkbenchPreset | OutfitOption | undefined> = {};
  
  if (body.preset_slug) {
    const category = body.preset_category as 'pose' | 'outfit' | 'scene';
    const { data } = await client
      .from('gen_presets')
      .select('*')
      .eq('slug', body.preset_slug)
      .eq('category', category)
      .single();
    
    if (data) {
      presets[`${category}_${body.preset_slug}`] = data as WorkbenchPreset;
    }
  }
  
  return presets;
}

/**
 * Helper: Create legacy single-unit format
 */
function createLegacyControlNetUnit(
  type: string,
  image: string,
  strength: number
): ControlNetUnit | null {
  switch (type.toLowerCase()) {
    case 'openpose':
      return createOpenPoseUnit({ image_url: image, weight: strength });
    case 'depth':
      return createDepthUnit({ image_url: image, weight: strength });
    case 'canny':
      return createCannyUnit({ image_url: image, weight: strength });
    default:
      return null;
  }
}
