// Diagnostic script for RunPod endpoint
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_KEY = 'rpa_REDACTED';
const ENDPOINT_ID = 'wozrrlcdipyl3p';

async function checkEndpoint() {
  try {
    console.log(`Checking RunPod endpoint: ${ENDPOINT_ID}`);
    
    // Check pod status
    const statusRes = await fetch(`https://api.runpod.ai/v2/${ENDPOINT_ID}/status`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(10000)
    });
    
    if (!statusRes.ok) {
      throw new Error(`Status HTTP ${statusRes.status}`);
    }
    
    const status = await statusRes.json();
    console.log('\n=== Pod Status ===');
    console.log(JSON.stringify(status, null, 2));
    
    // Check recent jobs
    const jobsRes = await fetch(`https://api.runpod.ai/v2/${ENDPOINT_ID}/jobs?limit=5`, {
      headers: { Authorization: `Bearer ${API_KEY}` },
      signal: AbortSignal.timeout(10000)
    });
    
    if (jobsRes.ok) {
      const jobs = await jobsRes.json();
      console.log('\n=== Recent Jobs ===');
      jobs?.slice(-5)?.forEach(job => {
        console.log(`Job ${job.id}: ${job.status} - ${(job.output?.error || job.output?.message || '').slice(0, 100)}`);
      });
    }
    
  } catch (e) {
    console.error('Error:', e.message);
  }
}

checkEndpoint();
