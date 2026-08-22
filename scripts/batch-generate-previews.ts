// @ts-check

/**
 * Batch Generate Preview Images for Girlfriends
 * Uses FLUX model to generate unified style preview images
 * Run: pnpm tsx scripts/batch-generate-previews.ts
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

const PUBLIC_API_BASE = 'http://localhost:5000';

interface Girlfriend {
  id: string;
  slug: string;
  name: string;
  style?: string;
  render_style?: string;
  nsfw?: boolean;
  avatar_url?: string | null;
  portrait_url?: string | null;
  is_public?: boolean;
  review_status?: string;
}

interface GenerationRequest {
  name?: string;
  ethnicity?: string;
  gender?: string;
  hair_style?: string;
  hair_color?: string;
  body_type?: string;
  fashion_style?: string;
  visual_style?: string;
  render_style?: string;
  appearance_prompt?: string;
}

async function fetchPublicGirlfriends(): Promise<Girlfriend[]> {
  console.log('📡 Fetching public girlfriends from database...');
  
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('girlfriends')
      .select('*')
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .limit(20)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const girls = data || [];
    console.log(`✅ Found ${girls.length} public girlfriends in database`);
    return (girls as unknown as Girlfriend[]).map(g => ({
      ...g,
      nsfw: g.render_style === 'nsfw',
    }));
  } catch (error) {
    console.error('❌ Failed to fetch from database:', error);
    return [];
  }
}

async function generatePortrait(girlfriend: Girlfriend, override?: GenerationRequest): Promise<{ url?: string; error?: string }> {
  const reqBody: Record<string, unknown> = {
    name: girlfriend.name,
    girlfriend_id: girlfriend.id,
    count: 1,
    ...override,
  };

  // Auto-detect NSFW level
  const isNSFW = girlfriend.nsfw === true || girlfriend.render_style === 'nsfw';
  if (isNSFW) {
    reqBody.nsfw_level = 3; // Moderate NSFW
  }

  console.log(`🎨 Generating portrait for ${girlfriend.name} (${girlfriend.slug})...`);

  try {
    const response = await fetch(`${PUBLIC_API_BASE}/api/girlfriends/generate-portrait`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reqBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    
    if (result.success && result.imageUrl) {
      console.log(`✅ Generated: ${girlfriend.name} -> ${result.imageUrl}`);
      return { url: result.imageUrl };
    } else if (result.error) {
      console.warn(`⚠️  Error for ${girlfriend.name}:`, result.error);
      return { error: result.error };
    } else {
      console.warn(`⚠️  Unexpected response for ${girlfriend.name}:`, result);
      return { error: 'Unexpected response' };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to generate for ${girlfriend.name}:`, errMsg);
    return { error: errMsg };
  }
}

async function batchGeneratePreviewImages(count: number = 10) {
  console.log('🚀 Starting batch preview image generation...');
  console.log(`📊 Target: First ${count} girlfriends from public catalog\n`);

  const girlfriends = await fetchPublicGirlfriends();
  
  if (girlfriends.length === 0) {
    console.error('❌ No girlfriends found. Please ensure the dev server is running.');
    process.exit(1);
  }

  const targets = girlfriends.slice(0, count);
  const results: Array<{
    slug: string;
    name: string;
    url?: string;
    error?: string;
  }> = [];

  // Generation styles -统一 FLUX 风格参数
  const generationPresets = [
    // SFW Portrait - Close-up, natural light
    {
      style: 'realistic',
      render_style: 'sfw',
      ethnicity: 'caucasian',
      gender: 'Female',
      face_shape: 'oval',
      hair_style: 'long flowing',
      hair_color: '#d4a574',
      body_type: 'slim',
      fashion_style: 'casual',
      framing: 'close-up',
    },
    // SFW Full-body - Waist-up, studio lighting
    {
      style: 'realistic',
      render_style: 'sfw',
      ethnicity: 'asian',
      gender: 'Female',
      face_shape: 'heart',
      hair_style: 'short bob',
      hair_color: '#000000',
      body_type: 'athletic',
      fashion_style: 'elegant',
      framing: 'waist-up',
    },
    // 2D Anime - Flat color, vibrant
    {
      style: '2d',
      render_style: 'anime',
      ethnicity: 'japanese',
      gender: 'Female',
      face_shape: 'round',
      hair_style: 'twin tails',
      hair_color: '#e84393',
      body_type: 'petite',
      fashion_style: 'school uniform',
      framing: 'close-up',
    },
    // 3D Render - Unreal Engine style
    {
      style: '3d',
      render_style: 'sfw',
      ethnicity: 'mixed',
      gender: 'Female',
      face_shape: 'diamond',
      hair_style: 'braided',
      hair_color: '#8b5cf6',
      body_type: 'curvy',
      fashion_style: 'fantasy armor',
      framing: 'waist-up',
    },
  ];

  // Generate multiple variations per character
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const gf = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] Processing: ${gf.name}`);

    // Try different presets for variety
    for (let presetIdx = 0; presetIdx < Math.min(2, generationPresets.length); presetIdx++) {
      const preset = generationPresets[presetIdx];
      
      console.log(`  📸 Attempt ${presetIdx + 1}: ${preset.style} / ${preset.framing}`);
      
      const result = await generatePortrait(gf, {
        ...preset,
        appearance_prompt: `professional portrait photography, high quality, detailed face`,
      });

      if (result.url) {
        results.push({
          slug: gf.slug,
          name: gf.name,
          url: result.url,
        });
        successCount++;
        break; // Move to next character if successful
      } else if (result.error) {
        console.log(`     ❌ Error: ${result.error}`);
        errorCount++;
      }
    }
  }

  // Summary
  console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Batch Generation Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Errors: ${errorCount}`);
  console.log(`📝 Total: ${targets.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Save results to file
  const fs = await import('fs');
  const outputPath = 'batch-generation-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${outputPath}`);

  // Print URLs
  console.log('\n📷 Generated Images:');
  results.forEach((r, idx) => {
    console.log(`${idx + 1}. ${r.name} (${r.slug})`);
    console.log(`   ${r.url || '❌ ' + r.error}\n`);
  });
}

// CLI args
const countArg = process.argv.find(arg => arg.startsWith('--count='));
const count = countArg ? parseInt(countArg.split('=')[1], 10) : 10;

// Run
batchGeneratePreviewImages(count).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
