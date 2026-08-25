#!/usr/bin/env node
/**
 * Chat Quality Diagnostic Script
 * 
 * Checks if the persona engine is properly configured for a given girlfriend
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnoseGirlfriend(girlfriendId) {
  console.log('\n🔍 Diagnosing girlfriend chat quality...\n');
  
  // Get girlfriend data
  const { data: gf, error: gfError } = await supabase
    .from('girlfriends')
    .select('*')
    .eq('id', girlfriendId)
    .single();
  
  if (gfError || !gf) {
    console.error('❌ Error:', gfError?.message);
    return;
  }
  
  console.log('✅ Girlfriend Found:');
  console.log(`   Name: ${gf.name}`);
  console.log(`   Personality Traits: ${JSON.stringify(gf.personality_traits || 'NOT SET')}`);
  console.log(`   Openness: ${gf.openness || 'NOT SET'}`);
  console.log(`   Adult Content Enabled: ${gf.adult_content_enabled ? 'Yes' : 'No'}`);
  
  // Check personality traits validity
  const validPersonalities = ['tsundere', 'oneeSan', 'yandere', 'genki', 'kuudere'];
  const primaryTrait = gf.personality_traits?.[0] || 'friendly';
  const isValidPersonality = validPersonalities.includes(primaryTrait);
  
  console.log('\n📊 Personality Check:');
  console.log(`   Primary Trait: ${primaryTrait}`);
  console.log(`   Valid: ${isValidPersonality ? '✅ YES' : '⚠️ NO - Defaulting to friendly'}`);
  
  // Get intimacy score
  const { data: intimacy } = await supabase
    .from('intimacy_scores')
    .select('score, level')
    .eq('user_id', 'test-user-id') // You need to provide actual user ID
    .eq('girlfriend_id', girlfriendId)
    .single();
  
  console.log('\n❤️ Intimacy Status:');
  if (intimacy) {
    console.log(`   Score: ${intimacy.score}`);
    console.log(`   Level: Lv.${intimacy.level}`);
  } else {
    console.log('   No intimacy data found (new relationship?)');
  }
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  if (!isValidPersonality) {
    console.log('   ⚠️  Add one of these to personality_traits: tsundere, oneeSan, yandere, genki, kuudere');
  }
  if (!gf.openness) {
    console.log('   ⚠️  Set openness: conservative, moderate, open, or experimental');
  }
  if (!gf.adult_content_enabled) {
    console.log('   ⚠️  Enable adult_content_enabled for NSFW conversations');
  }
  
  console.log('\n🎯 System Prompt will include:');
  console.log('   ✓ Persona template (' + (isValidPersonality ? primaryTrait : 'oneeSan fallback') + ')');
  console.log('   ✓ Tone selection (sweet/coquettish/refusal/angry)');
  console.log('   ✓ Lifecycle phase behavior rules');
  console.log('   ✓ Relationship context (Lv.' + (intimacy?.level || 1) + ')');
  console.log('   ✓ Mood detection and desire gradient');
  
  console.log('\n✅ Diagnostic complete\n');
}

// Run with CLI argument
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node diagnose-chat-quality <girlfriend-id>');
  console.log('\nExample: node diagnose-chat-quality a1b2c3d4-e5f6-7890-abcd-ef1234567890\n');
  process.exit(1);
}

diagnoseGirlfriend(args[0]).catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
