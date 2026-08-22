/**
 * FLUX Preview Image Generator - Browser-based
 * 
 * This opens the Create page and generates preview images with unified FLUX settings.
 * Run: node scripts/open-preview-generator.mjs
 */

import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

console.log('🚀 FLUX Preview Generator (Browser Auto-filler)');
console.log('💡 This will open your browser to the Create page\\n');

// Step 1: Check if server is running
async function checkServer() {
  try {
    const res = await fetch('http://localhost:5000/api/girlfriends/public');
    console.log('✅ Dev server is running\n');
  } catch (error) {
    console.log('❌ Dev server not found!');
    console.log('💡 Starting dev server...');
    await execAsync('pnpm dev', { cwd: 'c:\\Users\\71489\\soulmate9' });
    console.log('⏳ Waiting for server to start...');
    await new Promise(r => setTimeout(r, 8000));
  }
}

// Step 2: Open browser to Create page
async function openCreatePage() {
  console.log('📱 Opening browser to /create...');
  
  // Detect OS and open appropriate browser
  const os = await import('os');
  const platform = os.default.platform();
  
  let browserCmd;
  if (platform === 'win32') {
    browserCmd = 'start http://localhost:5000/create';
  } else if (platform === 'darwin') {
    browserCmd = 'open http://localhost:5000/create';
  } else {
    browserCmd = 'xdg-open http://localhost:5000/create';
  }
  
  exec(browserCmd, (err) => {
    if (err) {
      console.log('❌ Failed to open browser:', err.message);
      console.log('💡 Please manually navigate to: http://localhost:5000/create');
    }
  });
  
  console.log('\n✨ Instructions:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('1. Login to your account if prompted');
  console.log('2. In the Create page, select these FLUX presets:');
  console.log('   • Style: Realistic/2D/3D (choose one)');
  console.log('   • Ethnicity: Any');
  console.log('   • Hair Style: Long flowing');
  console.log('   • Body Type: Slim');
  console.log('   • Fashion Style: Casual Elegant');
  console.log('3. Click "Generate Portrait"');
  console.log('4. Wait for FLUX to generate (~30-60 seconds)');
  console.log('5. Repeat with different styles to create variety');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('ℹ️  All generations use unified FLUX model:');
  console.log('   ✓ Base Model: flux1-dev-fp8.safetensors');
  console.log('   ✓ Steps: SFW=28, NSFW=30-32');
  console.log('   ✓ Guidance: SFW=3.5, NSFW=4.0');
  console.log('   ✓ CFG Scale: 1.0');
  console.log('   ✓ Resolution: 768x1024 / 896x1024\n');
}

// Main flow
checkServer().then(openCreatePage).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
