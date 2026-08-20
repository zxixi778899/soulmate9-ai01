#!/usr/bin/env node
/**
 * i18n:sync - Bulk add new translation keys to all 7 languages
 * Usage: node scripts/i18n-sync-create-keys.js
 */

const fs = require('fs');
const path = require('path');

// New translation keys for Create Module Refactoring
const NEW_KEYS = {
  // GenerationSettings Component
  'create.qualityPreset': 'Quality Preset',
  'create.fast': 'Fast',
  'create.balanced': 'Balanced',
  'create.quality': 'Quality',
  'create.ultra': 'Ultra',
  'create.cfgGuidance': 'CFG Guidance',
  'create.aspectRatio': 'Aspect Ratio',
  'create.loraMissingTitle': 'Some LoRAs missing',
  'create.generationSettings': 'Generation Settings',
  'create.qualityPresets': 'Quality Presets',
  // ModelInfoCard Component
  'create.modelLoadError': 'Model Loading Error',
  'create.modelInfoPending': 'Loading model info...',
  'create.modelInfo': 'Model Information',
  'create.loraStack': 'LoRA Stack',
  'create.inventoryFrom': 'Inventory from',
  'create.steps': 'Steps',
  'create.resolution': 'Resolution',
  'create.sampler': 'Sampler',
  'create.scheduler': 'Scheduler',
  'create.preset': 'Preset',
  'create.whyThisModel': 'Why this model',
  // PromptEditor Component
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
  // Integration Messages
  'create.advancedSettings': 'Advanced Settings',
  'create.closeSettings': 'Close',
  'create.saveDraft': 'Auto-saving draft...',
  'create.modelFamilyFlux': 'FLUX',
  'create.modelFamilyPony': 'Pony (SDXL)',
  'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
};

// Language configurations
const LANGUAGES = [
  { code: 'en', label: 'English', findBlock: "'create.voice': 'Voice Type'," },
  { code: 'zh', label: '中文', findBlock: "'create.voice': '语音类型',", insertAfterBlock: "'create.tags': '标签',\n  'create.title': '创建伴侣',\n" },
  { code: 'ja', label: '日本語', findBlock: "'create.voice': 'ボイスタイプ'," },
  { code: 'ko', label: '한국어', findBlock: "'create.voice': '목소리 타입'," },
  { code: 'es', label: 'Español', findBlock: "'create.voice': 'Tipo de voz'," },
  { code: 'fr', label: 'Français', findBlock: "'create.voice': 'Type de voix'," },
  { code: 'de', label: 'Deutsch', findBlock: "'create.voice': 'Sprachtyp'," },
];

