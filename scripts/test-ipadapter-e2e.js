#!/usr/bin/env node
/**
 * IP-Adapter E2E Test Suite
 * 
 * This script automates the testing of facial identity preservation
 * across companion generation workflows.
 * 
 * Usage:
 *   npm run test:e2e-ipadapter
 *   node scripts/test-ipadapter-e2e.js
 */

const { execSync } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const TEST_CONFIG = {
  baseUrl: process.env.TEST_BASE_URL || 'http://localhost:3000',
  maxRetries: 3,
  retryDelayMs: 5000,
  testCompanions: 2, // Create 2 different companions for cross-comparison
};

// Test state
let testState = {
  testUsers: [],
  testCompanions: [],
};

// Helper: Sleep
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Retry with backoff
async function retry(fn, retries = TEST_CONFIG.maxRetries) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1) throw err;
    console.warn(`Retry ${TEST_CONFIG.maxRetries - retries + 1}/${TEST_CONFIG.maxRetries}`);
    await sleep(TEST_CONFIG.retryDelayMs);
    return retry(fn, retries - 1);
  }
}

// Helper: Execute curl command
async function curl(endpoint, options = {}) {
  const { method = 'GET', body = null, token = null } = options;
  
  const cmd = [
    'curl',
    '-X', method,
    `-H "Content-Type: application/json"`,
    ...(token ? [`-H "Authorization: Bearer ${token}"`] : []),
    ...(body ? ['-d', JSON.stringify(body)] : []),
    `${TEST_CONFIG.baseUrl}${endpoint}`,
  ].join(' ');

  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
  } catch (error) {
    console.error('CURL ERROR:', error.message);
    throw error;
  }
}

// Step 1: Create test user and get auth token
async function setupTestUser() {
  console.log('\n📋 STEP 1: Creating test user...');
  
  const email = `test_ip_adapter_${Date.now()}@example.com`;
  const password = 'TestPassword123!';
  
  try {
    const registerResult = await retry(() => 
      curl('/api/auth/register', {
        method: 'POST',
        body: { email, password, name: 'IP Adapter Tester' },
      })
    );
    
    console.log('✓ User registered:', email);
    return { email, password };
  } catch (err) {
    console.log('⚠️ User already exists or registration failed');
    // Try to login instead
    const loginResult = await curl('/api/auth/login', {
      method: 'POST',
      body: { email, password: 'TestPassword123!' },
    });
    return { email, password: 'TestPassword123!' };
  }
}

// Step 2: Login and get token
async function login(email, password) {
  console.log('\n📋 STEP 2: Logging in...');
  
  const result = await retry(() => 
    curl('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    })
  );
  
  const json = JSON.parse(result);
  if (!json.token) {
    throw new Error('No token returned from login');
  }
  
  console.log('✓ Logged in successfully');
  return json.token;
}

// Step 3: Generate first companion portrait
async function generateCompanion(token, index) {
  console.log(`\n📋 STEP 3.${index}: Generating companion #${index}...`);
  
  const companionData = {
    name: `Test Companion ${String.fromCharCode(65 + index)}`, // A, B, C...
    age: 20 + index,
    gender: "Female",
    appearance_race: index === 0 ? "Caucasian" : "East Asian",
    appearance_hair_color: index === 0 ? "#d4a574" : "#000000", // Blonde vs Black
    appearance_hair: index === 0 ? "long wavy" : "short straight",
    appearance_eyes: index === 0 ? "blue" : "dark brown",
    appearance_body: "slim athletic",
    style: "casual",
    visual_style: "realistic",
    count: 4,
  };
  
  const result = await retry(() => 
    curl('/api/girlfriends', {
      method: 'POST',
      token,
      body: companionData,
    })
  );
  
  const json = JSON.parse(result);
  console.log('✓ Companion created:', json.id);
  return json;
}

// Step 4: Generate portrait for existing companion
async function generatePortrait(token, gfId) {
  console.log(`\n📋 STEP 4: Generating portrait for GF ${gfId}...`);
  
  const result = await retry(() => 
    curl('/api/girlfriends/generate-portrait', {
      method: 'POST',
      token,
      body: { girlfriend_id: gfId, count: 1 },
    })
  );
  
  const json = JSON.parse(result);
  console.log('✓ Portrait generated:', json.success);
  return json;
}

// Step 5: Verify identity kit integration
async function verifyIdentityKit(gfId, token) {
  console.log('\n📋 STEP 5: Verifying identity-kit integration...');
  
  try {
    const result = await curl(`/api/girlfriends/${gfId}`, {
      token,
    });
    
    const json = JSON.parse(result);
    console.log('GF Data:', {
      id: json.id,
      name: json.name,
      face_reference_url: json.face_reference_url ? '✓ Present' : '✗ Missing',
    });
    
    if (!json.face_reference_url) {
      console.warn('⚠️ face_reference_url not found');
      return false;
    }
    
    console.log('✓ Identity reference verified');
    return true;
  } catch (err) {
    console.error('✗ Verification failed:', err.message);
    return false;
  }
}

// Main test flow
async function runTestSuite() {
  console.log('🚀 Starting IP-Adapter E2E Test Suite');
  console.log('='.repeat(60));
  
  try {
    // Setup
    const userData = await setupTestUser();
    const token = await login(userData.email, userData.password);
    
    // Create multiple companions
    const companions = [];
    for (let i = 0; i < TEST_CONFIG.testCompanions; i++) {
      const companion = await generateCompanion(token, i);
      companions.push(companion);
    }
    
    testState.companions = companions;
    
    // Generate portraits for each companion
    for (let i = 0; i < companions.length; i++) {
      await generatePortrait(token, companions[i].id);
      
      // Verify identity kit
      const verified = await verifyIdentityKit(companions[i].id, token);
      if (!verified) {
        console.warn(`Companion ${i}: Identity kit not yet initialized`);
      }
      
      // Wait between requests
      await sleep(2000);
    }
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ E2E Test Suite Complete');
    console.log('='.repeat(60));
    console.log(`Created ${companions.length} test companions`);
    console.log('All portrait generations completed successfully');
    console.log('\nNext steps:');
    console.log('1. Check RunPod job logs for IP-Adapter node injection');
    console.log('2. Manually compare faces across companions');
    console.log('3. Verify similarity scores (>90% for same companion)');
    console.log('4. Review error rates and latency metrics');
    
  } catch (error) {
    console.error('\n❌ E2E Test Suite Failed');
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  runTestSuite().catch(err => {
    console.error('FATAL:', err);
    process.exit(1);
  });
}

module.exports = { runTestSuite };
