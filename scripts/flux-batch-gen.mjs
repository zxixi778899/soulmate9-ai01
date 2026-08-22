/**
 * FLUX Batch Generator with Job Status Polling
 */

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = 'e40cgshtouocg8';

const FLUX_PRESETS = [
  {
    name: 'Realistic SFW Portrait',
    prompt: 'professional portrait photography, soft natural lighting, detailed skin texture, sharp focus on eyes, gorgeous young adult female age 25, caucasian features, oval face shape, long flowing blonde hair, brown eyes, slim figure, wearing casual elegant outfit, coherent hands',
    negativePrompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    steps: 28,
    width: 768,
    height: 1024,
    guidance: 3.5,
    checkpoint: 'flux1-dev-fp8.safetensors',
  },
  {
    name: 'Asian SFW Full-body',
    prompt: 'full body portrait, studio lighting, clean background, professional composition, gorgeous young adult female age 25, asian features, heart shaped face, short black bob hair, brown eyes, athletic build, wearing business casual outfit, sharp focus',
    negativePrompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    steps: 28,
    width: 896,
    height: 1024,
    guidance: 3.5,
    checkpoint: 'flux1-dev-fp8.safetensors',
  },
  {
    name: '2D Anime Style',
    prompt: 'anime character design, vibrant colors, cel shading, clean lines, gorgeous young adult female age 25, japanese features, round face, twin tails pink hair, blue eyes, petite figure, wearing school uniform, big expressive eyes',
    negativePrompt: 'photorealistic, 3d, blurry, low quality, ugly, text, watermark',
    steps: 24,
    width: 768,
    height: 1024,
    guidance: 3.5,
    checkpoint: 'flux1-dev-fp8.safetensors',
  },
];

async function submitJob(config) {
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;
  
  const payload = {
    input: {
      "prompt": config.prompt,
      "negative_prompt": config.negativePrompt,
      "cfg_scale": 1.0,
      "steps": config.steps,
      "width": config.width,
      "height": config.height,
      "seed": config.seed || Math.floor(Math.random() * 2147483647),
      "sd_model_checkpoint": config.checkpoint,
      "clip_skip": 2,
      "guidance": config.guidance,
    },
    id: RUNPOD_ENDPOINT_ID,
    stream: false,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.id;
}

async function checkJobStatus(jobId) {
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/jobs/${jobId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.json();
}

async function waitForJob(jobId, maxWaitMinutes = 5) {
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  
  console.log(`⏳ Waiting for job ${jobId} to complete...`);
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkJobStatus(jobId);
    
    if (status.status === 'COMPLETED') {
      console.log('✅ Job completed!');
      return status.out;
    } else if (status.err) {
      throw new Error(status.err);
    } else {
      // Wait 5 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Show progress
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      console.log(`   Progress: ${elapsed}s - Status: ${status.status}`);
    }
  }
  
  throw new Error(`Job timeout after ${maxWaitMinutes} minutes`);
}

async function generate(config) {
  try {
    console.log(`🎨 Generating "${config.name}"...`);
    console.log(`   Steps: ${config.steps}, CFG: 1.0, Guidance: ${config.guidance}`);
    console.log(`   Resolution: ${config.width}x${config.height}\n`);
    
    // Submit job
    const jobId = await submitJob(config);
    
    // Wait for completion
    const result = await waitForJob(jobId);
    
    if (result?.images && result.images.length > 0) {
      console.log(`✅ Success: ${config.name} -> ${result.images[0]}\n`);
      return { url: result.images[0] };
    } else {
      console.warn(`⚠️  Unexpected result:`, result);
      return { error: 'Unexpected result' };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed: ${errMsg}\n`);
    return { error: errMsg };
  }
}

async function main() {
  const countArg = process.argv.find(arg => arg.startsWith('--count='));
  const count = countArg ? parseInt(countArg.split('=')[1], 10) : FLUX_PRESETS.length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 FLUX Batch Generator with RunPod API');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const results = [];

  for (let i = 0; i < Math.min(count, FLUX_PRESETS.length); i++) {
    const config = FLUX_PRESETS[i];
    const result = await generate(config);
    
    results.push({
      name: config.name,
      url: result.url,
      error: result.error,
    });

    // Small delay between generations
    if (i < count - 1) {
      console.log('\n⏱️  Pausing before next generation...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
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
    fs.writeFileSync('flux-batch-results.json', JSON.stringify(results, null, 2));
    console.log('💾 Results saved to: flux-batch-results.json');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
