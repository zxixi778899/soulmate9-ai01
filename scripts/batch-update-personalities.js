#!/usr/bin/env node
/**
 * Batch Personality Configuration Script
 * 
 * Updates girlfriend personality_traits to ensure valid personality types
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const VALID_PERSONALITIES = ['tsundere', 'oneeSan', 'yandere', 'genki', 'kuudere'];
const PERSONALITY_DESCRIPTIONS = {
  tsundere: '傲娇',
  oneeSan: '温柔姐姐',
  yandere: '病娇',
  genki: '元气少女',
  kuudere: '高冷御姐'
};

async function batchUpdatePersonalities() {
  console.log('\n🔍 Checking all girlfriends for personality configuration...\n');
  
  const { data: allGirlfriends, error: gfError } = await supabase
    .from('girlfriends')
    .select('id, name, personality_traits, openness, adult_content_enabled')
    .not('is_public', 'eq', false) // Only public girlfriends
    .limit(100);
  
  if (gfError) {
    console.error('❌ Error fetching girlfriends:', gfError.message);
    return;
  }
  
  console.log(`✅ Found ${allGirlfriends.length} public girlfriends\n`);
  
  let updatedCount = 0;
  let skippedCount = 0;
  
  for (const gf of allGirlfriends) {
    const currentTraits = gf.personality_traits || [];
    const primaryTrait = Array.isArray(currentTraits) ? currentTraits[0] : null;
    
    if (!primaryTrait || !VALID_PERSONALITIES.includes(primaryTrait)) {
      // Need to update
      const newPersonality = getRecommendedPersonality(gf.name, gf.openness);
      
      const { data, error } = await supabase
        .from('girlfriends')
        .update({ 
          personality_traits: JSON.stringify([newPersonality]),
          // Optional: also set openness if missing
          ...(gf.openness && !['conservative', 'moderate', 'open', 'experimental'].includes(gf.openness) 
            ? { openness: 'moderate' } 
            : {})
        })
        .eq('id', gf.id);
      
      if (error) {
        console.log(`⚠️  ${gf.name}: Update failed - ${error.message}`);
      } else {
        console.log(`✅  ${gf.name}: Set personality → ${PERSONALITY_DESCRIPTIONS[newPersonality]} (${newPersonality})`);
        updatedCount++;
      }
    } else {
      console.log(`✓    ${gf.name}: Already has ${PERSONALITY_DESCRIPTIONS[primaryTrait]} (${primaryTrait})`);
      skippedCount++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updatedCount}`);
  console.log(`   ✓   Skipped: ${skippedCount}`);
  console.log(`\n💡 Next steps:`);
  console.log(`   1. Test chat quality with updated personalities`);
  console.log(`   2. Adjust tone distribution if needed in src/lib/tone-distribution.ts`);
  console.log(`   3. Run pnpm validate to check TypeScript`);
  console.log(`\n✨ Personality configuration complete!\n`);
}

function getRecommendedPersonality(name, openness) {
  const nameLower = (name || '').toLowerCase();
  
  // Auto-recommend based on name hints
  if (/温柔|柔|soft|gentle/i.test(nameLower)) return 'oneeSan';
  if (/傲娇|傲|tsun/i.test(nameLower)) return 'tsundere';
  if (/元/气 | 活泼|lively/i.test(nameLower)) return 'genki';
  if (/冷|cool|ice/i.test(nameLower)) return 'kuudere';
  
  // Default based on openness
  if (openness === 'conservative') return 'oneeSan'; //保守型适合温柔引导
  if (openness === 'open') return 'tsundere'; //开放型适合傲娇反差
  
  // Random default
  const defaults = ['oneeSan', 'tsundere', 'genki'];
  return defaults[Math.floor(Math.random() * defaults.length)];
}

batchUpdatePersonalities().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
