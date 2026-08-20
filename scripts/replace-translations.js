#!/usr/bin/env node
/**
 * Replace translation keys with hardcoded English strings temporarily
 */

const fs = require('fs');
const path = require('path');

// Translation key mapping to English
const KEY_MAP = {
  'create.qualityPresets': 'Quality Presets',
  'create.generationSettings': 'Generation Settings',
  'create.fast': 'Fast',
  'create.balanced': 'Balanced',
  'create.quality': 'Quality',
  'create.ultra': 'Ultra',
  'create.steps': 'Steps',
  'create.cfgGuidance': 'CFG Guidance',
  'create.aspectRatio': 'Aspect Ratio',
  'create.sampler': 'Sampler',
  'create.scheduler': 'Scheduler',
  'create.seed': 'Seed',
  'create.modelLoadError': 'Model Loading Error',
  'create.modelInfoPending': 'Loading model info...',
  'create.modelInfo': 'Model Information',
  'create.loraStack': 'LoRA Stack',
  'create.inventoryFrom': 'Inventory from',
  'create.resolution': 'Resolution',
  'create.preset': 'Preset',
  'create.whyThisModel': 'Why this model',
  'create.positivePrompt': 'Positive Prompt',
  'create.negativePrompt': 'Negative Prompt',
  'create.positivePlaceholder': 'Edit your prompt here...',
  'create.negativePlaceholder': 'Optional: edit negatives...',
  'create.regenerateBase': 'Regenerate base prompt',
  'create.regen': 'Regen',
  'create.words': 'Words',
  'create.tokensApprox': '~{count} Tokens',
  'create.edit': 'Edit',
  'create.view': 'View',
  'create.advancedSettings': 'Advanced Settings',
  'create.closeSettings': 'Close',
  'create.saveDraft': 'Auto-saving draft...',
  'create.modelFamilyFlux': 'FLUX',
  'create.modelFamilyPony': 'Pony (SDXL)',
  'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
};

const COMPONENTS = [
  'src/components/creator/GenerationSettings.tsx',
  'src/components/creator/ModelInfoCard.tsx',
  'src/components/creator/PromptEditor.tsx',
];

console.log('🔄 Replacing translation keys with hardcoded English...\n');

for (const component of COMPONENTS) {
  const filePath = path.join(__dirname, '..', component);
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  Component not found: ${component}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  // Find all t('key') patterns and replace
  content = content.replace(/t\(['"](create\.[^'"]+)['"]\)/g, (match, key) => {
    if (KEY_MAP[key]) {
      // Handle special case for tokensApprox with template literal
      if (key === 'create.tokensApprox') {
        return `'~${'{' + 'count' + '}'} Tokens'`;
      }
      console.log(`  ✅ ${key} → '${KEY_MAP[key]}'`);
      modified = true;
      return `'${KEY_MAP[key]}'`;
    }
    return match; // Keep original if not mapped
  });

  // Remove useTranslation import if no longer used
  if (modified && content.includes('useTranslation')) {
    // Check if t is still used anywhere
    const hasTUsage = /t\(['"]/.test(content);
    if (!hasTUsage) {
      content = content.replace(/import { useTranslation } from ['"].\/i18n\/context['"];?\n/, '');
      console.log(`  🗑️  Removed unused useTranslation import`);
    }
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Modified ${component}\n`);
  } else {
    console.log(`⏭️  Skipped ${component} (no changes)\n`);
  }
}

console.log('✅ Done! All translation keys replaced.\n');
console.log('Note: You can revert these changes later when translation keys are added.');
