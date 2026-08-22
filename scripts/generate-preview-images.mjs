/**
 * Batch Generate Preview Images with Unified FLUX Style
 * Generates a set of character portraits with consistent FLUX parameters
 */

import fs from 'fs';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = process.env.RUNPOD_ENDPOINT_ID || 'e40cgshtouocg8';

// Unified FLUX workflow template
function buildFluxWorkflow(prompt, negativePrompt, width = 512, height = 640, steps = 28, guidance = 3.5, seed) {
  const flow = {
    "3": {
      "inputs": {
        "ckpt_name": "flux1-dev-fp8.safetensors",
        "clip_select": "both"
      },
      "class_type": "CheckpointLoaderSimple",
      "_meta": { "title": "Load Checkpoint" }
    },
    "4": {
      "inputs": {
        "text": prompt,
        "clip": ["3", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Positive)" }
    },
    "5": {
      "inputs": {
        "width": width,
        "height": height,
        "batch_size": 1
      },
      "class_type": "EmptyLatentImage",
      "_meta": { "title": "Empty Latent Image" }
    },
    "6": {
      "inputs": {
        "text": negativePrompt || "",
        "clip": ["3", 1]
      },
      "class_type": "CLIPTextEncode",
      "_meta": { "title": "CLIP Text Encode (Negative)" }
    },
    "8": {
      "inputs": {
        "seed": seed,
        "steps": steps,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1,
        "model": ["3", 0],
        "positive": ["4", 0],
        "negative": ["6", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler",
      "_meta": { "title": "KSampler" }
    },
    "9": {
      "inputs": {
        "vae": ["3", 2]
      },
      "class_type": "VAELoader",
      "_meta": { "title": "Load VAE" }
    },
    "10": {
      "inputs": {
        "samples": ["8", 0],
        "vae": ["9", 0]
      },
      "class_type": "VAEDecode",
      "_meta": { "title": "VAE Decode" }
    },
    "11": {
      "inputs": {
        "filename_prefix": "FLUX_Preview",
        "images": ["10", 0]
      },
      "class_type": "SaveImage",
      "_meta": { "title": "Save Image" }
    },
    "12": {
      "inputs": {
        "guidance": guidance
      },
      "class_type": "FluxGuidance",
      "_meta": { "title": "Flux Guidance" }
    }
  };

  // Inject FluxGuidance node for proper FLUX CFG handling
  if (guidance !== undefined) {
    flow["12"]["inputs"]["positive"] = ["4", 0];
    flow["4"]["inputs"]["clip"] = ["3", 1];
    flow["4"]["inputs"]["text"] = prompt;
  }

  return flow;
}

// Character preview configurations - unified FLUX style
const PREVIEW_CONFIGS = [
  {
    id: 'anime_girl_1',
    prompt: 'beautiful anime girl, long flowing hair, brown eyes, casual outfit, soft lighting, detailed face, elegant pose, high quality, artistic style',
    negativePrompt: 'low quality, blurry, distorted features, bad anatomy, extra limbs, watermark, text, signature',
    color: '#FF2D78'
  },
  {
    id: 'anime_girl_2',
    prompt: 'elegant anime woman, pink hair, blue eyes, school uniform, cherry blossom background, gentle smile, dreamy atmosphere',
    negativePrompt: 'ugly, deformed, noisy, blurry, low contrast, realism, photorealistic',
    color: '#EC4899'
  },
  {
    id: 'anime_girl_3',
    prompt: 'mysterious anime girl, black long hair, purple eyes, gothic lolita dress, moonlight, dramatic shadows, fantasy setting',
    negativePrompt: 'bright, cheerful, cartoon, simple, flat colors, low detail',
    color: '#8B5CF6'
  },
  {
    id: 'realistic_girl_1',
    prompt: 'realistic portrait of young woman, natural makeup, beige coat, city street at dusk, warm street lights, cinematic lighting, professional photography',
    negativePrompt: 'anime, cartoon, illustration, drawing, painting, sketch, CGI, 3D render',
    color: '#F59E0B'
  },
  {
    id: 'realistic_girl_2',
    prompt: 'beautiful realistic female, blonde hair, green eyes, summer dress, park scenery, natural sunlight, shallow depth of field, high resolution',
    negativePrompt: 'dark, gloomy, anime style, oversaturated, oversharpened',
    color: '#10B981'
  },
  {
    id: '3d_render_1',
    prompt: '3D rendered anime character, vibrant colors, dynamic pose, sci-fi background, neon lights, cyberpunk aesthetic, octane render, unreal engine 5',
    negativePrompt: 'photorealistic, photograph, real person, film grain, vintage',
    color: '#06B6D4'
  },
  {
    id: '3d_render_2',
    prompt: 'stylized 3D girl character, colorful outfit, fantasy forest, magical particles, soft bloom, fairy tale theme, Disney Pixar style',
    negativePrompt: 'realistic, dark, horror, gritty, photo',
    color: '#EF4444'
  },
  {
    id: 'sketch_art_1',
    prompt: 'artistic sketch style, pencil drawing, grayscale, emotional expression, watercolor accents, studio ghibli inspired, hand-drawn texture',
    negativePrompt: 'colorful, photorealistic, 3D, digital art, clean lines',
    color: '#6366F1'
  }
];

async function submitJob(config) {
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;
  
  const payload = {
    input: buildFluxWorkflow(
      config.prompt,
      config.negativePrompt,
      512,
      640,
      28,
      3.5,
      config.seed
    ),
    id: RUNPOD_ENDPOINT_ID,
    stream: false,
  };

  console.log(`📤 Submitting job for ${config.id}...`);
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`❌ Failed to submit ${config.id}:`, err);
    return null;
  }

  const result = await res.json();
  return result.id;
}

async function checkJobStatus(jobId) {
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`;
  
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
    });
    
    if (!res.ok) {
      console.error(`❌ Status check failed for ${jobId}:`, await res.text());
      return null;
    }
    
    const status = await res.json();
    const currentState = status.status;
    
    if (currentState === 'COMPLETED') {
      if (status.output && Array.isArray(status.output) && status.output.length > 0) {
        console.log(`✅ Job ${jobId} completed!`);
        console.log(`   Output:`, status.output[0]);
        return status.output[0];
      }
    } else if (currentState === 'FAILED' || currentState === 'ERROR') {
      console.error(`❌ Job ${jobId} failed!`);
      console.error('   Status:', status);
      return null;
    }
    
    attempts++;
    console.log(`⏳ Waiting for ${jobId}... (${attempts}/${maxAttempts}) Status: ${currentState}`);
  }
  
  console.error(`⏱️ Timeout for job ${jobId}`);
  return null;
}

async function generatePreview(config) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  const jobId = await submitJob({ ...config, seed });
  
  if (!jobId) {
    console.error(`⚠️ Skipping ${config.id} due to submission error`);
    return null;
  }
  
  const imageUrl = await checkJobStatus(jobId);
  return imageUrl;
}

async function main() {
  console.log('🎨 Starting Batch Preview Generation...\n');
  console.log(`📍 Endpoint: ${RUNPOD_ENDPOINT_ID}`);
  console.log(`🎯 Model: flux1-dev-fp8.safetensors`);
  console.log(`📐 Size: 512x640 (3:4 ratio)`);
  console.log(`🔄 Steps: 28 | CFG: 1 | Guidance: 3.5\n`);
  
  const results = [];
  
  for (let i = 0; i < PREVIEW_CONFIGS.length; i++) {
    const config = PREVIEW_CONFIGS[i];
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Processing ${i + 1}/${PREVIEW_CONFIGS.length}: ${config.id}`);
    console.log(`${'='.repeat(60)}\n`);
    
    const imageUrl = await generatePreview(config);
    results.push({
      id: config.id,
      prompt: config.prompt,
      color: config.color,
      url: imageUrl || 'FAILED'
    });
    
    if (imageUrl) {
      console.log(`💾 Saved: ${imageUrl}`);
    } else {
      console.warn(`⚠️ Warning: ${config.id} generation failed`);
    }
    
    // Small delay between generations
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 GENERATION SUMMARY');
  console.log(`${'='.repeat(60)}\n`);
  
  const successCount = results.filter(r => r.url !== 'FAILED').length;
  console.log(`✅ Successful: ${successCount}/${results.length}`);
  console.log(`❌ Failed: ${results.length - successCount}/${results.length}\n`);
  
  console.log('Generated Previews:\n');
  results.forEach((result, idx) => {
    console.log(`${idx + 1}. ${result.id.padEnd(20)} [${result.color}]`);
    console.log(`   Prompt: ${result.prompt.substring(0, 60)}...`);
    console.log(`   URL: ${result.url}\n`);
  });
  
  // Save results to file
  fs.writeFileSync('preview-generation-results.json', JSON.stringify(results, null, 2));
  console.log('\n💾 Results saved to preview-generation-results.json');
}

main().catch(console.error);
