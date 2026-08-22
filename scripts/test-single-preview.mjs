/**
 * Simple Version: Generate 1 Preview Image for Testing
 */

import fs from 'fs';

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = 'e40cgshtouocg8';

async function generateSinglePreview() {
  console.log('🎨 Generating single preview image...\n');
  
  const workflow = {
    "3": {
      "inputs": { "ckpt_name": "flux1-dev-fp8.safetensors", "clip_select": "both" },
      "class_type": "CheckpointLoaderSimple"
    },
    "4": {
      "inputs": { 
        "text": "beautiful anime girl, long flowing hair, brown eyes, casual outfit, soft lighting, detailed face",
        "clip": ["3", 1] 
      },
      "class_type": "CLIPTextEncode"
    },
    "5": {
      "inputs": { "width": 512, "height": 640, "batch_size": 1 },
      "class_type": "EmptyLatentImage"
    },
    "6": {
      "inputs": { 
        "text": "low quality, blurry, distorted features, bad anatomy",
        "clip": ["3", 1] 
      },
      "class_type": "CLIPTextEncode"
    },
    "8": {
      "inputs": {
        "seed": Math.floor(Math.random() * 2147483647),
        "steps": 28,
        "cfg": 1,
        "sampler_name": "euler",
        "scheduler": "simple",
        "denoise": 1,
        "model": ["3", 0],
        "positive": ["4", 0],
        "negative": ["6", 0],
        "latent_image": ["5", 0]
      },
      "class_type": "KSampler"
    },
    "9": {
      "inputs": { "vae": ["3", 2] },
      "class_type": "VAELoader"
    },
    "10": {
      "inputs": { "samples": ["8", 0], "vae": ["9", 0] },
      "class_type": "VAEDecode"
    },
    "11": {
      "inputs": { 
        "filename_prefix": "Simple_Preview",
        "images": ["10", 0]
      },
      "class_type": "SaveImage"
    }
  };

  console.log('📤 Submitting job...');
  
  const submitRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      input: workflow,
      id: RUNPOD_ENDPOINT_ID,
      stream: false
    })
  });

  if (!submitRes.ok) {
    console.error('❌ Submit failed:', await submitRes.text());
    return;
  }

  const jobId = (await submitRes.json()).id;
  console.log(`✅ Job submitted: ${jobId}\n`);

  console.log('⏳ Polling job status...');
  let attempts = 0;
  
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 5000));
    
    const statusRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/status/${jobId}`, {
      headers: { 'Authorization': `Bearer ${RUNPOD_API_KEY}` }
    });

    const statusData = await statusRes.json();
    
    console.log(`   Status: ${statusData.status} (attempt ${attempts + 1}/60)`);
    
    if (statusData.status === 'COMPLETED') {
      if (statusData.output && statusData.output.length > 0) {
        console.log('\n✅ SUCCESS!\n');
        console.log('🖼️ Image URL:', statusData.output[0]);
        
        // Save to file
        fs.writeFileSync(
          'single-preview-result.json',
          JSON.stringify({ url: statusData.output[0], jobId }, null, 2)
        );
        console.log('💾 Saved to single-preview-result.json\n');
      } else {
        console.log('⚠️ Completed but no output images');
      }
      return;
    }
    
    if (statusData.status === 'FAILED' || statusData.status === 'ERROR') {
      console.error('\n❌ JOB FAILED\n');
      console.error(statusData);
      return;
    }
    
    attempts++;
  }
  
  console.error('\n⏱️ TIMEOUT - Max attempts reached\n');
}

generateSinglePreview().catch(console.error);
