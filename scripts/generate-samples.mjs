/**
 * Simple Batch Preview Generator - Uses FLUX Model with Unified Styling
 * 
 * This script generates preview images for the first N girlfriends in the database
 * using consistent FLUX parameters across all generations.
 * 
 * Run: pnpm tsx scripts/generate-samples.mjs --count=5
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const COUNT = parseInt(process.argv.find(a => a.startsWith('--count='))?.split('=')[1]) || 5;

console.log('🚀 FLUX Batch Preview Generator');
console.log(`📊 Generating ${COUNT} preview images...\n`);

// API configuration
const API_BASE = 'http://localhost:5000';

// Get list of girlfriends (we'll use hardcoded sample data since DB isn't accessible)
const sampleGirlfriends = [
  { name: 'Luna', slug: 'luna', style: 'realistic', nsfw: false },
  { name: 'Emma', slug: 'emma', style: 'realistic', nsfw: false },
  { name: 'Cole', slug: 'cole-male', style: 'realistic', nsfw: false },
  { name: 'Kai', slug: 'kai-anime', style: 'anime', nsfw: false },
  { name: 'Nora', slug: 'nora', style: '3d', nsfw: false },
];

// Unified FLUX generation presets
const FLUX_PRESETS = {
  sfwPortrait: {
    visual_style: 'realistic',
    render_style: 'sfw',
    gender: 'Female',
    ethnicity: 'caucasian',
    face_shape: 'oval',
    hair_style: 'long flowing',
    hair_color: '#d4a574',
    body_type: 'slim',
    fashion_style: 'casual elegant',
    framing: 'close-up',
    appearance_prompt: 'professional portrait photography, soft natural lighting, detailed skin texture, sharp focus on eyes',
  },
  sfwFullbody: {
    visual_style: 'realistic',
    render_style: 'sfw',
    gender: 'Female',
    ethnicity: 'asian',
    face_shape: 'heart',
    hair_style: 'short bob',
    hair_color: '#000000',
    body_type: 'athletic',
    fashion_style: 'business casual',
    framing: 'waist-up',
    appearance_prompt: 'full body portrait, studio lighting, clean background, professional composition',
  },
  animeStyle: {
    visual_style: '2d',
    render_style: 'anime',
    gender: 'Female',
    ethnicity: 'japanese',
    face_shape: 'round',
    hair_style: 'twin tails',
    hair_color: '#e84393',
    body_type: 'petite',
    fashion_style: 'school uniform',
    framing: 'close-up',
    appearance_prompt: 'anime character design, vibrant colors, cel shading, clean lines',
  },
  threeDStyle: {
    visual_style: '3d',
    render_style: 'sfw',
    gender: 'Female',
    ethnicity: 'mixed',
    face_shape: 'diamond',
    hair_style: 'braided',
    hair_color: '#8b5cf6',
    body_type: 'curvy',
    fashion_style: 'fantasy armor',
    framing: 'waist-up',
    appearance_prompt: '3D rendered character, unreal engine style, PBR materials, dynamic pose',
  },
};

async function generatePortrait(girlfriendName, presetKey) {
  const preset = FLUX_PRESETS[presetKey];
  const requestUrl = `${API_BASE}/api/girlfriends/generate-portrait`;
  
  console.log(`🎨 Generating for ${girlfriendName} (${presetKey})...`);
  
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...preset,
        name: girlfriendName,
        count: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 150)}`);
    }

    const result = await response.json();
    
    if (result.success && result.imageUrl) {
      console.log(`✅ Success: ${girlfriendName} -> ${result.imageUrl}\n`);
      return result.imageUrl;
    } else if (result.error) {
      console.log(`⚠️  Error: ${result.error}\n`);
      return null;
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.message}\n`);
    return null;
  }
}

async function main() {
  // Check if server is running
  try {
    const testRes = await fetch(`${API_BASE}/api/girlfriends/public`);
    console.log('✅ Server is running\n');
  } catch (error) {
    console.log('❌ Dev server not running at ' + API_BASE);
    console.log('💡 Please start with: pnpm dev\n');
    process.exit(1);
  }

  // Load environment variables
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('⚠️  Environment variables not found in .env.local');
    console.log('ℹ️  Will use default FLUX parameters without authentication\n');
  }

  const results = [];
  
  // Generate portraits with different styles
  for (let i = 0; i < Math.min(COUNT, sampleGirlfriends.length); i++) {
    const gf = sampleGirlfriends[i];
    const presetKeys = Object.keys(FLUX_PRESETS);
    const presetKey = presetKeys[i % presetKeys.length];
    
    const imageUrl = await generatePortrait(gf.name, presetKey);
    
    if (imageUrl) {
      results.push({
        name: gf.name,
        style: presetKey,
        url: imageUrl,
      });
    }
    
    // Small delay between requests
    if (i < COUNT - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Summary
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Generation Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Success: ${results.length}/${COUNT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (results.length > 0) {
    console.log('📷 Generated Images:');
    results.forEach((r, idx) => {
      console.log(`${idx + 1}. ${r.name} (${r.style})`);
      console.log(`   ${r.url}\n`);
    });

    // Save to file
    const fs = require('fs');
    fs.writeFileSync('sample-previews-results.json', JSON.stringify(results, null, 2));
    console.log('💾 Results saved to: sample-previews-results.json');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
