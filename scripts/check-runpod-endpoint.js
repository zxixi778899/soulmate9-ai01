#!/usr/bin/env node
/**
 * RunPod Endpoint Health Check Tool
 * 
 * This script helps diagnose common RunPod configuration issues:
 * - Endpoint availability
 * - API key validity  
 * - Environment variable completeness
 */

const https = require('https');
const http = require('http');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function checkEnvironmentVariables() {
  log('\n📋 Checking environment variables...', 'blue');
  console.log('='.repeat(50));
  
  const envVars = process.env;
  const requiredVars = [
    'RUNPOD_API_KEY',
    'RUNPOD_ENDPOINT_ID',
  ];
  
  let allPresent = true;
  
  for (const varName of requiredVars) {
    const value = envVars[varName];
    if (!value || !value.trim()) {
      log(`❌ ${varName} - NOT SET`, 'red');
      allPresent = false;
    } else if (value.includes('rpc_') || value.includes('https://')) {
      log(`✅ ${varName} - Set ✓`, 'green');
    } else {
      log(`⚠️  ${varName} - Invalid format`, 'yellow');
      allPresent = false;
    }
  }
  
  console.log('='.repeat(50));
  
  if (!allPresent) {
    log('\n💡 Missing variables found. Fix instructions:', 'yellow');
    log('  1. Visit Vercel Dashboard → Settings → Environment Variables', 'gray');
    log('  2. Add missing variables with correct values', 'gray');
    log('  3. Redeploy the application\n', 'gray');
    return false;
  }
  
  return true;
}

function testEndpointHealth(endpointUrl) {
  return new Promise((resolve) => {
    log('\n🔍 Testing endpoint health...', 'blue');
    
    const url = new URL(endpointUrl);
    const client = url.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: '/health',
      method: 'GET',
      timeout: 10000, // 10 second timeout
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            log(`✅ Endpoint healthy! Status: ${res.statusCode}`, 'green');
            
            if (json.gpu_count) {
              log(`   GPU Count: ${json.gpu_count}`, 'gray');
            }
            if (json.system_stats?.total_memory) {
              log(`   Memory: ${(json.system_stats.total_memory / 1e9).toFixed(2)} GB`, 'gray');
            }
            
            resolve({ success: true, data: json });
          } catch (e) {
            log(`⚠️  Endpoint responded but not valid JSON`, 'yellow');
            resolve({ success: false, error: 'Invalid JSON response' });
          }
        } else {
          log(`❌ Endpoint returned status ${res.statusCode}`, 'red');
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });
    
    req.on('error', (err) => {
      log(`❌ Connection failed: ${err.message}`, 'red');
      resolve({ success: false, error: err.message });
    });
    
    req.on('timeout', () => {
      log(`⏱️  Request timed out after 10s`, 'yellow');
      resolve({ success: false, error: 'Timeout' });
    });
    
    req.end();
  });
}

async function main() {
  log('🔬 RunPod Endpoint Diagnostic Tool', 'blue');
  log('=' .repeat(50), 'gray');
  
  // Step 1: Check environment variables
  const envOk = await checkEnvironmentVariables();
  if (!envOk) {
    log('\n❌ Diagnosis complete. Please fix environment variables first.', 'red');
    process.exit(1);
  }
  
  // Step 2: Test endpoint connectivity
  const endpoint = process.env.RUNPOD_ENDPOINT_ID;
  const healthCheck = await testEndpointHealth(endpoint);
  
  if (healthCheck.success) {
    log('\n✅ All checks passed! Your RunPod endpoint is ready.', 'green');
    log('You should now be able to generate images normally.\n', 'green');
    process.exit(0);
  } else {
    log('\n❌ Endpoint health check failed.', 'red');
    log('\n💡 Troubleshooting steps:', 'yellow');
    log('  1. Verify your Pod is running in RunPod Console', 'gray');
    log('  2. Check that ComfyUI started successfully', 'gray');
    log('  3. Ensure the public URL is correct', 'gray');
    log('  4. Try restarting your Pod if needed', 'gray');
    log('');
    process.exit(1);
  }
}

main().catch(err => {
  log(`\n❌ Unexpected error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
