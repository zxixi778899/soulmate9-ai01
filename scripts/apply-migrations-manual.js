#!/usr/bin/env node

/**
 * Manual Database Migration Script
 * 
 * Use this to apply migrations when supabase CLI is not linked.
 * Copy the SQL statements and execute them via:
 * - Supabase Dashboard SQL Editor
 * - psql command line
 * - pgAdmin
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Database Migration Guide\n');
console.log('Since Supabase CLI is not linked, please follow these steps:\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 STEP 1: Apply Tokens System Migration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const tokensMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260813100000_tokens_system.sql'),
  'utf8'
);

console.log('Copy and execute this SQL:\n');
console.log(tokensMigration);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📋 STEP 2: Apply Visual Memory Migration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const memoryMigration = fs.readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260813200000_visual_memory_recall.sql'),
  'utf8'
);

console.log('Copy and execute this SQL:\n');
console.log(memoryMigration);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ STEP 3: Verify Installation');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('After executing the migrations, run this verification SQL:\n');

console.log(`
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('generation_memory', 'generation_ledger');

-- Check if functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name IN ('consume_tokens', 'grant_tokens', 'save_to_generation_memory', 'search_similar_memories');

-- Check if columns exist on profiles
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'profiles' 
  AND column_name IN ('tokens_remaining', 'tokens_purchased', 'tokens_consumed');
`);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🎯 STEP 4: Continue with Code Integration');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('Once database is ready, proceed with:');
console.log('1. Install dependencies: pnpm install');
console.log('2. Run type check: pnpm type-check');
console.log('3. Test in dev mode: pnpm dev');
console.log('4. Open http://localhost:3000 and test generation flow\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
