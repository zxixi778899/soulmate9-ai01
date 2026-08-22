// Test RunPod API with correct format

const RUNPOD_API_KEY = process.env.RUNPOD_API_KEY;
if (!RUNPOD_API_KEY) {
  console.error('请设置环境变量 RUNPOD_API_KEY');
  process.exit(1);
}
const RUNPOD_ENDPOINT_ID = 'e40cgshtouocg8';

async function testRunPod() {
  console.log('🧪 Testing RunPod API...\n');
  
  // First, let's check what endpoints are available
  try {
    const infoRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}`, {
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      },
    });
    
    console.log('Endpoint Info Status:', infoRes.status);
    if (infoRes.ok) {
      const info = await infoRes.json();
      console.log('Endpoint Info:', JSON.stringify(info, null, 2));
    }
  } catch (error) {
    console.log('Cannot fetch endpoint info:', error.message);
  }
  
  // Try submitting a simple job
  console.log('\n📤 Submitting test job...');
  
  const payload = {
    input: {
      "prompt": "test image",
      "negative_prompt": "bad quality",
      "cfg_scale": 1.0,
      "steps": 5,
      "width": 512,
      "height": 512,
      "seed": 42,
      "sd_model_checkpoint": "flux1-dev-fp8.safetensors",
      "clip_skip": 2,
      "guidance": 3.5,
    },
    id: RUNPOD_ENDPOINT_ID,
    stream: false,
  };
  
  const submitRes = await fetch(`https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RUNPOD_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  
  console.log('\nSubmit Response Status:', submitRes.status);
  
  if (!submitRes.ok) {
    const text = await submitRes.text();
    console.log('Error Body:', text);
    return;
  }
  
  const result = await submitRes.json();
  console.log('Job ID:', result.id);
  console.log('Status:', result.status);
  
  // Now try to query the job status - maybe we need to use a different approach
  if (result.id) {
    console.log('\n🔍 Checking job status...');
    
    // Method 1: Try /jobs/:id
    try {
      const jobUrl = `https://api.runpod.ai/v2/${RUNPOD_ENDPOINT_ID}/jobs/${result.id}`;
      console.log('Trying:', jobUrl);
      
      const jobRes = await fetch(jobUrl, {
        headers: {
          'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        },
      });
      
      console.log('Jobs API Status:', jobRes.status);
      
      if (jobRes.ok) {
        const jobData = await jobRes.json();
        console.log('Job Data:', JSON.stringify(jobData, null, 2));
      } else {
        const errText = await jobRes.text();
        console.log('Error:', errText);
      }
    } catch (err) {
      console.log('Error checking jobs:', err.message);
    }
  }
}

testRunPod().catch(console.error);
