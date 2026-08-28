/**
 * POST /api/admin/controlnet-assets/batch-upload
 * 
 * Admin-only endpoint for batch uploading ControlNet resources.
 * Processes preset images and generates ControlNet assets (OpenPose, Canny, Depth, etc.)
 * using ComfyUI preprocessing nodes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/require-admin';
import { authedFetch } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BatchUploadRequest {
  preset_ids: string[];          // Array of preset UUIDs to process
  asset_types: ('openpose' | 'canny' | 'depth' | 'segmentation' | 'ip_adapter')[];
}

interface ProcessResult {
  preset_id: string;
  status: 'success' | 'failed' | 'skipped';
  assets?: Record<string, string>; // map of asset_type -> URL
  error?: string;
}

export async function POST(request: NextRequest) {
  const { user, client, error: authError } = await getAuthUser(request);
  
  if (!user || !client) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }
  
  // ========== Admin Check ==========
  const adminCheck = await requireAdmin(request, 'admin');
  if (adminCheck.error) {
    logger.warn('[controlnet-batch] Non-admin attempted upload', { userId: user.id });
    return adminCheck.error;
  }
  
  // Get supabase client from admin check result
  const supabase = adminCheck.supabase || client;
  
  // ========== Parse Request Body ==========
  let body: BatchUploadRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  
  const { preset_ids, asset_types } = body;
  
  if (!Array.isArray(preset_ids) || preset_ids.length === 0) {
    return NextResponse.json({ error: 'preset_ids array required' }, { status: 400 });
  }
  
  if (!Array.isArray(asset_types) || asset_types.length === 0) {
    return NextResponse.json({ error: 'asset_types array required' }, { status: 400 });
  }
  
  // ========== Validate Asset Types ==========
  const validTypes = ['openpose', 'canny', 'depth', 'segmentation', 'ip_adapter'];
  const selectedTypes = asset_types.filter(t => validTypes.includes(t));
  if (selectedTypes.length !== asset_types.length) {
    return NextResponse.json({ 
      error: `Invalid asset types. Must be one of: ${validTypes.join(', ')}` 
    }, { status: 400 });
  }
  
  // ========== Fetch Preset Details ==========
  const presetsQuery = await supabase
    .from('gen_presets')
    .select('*')
    .in('id', preset_ids);
    
  if (presetsQuery.error) {
    logger.error('[controlnet-batch] Failed to fetch presets', { error: presetsQuery.error });
    return NextResponse.json({ error: 'Failed to fetch presets' }, { status: 500 });
  }
  
  const presets = presetsQuery.data as any[];
  if (presets.length === 0) {
    return NextResponse.json({ error: 'No valid presets found' }, { status: 404 });
  }
  
  // ========== Process Each Preset ==========
  const results: ProcessResult[] = [];
  
  for (const preset of presets) {
    const result: ProcessResult = {
      preset_id: preset.id,
      status: 'skipped',
    };
    
    try {
      // Skip if already has all requested assets
      const existingAssets = await checkExistingAssets(supabase, preset.id, selectedTypes);
      const newTypes = selectedTypes.filter(t => !existingAssets[t]);
      
      if (newTypes.length === 0) {
        result.status = 'skipped';
        result.error = 'All assets already exist';
        results.push(result);
        continue;
      }
      
      // Generate ControlNet assets using ComfyUI
      const generatedAssets = await generateControlNetAssets(
        preset,
        newTypes,
        supabase,
        user.id
      );
      
      if (generatedAssets.success) {
        result.status = 'success';
        result.assets = generatedAssets.assets;
        
        // Update gen_presets table with new URLs
        await updatePresetAssets(supabase, preset.id, generatedAssets.assets!);
        
        // Store metadata in controlnet_assets table
        await storeAssetMetadata(supabase, preset.id, generatedAssets.assets!);
      } else {
        result.status = 'failed';
        result.error = generatedAssets.error;
      }
    } catch (error) {
      logger.error('[controlnet-batch] Error processing preset', { 
        preset_id: preset.id, 
        error: String(error) 
      });
      result.status = 'failed';
      result.error = String(error);
    }
    
    results.push(result);
  }
  
  // ========== Return Results ==========
  const summary = {
    total: presets.length,
    success: results.filter(r => r.status === 'success').length,
    failed: results.filter(r => r.status === 'failed').length,
    skipped: results.filter(r => r.status === 'skipped').length,
  };
  
  logger.info('[controlnet-batch] Upload complete', { summary, userId: user.id });
  
  return NextResponse.json({ 
    success: true, 
    results,
    summary,
  });
}

// ========== Helper Functions ==========

async function checkExistingAssets(
  supabase: any,
  preset_id: string,
  asset_types: string[]
): Promise<Record<string, boolean>> {
  const existing: Record<string, boolean> = {};
  
  for (const assetType of asset_types) {
    const columnMap: Record<string, string> = {
      'openpose': 'openpose_json',
      'canny': 'canny_edge_url',
      'depth': 'body_depth_url',
      'segmentation': 'bg_mask_url',
      'ip_adapter': 'ip_adapter_face',
    };
    
    const columnName = columnMap[assetType];
    if (!columnName) continue;
    
    const result = await supabase
      .from('gen_presets')
      .select(columnName)
      .eq('id', preset_id)
      .single();
    
    existing[assetType] = Boolean(result.data?.[columnName]);
  }
  
  return existing;
}

async function generateControlNetAssets(
  preset: any,
  asset_types: string[],
  supabase: any,
  adminUserId: string
): Promise<{ success: boolean; assets?: Record<string, string>; error?: string }> {
  try {
    const sourceImage = preset.preview_url;
    if (!sourceImage) {
      return { success: false, error: 'No preview URL available' };
    }
    
    const assets: Record<string, string> = {};
    
    // Create ComfyUI workflow call
    // Note: This would integrate with your actual ComfyUI endpoint
    const comfyEndpoint = process.env.UNIFIED_COMFY_ENDPOINT;
    if (!comfyEndpoint) {
      return { success: false, error: 'ComfyUI endpoint not configured' };
    }
    
    for (const assetType of asset_types) {
      try {
        const workflow = buildComfyWorkflow(assetType, sourceImage);
        
        const response = await fetch(comfyEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workflow),
        });
        
        if (!response.ok) {
          throw new Error(`ComfyUI error: ${response.status}`);
        }
        
        const result = await response.json();
        const assetUrl = result.image_url || result.output_urls?.[0];
        
        if (!assetUrl) {
          throw new Error('No output URL from ComfyUI');
        }
        
        assets[assetType] = assetUrl;
      } catch (error) {
        logger.warn('[controlnet-generate] Failed to generate asset', { 
          preset_id: preset.id,
          asset_type: assetType,
          error: String(error)
        });
        // Continue with other asset types even if one fails
      }
    }
    
    return { success: true, assets };
  } catch (error) {
    logger.error('[controlnet-generate] Critical error', { error: String(error) });
    return { success: false, error: String(error) };
  }
}

function buildComfyWorkflow(assetType: string, sourceImage: string): Record<string, unknown> {
  // Simplified workflow builder - replace with actual ComfyUI workflows
  const base = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: `controlnet_${assetType}_`,
    },
  };
  
  switch (assetType) {
    case 'openpose':
      return {
        ...base,
        inputs: {
          ...base.inputs,
          pose_skeleton: `dw_openpose_full(${sourceImage})`,
        },
      };
      
    case 'canny':
      return {
        ...base,
        inputs: {
          ...base.inputs,
          edge_detection: `cv2_canny(${sourceImage}, low_thresh=100, high_thresh=200)`,
        },
      };
      
    case 'depth':
      return {
        ...base,
        inputs: {
          ...base.inputs,
          depth_map: `midas_thorough(${sourceImage})`,
        },
      };
      
    case 'segmentation':
      return {
        ...base,
        inputs: {
          ...base.inputs,
          segmentation: `sam_vit_b(${sourceImage}, target='background')`,
        },
      };
      
    case 'ip_adapter':
      return {
        ...base,
        inputs: {
          ...base.inputs,
          face_crop: `face_detection(${sourceImage})`,
          adapter: 'ipadapter_face_plus',
        },
      };
      
    default:
      throw new Error(`Unknown asset type: ${assetType}`);
  }
}

async function updatePresetAssets(
  supabase: any,
  preset_id: string,
  assets: Record<string, string>
): Promise<void> {
  const columnMap: Record<string, string> = {
    'openpose': 'openpose_json',
    'canny': 'canny_edge_url',
    'depth': 'body_depth_url',
    'segmentation': 'bg_mask_url',
    'ip_adapter': 'ip_adapter_face',
  };
  
  const updates: Record<string, string> = {};
  for (const [assetType, url] of Object.entries(assets)) {
    const columnName = columnMap[assetType];
    if (columnName) {
      updates[columnName] = url;
    }
  }
  
  if (Object.keys(updates).length > 0) {
    await client
      .from('gen_presets')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', preset_id);
  }
}

async function storeAssetMetadata(
  supabase: any,
  preset_id: string,
  assets: Record<string, string>
): Promise<void> {
  for (const [assetType, url] of Object.entries(assets)) {
    await supabase
      .from('controlnet_assets')
      .insert({
        preset_id,
        asset_type: assetType,
        storage_key: url.split('/').pop() || '',
        file_size_bytes: 0, // Would be populated after upload
        processor_version: 'v1.0',
        source_image_url: null, // Should be set to preset.preview_url
        created_at: new Date().toISOString(),
      });
  }
}

const logger = {
  info: (msg: string, data?: any) => console.log(`[${msg}]`, data),
  warn: (msg: string, data?: any) => console.warn(`[${msg}]`, data),
  error: (msg: string, data?: any) => console.error(`[${msg}]`, data),
};
