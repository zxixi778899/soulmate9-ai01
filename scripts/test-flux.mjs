// Simple FLUX generator using process.env directly

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = 'e40cgshtouocg8';

async function testFlux() {
  console.log('🚀 Testing FLUX via RunPod...\n');
  
  const url = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`;
  
  const prompt = 'professional portrait photography, soft natural lighting, gorgeous young adult female age 25, caucasian features, long flowing blonde hair, brown eyes, slim figure, clear eyes, sharp focus';
  const negativePrompt = 'blurry, low quality, distorted face, bad anatomy';
  
  const payload = {
    input: {
      "prompt": prompt,
      "negative_prompt": negativePrompt,
      "cfg_scale": 1.0,
      "steps": 28,
      "width": 768,
      "height": 1024,
      "seed": Math.floor(Math.random() * 2147483647),
      "sd_model_checkpoint": "flux1-dev-fp8.safetensors",
      "clip_skip": 2,
      "guidance": 3.5,
    },
    id: RUNPOD_ENDPOINT_ID,
    stream: false,
  };

  try {
    console.log(`Endpoint: ${RUNPOD_ENDPOINT_ID}`);
    console.log(`Steps: 28`);
    console.log(`CFG: 1.0`);
    console.log(`Guidance: 3.5\n`);
    
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
    
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.out?.images && result.out.images.length > 0) {
      console.log('\n✅ Success! Image URL:', result.out.images[0]);
    } else {
      console.log('\n⚠️  Unexpected response');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testFlux();
