/* eslint-disable */ // One-off ops script (CJS), not part of the app bundle
const https = require('https');

// 替换这些变量为您的新密钥和端点
const API_KEY = 'YOUR_NEW_RUNPOD_API_KEY';
const ENDPOINT_ID = 'YOUR_NEW_ENDPOINT_ID';

console.log(`Testing RunPod API...\n`);

const options = {
  hostname: 'api.runpod.ai',
  port: 443,
  path: `/v2/${ENDPOINT_ID}/status`,
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      const status = JSON.parse(data);
      console.log('\n=== Pod Status ===');
      console.log(JSON.stringify(status, null, 2));
      
      if (status.status === 'ACTIVE' || status.status === 'RUNNING') {
        console.log('\n✅ Endpoint is working!');
      } else {
        console.log('\n⚠️ Endpoint exists but status:', status.status);
      }
    } else {
      console.log('\n❌ Error:', data);
    }
  });
});

req.on('error', (e) => {
  console.log('\n❌ Request failed:', e.message);
});

req.end();