// Translation mapping for each language
const TRANSLATIONS = {
  en: NEW_KEYS,
  zh: {
    'create.qualityPreset': '质量预设',
    'create.fast': '快速',
    'create.balanced': '平衡',
    'create.quality': '质量',
    'create.ultra': '极致',
    'create.cfgGuidance': 'CFG 引导',
    'create.aspectRatio': '宽高比',
    'create.loraMissingTitle': '缺少部分 LoRA',
    'create.generationSettings': '生成设置',
    'create.qualityPresets': '质量预设',
    'create.modelLoadError': '模型加载错误',
    'create.modelInfoPending': '正在加载模型信息...',
    'create.modelInfo': '模型信息',
    'create.loraStack': 'LoRA 堆栈',
    'create.inventoryFrom': '库存来源',
    'create.steps': '步数',
    'create.resolution': '分辨率',
    'create.sampler': '采样器',
    'create.scheduler': '调度器',
    'create.preset': '预设',
    'create.whyThisModel': '为何选择此模型',
    'create.positivePrompt': '正向提示词',
    'create.negativePrompt': '负向提示词',
    'create.positivePlaceholder': '在此编辑你的提示词...',
    'create.negativePlaceholder': '可选：编辑负向...',
    'create.regenerateBase': '重新生成基础提示词',
    'create.regen': '重生成',
    'create.words': '单词',
    'create.tokensApprox': '~{count} Tokens',
    'create.edit': '编辑',
    'create.view': '查看',
    'create.advancedSettings': '高级设置',
    'create.closeSettings': '关闭',
    'create.saveDraft': '自动保存草稿...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
  ja: {
    'create.qualityPreset': '品質プリセット',
    'create.fast': '高速',
    'create.balanced': 'バランス',
    'create.quality': '高品質',
    'create.ultra': 'ウルトラ',
    'create.cfgGuidance': 'CFG ガイダンス',
    'create.aspectRatio': 'アスペクト比',
    'create.loraMissingTitle': '一部の LoRA が不足しています',
    'create.generationSettings': '生成設定',
    'create.qualityPresets': '品質プリセット',
    'create.modelLoadError': 'モデル読み込みエラー',
    'create.modelInfoPending': 'モデル情報を読み込んでいます...',
    'create.modelInfo': 'モデル情報',
    'create.loraStack': 'LoRA スタック',
    'create.inventoryFrom': 'インベントリ元',
    'create.steps': 'ステップ',
    'create.resolution': '解像度',
    'create.sampler': 'サンプリング',
    'create.scheduler': 'スケジューラ',
    'create.preset': 'プリセット',
    'create.whyThisModel': 'このモデルが選ばれた理由',
    'create.positivePrompt': 'プロンプト（正）',
    'create.negativePrompt': 'プロンプト（負）',
    'create.positivePlaceholder': 'ここでプロンプトを編集...',
    'create.negativePlaceholder': 'オプション：負のパラメータを編集...',
    'create.regenerateBase': '基本プロンプトを再生成',
    'create.regen': '再生成',
    'create.words': '単語',
    'create.tokensApprox': '~{count} トークン',
    'create.edit': '編集',
    'create.view': '表示',
    'create.advancedSettings': '詳細設定',
    'create.closeSettings': '閉じる',
    'create.saveDraft': 'ドラフトを自動保存...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
  ko: {
    'create.qualityPreset': '품질 프리셋',
    'create.fast': '빠름',
    'create.balanced': '균형',
    'create.quality': '고화질',
    'create.ultra': '울트라',
    'create.cfgGuidance': 'CFG 가이드런스',
    'create.aspectRatio': '가로세로 비율',
    'create.loraMissingTitle': '일부 LoRA 부족',
    'create.generationSettings': '생성 설정',
    'create.qualityPresets': '품질 프리셋',
    'create.modelLoadError': '모델 로드 오류',
    'create.modelInfoPending': '모델 정보 로드 중...',
    'create.modelInfo': '모델 정보',
    'create.loraStack': 'LoRA 스택',
    'create.inventoryFrom': '인벤토리 출처',
    'create.steps': '단계',
    'create.resolution': '해상도',
    'create.sampler': '샘플러',
    'create.scheduler': '스케줄러',
    'create.preset': '프리셋',
    'create.whyThisModel': '이 모델을 선택한 이유',
    'create.positivePrompt': '프롬프트 (양수)',
    'create.negativePrompt': '프롬프트 (음수)',
    'create.positivePlaceholder': '여기서 프롬프트 편집...',
    'create.negativePlaceholder': '선택: 음수 편집...',
    'create.regenerateBase': '기본 프롬프트 재생성',
    'create.regen': '재생성',
    'create.words': '단어',
    'create.tokensApprox': '~{count} 토큰',
    'create.edit': '편집',
    'create.view': '보기',
    'create.advancedSettings': '고급 설정',
    'create.closeSettings': '닫기',
    'create.saveDraft': '초안 자동 저장...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
  es: {
    'create.qualityPreset': 'Preajuste de calidad',
    'create.fast': 'Rápido',
    'create.balanced': 'Equilibrado',
    'create.quality': 'Calidad',
    'create.ultra': 'Ultra',
    'create.cfgGuidance': 'Guía CFG',
    'create.aspectRatio': 'Relación de aspecto',
    'create.loraMissingTitle': 'Faltan algunos LoRAs',
    'create.generationSettings': 'Configuración de generación',
    'create.qualityPresets': 'Preajustes de calidad',
    'create.modelLoadError': 'Error al cargar el modelo',
    'create.modelInfoPending': 'Cargando información del modelo...',
    'create.modelInfo': 'Información del modelo',
    'create.loraStack': 'Pila LoRA',
    'create.inventoryFrom': 'Inventario desde',
    'create.steps': 'Pasos',
    'create.resolution': 'Resolución',
    'create.sampler': 'Muestreador',
    'create.scheduler': 'Programador',
    'create.preset': 'Preajuste',
    'create.whyThisModel': 'Por qué este modelo',
    'create.positivePrompt': 'Indicador positivo',
    'create.negativePrompt': 'Indicador negativo',
    'create.positivePlaceholder': 'Edita tu indicador aquí...',
    'create.negativePlaceholder': 'Opcional: editar negativos...',
    'create.regenerateBase': 'Volver a generar indicador base',
    'create.regen': 'Volver a generar',
    'create.words': 'Palabras',
    'create.tokensApprox': '~{count} Tokens',
    'create.edit': 'Editar',
    'create.view': 'Ver',
    'create.advancedSettings': 'Configuración avanzada',
    'create.closeSettings': 'Cerrar',
    'create.saveDraft': 'Guardando borrador automáticamente...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
  fr: {
    'create.qualityPreset': 'Préréglage qualité',
    'create.fast': 'Rapide',
    'create.balanced': 'Équilibré',
    'create.quality': 'Qualité',
    'create.ultra': 'Ultra',
    'create.cfgGuidance': 'Guide CFG',
    'create.aspectRatio': 'Ratio d\'aspect',
    'create.loraMissingTitle': 'Certains LoRAs manquent',
    'create.generationSettings': 'Paramètres de génération',
    'create.qualityPresets': 'Préréglages de qualité',
    'create.modelLoadError': 'Erreur de chargement du modèle',
    'create.modelInfoPending': 'Chargement des informations du modèle...',
    'create.modelInfo': 'Informations sur le modèle',
    'create.loraStack': 'Pile LoRA',
    'create.inventoryFrom': 'Inventaire depuis',
    'create.steps': 'Étapes',
    'create.resolution': 'Résolution',
    'create.sampler': 'Échantillonneur',
    'create.scheduler': 'Ordonnanceur',
    'create.preset': 'Préréglage',
    'create.whyThisModel': 'Pourquoi ce modèle',
    'create.positivePrompt': 'Invite positive',
    'create.negativePrompt': 'Invite négative',
    'create.positivePlaceholder': 'Éditez votre invite ici...',
    'create.negativePlaceholder': 'Optionnel : éditer les négatifs...',
    'create.regenerateBase': 'Regénérer l\'invite de base',
    'create.regen': 'Régénérer',
    'create.words': 'Mots',
    'create.tokensApprox': '~{count} Jets',
    'create.edit': 'Modifier',
    'create.view': 'Voir',
    'create.advancedSettings': 'Paramètres avancés',
    'create.closeSettings': 'Fermer',
    'create.saveDraft': 'Sauvegarde automatique du brouillon...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
  de: {
    'create.qualityPreset': 'Qualitätsvorschau',
    'create.fast': 'Schnell',
    'create.balanced': 'Ausgewogen',
    'create.quality': 'Qualität',
    'create.ultra': 'Ultra',
    'create.cfgGuidance': 'CFG-Leitfaden',
    'create.aspectRatio': 'Seitenverhältnis',
    'create.loraMissingTitle': 'Einige LoRAs fehlen',
    'create.generationSettings': 'Generierungseinstellungen',
    'create.qualityPresets': 'Qualitätsvorschauen',
    'create.modelLoadError': 'Modellladefehler',
    'create.modelInfoPending': 'Modellinformationen werden geladen...',
    'create.modelInfo': 'Modellinformationen',
    'create.loraStack': 'LoRA-Stack',
    'create.inventoryFrom': 'Inventar von',
    'create.steps': 'Schritte',
    'create.resolution': 'Auflösung',
    'create.sampler': 'Sampler',
    'create.scheduler': 'Scheduler',
    'create.preset': 'Vorschau',
    'create.whyThisModel': 'Warum dieses Modell',
    'create.positivePrompt': 'Positiver Prompt',
    'create.negativePrompt': 'Negativer Prompt',
    'create.positivePlaceholder': 'Bearbeiten Sie Ihren Prompt hier...',
    'create.negativePlaceholder': 'Optional: Negative bearbeiten...',
    'create.regenerateBase': 'Basis-Prompt neu generieren',
    'create.regen': 'Neu generieren',
    'create.words': 'Wörter',
    'create.tokensApprox': '~{count} Tokens',
    'create.edit': 'Bearbeiten',
    'create.view': 'Ansehen',
    'create.advancedSettings': 'Erweiterte Einstellungen',
    'create.closeSettings': 'Schließen',
    'create.saveDraft': 'Entwurf wird automatisch gespeichert...',
    'create.modelFamilyFlux': 'FLUX',
    'create.modelFamilyPony': 'Pony (SDXL)',
    'create.modelFamilyIllustrious': 'Illustrious (SDXL)',
  },
};

async function updateTranslations() {
  console.log('🔄 Starting translation key synchronization...\n');

  const translationsPath = path.join(__dirname, '..', 'src', 'lib', 'i18n', 'translations.ts');
  let content = fs.readFileSync(translationsPath, 'utf8');

  let updated = false;

  for (const lang of LANGUAGES) {
    console.log(`📝 Processing ${lang.label} (${lang.code})...`);

    const translations = TRANSLATIONS[lang.code];
    if (!translations) {
      console.warn(`⚠️  No translations found for ${lang.code}`);
      continue;
    }

    // Build insertion text
    let insertText = '\n  // ─── Create Module Refactoring - New Translation Keys ────────────\n';
    
    // Add section headers with comments
    insertText += '  // GenerationSettings Component\n';
    for (const [key, value] of Object.entries(translations)) {
      if (key.startsWith('create.quality') || 
          key.startsWith('create.cfgGuidance') || 
          key.startsWith('create.aspectRatio') || 
          key.startsWith('create.loraMissingTitle') ||
          key.startsWith('create.generationSettings') ||
          key.startsWith('create.qualityPresets')) {
        insertText += `  '${key}': '${value}',\n`;
      }
    }
    
    insertText += '  // ModelInfoCard Component\n';
    for (const [key, value] of Object.entries(translations)) {
      if (key.startsWith('create.model') || key.startsWith('create.loraStack') ||
          key.startsWith('create.inventoryFrom') || key.startsWith('create.steps') ||
          key.startsWith('create.resolution') || key.startsWith('create.sampler') ||
          key.startsWith('create.scheduler') || key.startsWith('create.preset') ||
          key.startsWith('create.whyThisModel')) {
        insertText += `  '${key}': '${value}',\n`;
      }
    }
    
    insertText += '  // PromptEditor Component\n';
    for (const [key, value] of Object.entries(translations)) {
      if (key.startsWith('create.positivePrompt') || key.startsWith('create.negativePrompt') ||
          key.startsWith('create.positivePlaceholder') || key.startsWith('create.negativePlaceholder') ||
          key.startsWith('create.regenerateBase') || key.startsWith('create.regen') ||
          key.startsWith('create.words') || key.startsWith('create.tokensApprox') ||
          key.startsWith('create.edit') || key.startsWith('create.view')) {
        insertText += `  '${key}': '${value}',\n`;
      }
    }
    
    insertText += '  // Integration Messages\n';
    for (const [key, value] of Object.entries(translations)) {
      if (key.startsWith('create.advancedSettings') || key.startsWith('create.closeSettings') ||
          key.startsWith('create.saveDraft') || key.startsWith('create.modelFamily')) {
        insertText += `  '${key}': '${value}',\n`;
      }
    }
    
    insertText += '  // ─── End of New Keys ──────────────────────────────────────────\n';

    // Find the insertion point (after 'create.voice' in create section)
    const lines = content.split('\n');
    let inserted = false;
    
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].includes("'create.voice':") && lines[i+1] && lines[i+1].includes("'footer.privacy':")) {
        // Check if we're in the correct language section
        const isCorrectLanguage = lines[i].includes(lang.findBlock) || 
                                  (lang.code === 'zh' && i > 500); // Chinese section starts later
        
        if (isCorrectLanguage || lang.code === 'en') {
          lines.splice(i + 1, 0, insertText);
          inserted = true;
          break;
        }
      }
    }

    if (inserted) {
      updated = true;
    } else {
      console.warn(`  ⚠️  Could not find insertion point for ${lang.label}`);
    }
  }

  if (updated) {
    fs.writeFileSync(translationsPath, content, 'utf8');
    console.log('\n✅ Translation keys synchronized successfully!');
    console.log(`\n📊 Summary:`);
    console.log(`   - Total keys added: ${Object.keys(NEW_KEYS).length}`);
    console.log(`   - Languages updated: ${LANGUAGES.length}`);
    console.log(`   - Total entries: ${Object.keys(NEW_KEYS).length * LANGUAGES.length}`);
  } else {
    console.log('\n⚠️  No updates were made.');
    process.exit(1);
  }
}

updateTranslations().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
