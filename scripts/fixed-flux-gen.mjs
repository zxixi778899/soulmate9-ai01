// Fixed RunPod generator with correct API endpoints

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = 'e40cgshtouocg8';

async function submitJob(config) {
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;
  
  const payload = {
    input: config,
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
    throw new Error(`Submit HTTP ${response.status}`);
  }

  const result = await response.json();
  return result.id;
}

async function checkJobStatus(jobId) {
  // CORRECT endpoint: /status/:jobId (not /jobs/:jobId)
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Status HTTP ${response.status}`);
  }

  return await response.json();
}

async function waitForJob(jobId, maxWaitMinutes = 5) {
  console.log(`⏳ Waiting for job ${jobId} to complete...`);
  
  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  
  while (Date.now() - startTime < maxWaitMs) {
    const status = await checkJobStatus(jobId);
    
    if (status.status === 'COMPLETED') {
      console.log('✅ Job completed!');
      return status.output;
    } else if (status.error) {
      throw new Error(status.error);
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

const FLUX_PRESETS = [
  {
    name: 'Realistic SFW Portrait',
    prompt: 'professional portrait photography, soft natural lighting, detailed skin texture, sharp focus on eyes, gorgeous young adult female age 25, caucasian features, oval face shape, long flowing blonde hair, brown eyes, slim figure, wearing casual elegant outfit, coherent hands',
    negative_prompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    steps: 28,
    width: 768,
    height: 1024,
    seed: Math.floor(Math.random() * 2147483647),
    guidance: 3.5,
  },
  {
    name: 'Asian SFW Full-body',
    prompt: 'full body portrait, studio lighting, clean background, professional composition, gorgeous young adult female age 25, asian features, heart shaped face, short black bob hair, brown eyes, athletic build, wearing business casual outfit, sharp focus',
    negative_prompt: 'blurry, low quality, distorted face, bad anatomy, extra limbs, ugly, text, watermark',
    steps: 28,
    width: 896,
    height: 1024,
    seed: Math.floor(Math.random() * 2147483647),
    guidance: 3.5,
  },
  {
    name: '2D Anime Style',
    prompt: 'anime character design, vibrant colors, cel shading, clean lines, gorgeous young adult female age 25, japanese features, round face, twin tails pink hair, blue eyes, petite figure, wearing school uniform, big expressive eyes',
    negative_prompt: 'photorealistic, 3d, blurry, low quality, ugly, text, watermark',
    steps: 24,
    width: 768,
    height: 1024,
    seed: Math.floor(Math.random() * 2147483647),
    guidance: 3.5,
  },
];

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 FLUX Batch Generator (Fixed RunPod API)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  const count = 2;
  
  for (let i = 0; i < Math.min(count, FLUX_PRESETS.length); i++) {
    const config = FLUX_PRESETS[i];
    
    console.log(`🎨 Generating "${config.name}"...`);
    console.log(`   Steps: ${config.steps}, CFG: 1.0, Guidance: ${config.guidance}`);
    console.log(`   Resolution: ${config.width}x${config.height}\n`);
    
    try {
      // Submit job
      const jobId = await submitJob({
        "prompt": config.prompt,
        "negative_prompt": config.negative_prompt,
        "cfg_scale": 1.0,
        "steps": config.steps,
        "width": config.width,
        "height": config.height,
        "seed": config.seed,
        "sd_model_checkpoint": "flux1-dev-fp8.safetensors",
        "clip_skip": 2,
        "guidance": config.guidance,
      });
      
      console.log(`📋 Job ID: ${jobId}\n`);
      
      // Wait for completion and get images
      const output = await waitForJob(jobId);
      
      if (output?.images && output.images.length > 0) {
        console.log(`✅ Success! Images:`);
        output.images.forEach((img, idx) => {
          console.log(`   Image ${idx + 1}: ${typeof img === 'string' ? img : JSON.stringify(img).slice(0, 100)}...`);
        });
        
        const fs = await import('fs');
        const results = [{
          name: config.name,
          image: output.images[0],
          job_id: jobId,
          status: 'completed'
        }];
        fs.writeFileSync(`flux-result-${i+1}.json`, JSON.stringify(results, null, 2));
        console.log('\n💾 Saved to flux-result-' + (i+1) + '.json\n');
      } else {
        console.log('⚠️ Unexpected output:', output);
      }
    } catch (error) {
      console.error(`❌ Failed: ${error.message}\n`);
    }
    
    // Small delay between generations
    if (i < count - 1) {
      console.log('\n⏱️  Pausing...\n');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

main().catch(console.error);
