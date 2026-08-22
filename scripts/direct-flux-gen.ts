/**
 * Direct FLUX Image Generator via RunPod API
 * No login required - uses environment variables directly
 * 
 * Requirements:
 * - .env.local file with RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID
 * - Node.js 18+
 * 
 * Usage: pnpm tsx scripts/direct-flux-gen.ts --count=3
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// Load environment
const envContent = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8');
const parseEnv = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};
  content.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) result[match[1].trim()] = match[2]?.trim() || '';
  });
  return result;
};

const env = parseEnv(envContent);

const RUNPOD_API_KEY = env.RUNPOD_API_KEY;
const RUNPOD_ENDPOINT_ID = env.RUNPOD_ENDPOINT_ID;

if (!RUNPOD_API_KEY || !RUNPOD_ENDPOINT_ID) {
  console.error('❌ Missing RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID in .env.local');
  process.exit(1);
}

const RUNPOD_BASE_URL = 'https://api.runpod.ai/v2';

interface GenerationConfig {
  name: string;
  prompt: string;
  negativePrompt: string;
  steps?: number;
  cfg?: number;
  guidance?: number;
  width: number;
  height: number;
  seed?: number;
  nsfw?: boolean;
}

async function generateWithRunPod(config: GenerationConfig): Promise<{ url?: string; error?: string }> {
  const url = `${RUNPOD_BASE_URL}/${RUNPOD_ENDPOINT_ID}/run`;
  
  const payload = {
    input: {
      "prompt": config.prompt,
      "negative_prompt": config.negativePrompt,
      "cfg_scale": config.cfg || 1.0,
      "steps": config.steps || (config.nsfw ? 30 : 28),
      "width": config.width,
      "height": config.height,
      "seed": config.seed || Math.floor(Math.random() * 2147483647),
      "sd_model_checkpoint": config.nsfw 
        ? "fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors" 
        : "flux1-dev-fp8.safetensors",
      "clip_skip": 2,
      // FluxGuidance is special for FLUX models
      "guidance": config.guidance || (config.nsfw ? 4.0 : 3.5),
    },
    id: RUNPOD_ENDPOINT_ID,
    stream: false,
  };

  try {
    console.log(`🎨 Generating "${config.name}"...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    
    if (result.out?.images && result.out.images.length > 0) {
      const imageUrl = result.out.images[0];
      console.log(`✅ Success: ${config.name} -> ${imageUrl}\n`);
      return { url: imageUrl };
    } else if (result.err) {
      console.warn(`⚠️  Error: ${result.err}\n`);
      return { error: result.err };
    } else {
      console.warn(`⚠️  Unexpected response:`, result);
      return { error: 'Unexpected response' };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${errMsg}\n`);
    return { error: errMsg };
  }
}

// Unified FLUX generation presets
const FLUX_PRESETS: GenerationConfig[] = [
  {
    name: 'Realistic SFW Portrait',
    prompt: 'professional portrait photography, soft natural lighting, detailed skin texture, sharp focus on eyes, gorgeous young adult female age 25, caucasian features, oval face shape, long flowing blonde hair, brown eyes, slim figure, wearing casual elegant outfit, clear eyes, complete head in frame, relaxed shoulders, natural asymmetrical posture',
    negativePrompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    width: 768,
    height: 1024,
    steps: 28,
    cfg: 1.0,
    guidance: 3.5,
    nsfw: false,
  },
  {
    name: 'Asian SFW Full-body',
    prompt: 'full body portrait, studio lighting, clean background, professional composition, gorgeous young adult female age 25, asian features, heart shaped face, short black bob hair, brown eyes, athletic build, wearing business casual outfit, coherent hands, sharp focus',
    negativePrompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    width: 896,
    height: 1024,
    steps: 28,
    cfg: 1.0,
    guidance: 3.5,
    nsfw: false,
  },
  {
    name: '2D Anime Style',
    prompt: 'anime character design, vibrant colors, cel shading, clean lines, gorgeous young adult female age 25, japanese features, round face, twin tails pink hair, blue eyes, petite figure, wearing school uniform, big expressive eyes, dynamic pose',
    negativePrompt: 'photorealistic, 3d, blurry, low quality, ugly, text, watermark',
    width: 768,
    height: 1024,
    steps: 24,
    cfg: 1.0,
    guidance: 3.5,
    nsfw: false,
  },
  {
    name: '3D Render Style',
    prompt: '3D rendered character, unreal engine style, PBR materials, dynamic pose, gorgeous young adult female age 25, mixed ethnicity, diamond face shape, braided purple hair, green eyes, curvy figure, wearing fantasy armor, volumetric lighting, ray tracing',
    negativePrompt: '2d, anime, flat, blurry, low quality, ugly, text, watermark',
    width: 896,
    height: 1024,
    steps: 30,
    cfg: 1.0,
    guidance: 3.5,
    nsfw: false,
  },
  {
    name: 'Cinematic Realistic',
    prompt: 'cinematic portrait photography, golden hour lighting, dramatic shadows, gorgeous young adult female age 25, mixed ethnicity, oval face, long wavy dark brown hair, hazel eyes, slim athletic build, wearing evening gown, film grain, color graded',
    negativePrompt: 'cartoon, 3d, anime, blurry, low quality, distorted, ugly, text, watermark',
    width: 768,
    height: 1024,
    steps: 28,
    cfg: 1.0,
    guidance: 3.5,
    nsfw: false,
  },
];

async function main() {
  const countArg = process.argv.find(arg => arg.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : FLUX_PRESETS.length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Direct FLUX Batch Generator via RunPod');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Configuration:`);
  console.log(`   Endpoint: ${RUNPOD_ENDPOINT_ID}`);
  console.log(`   Total generations: ${Math.min(count, FLUX_PRESETS.length)}\n`);

  const results: Array<{ name: string; url?: string; error?: string }> = [];

  for (let i = 0; i < Math.min(count, FLUX_PRESETS.length); i++) {
    const config = FLUX_PRESETS[i];
    const result = await generateWithRunPod(config);
    
    results.push({
      name: config.name,
      url: result.url,
      error: result.error,
    });

    // Small delay between requests to avoid rate limiting
    if (i < count - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Generation Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const successCount = results.filter(r => r.url).length;
  const errorCount = results.filter(r => r.error).length;
  
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📝 Total: ${results.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Print results
  if (successCount > 0) {
    console.log('📷 Generated Images:');
    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.name}`);
      console.log(`   ${r.url || '❌ ' + r.error}\n`);
    });

    // Save to JSON
    const fs = await import('fs');
    fs.writeFileSync('direct-flux-results.json', JSON.stringify(results, null, 2));
    console.log('💾 Results saved to: direct-flux-results.json');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
