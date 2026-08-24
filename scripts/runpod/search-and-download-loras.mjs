#!/usr/bin/env node
/**
 * SoulMate AI - Civitai NSFW LoRA 智能搜索和下载工具
 * 
 * 用法:
 *   export CIVITAI_API_TOKEN='your_token'
 *   node search-and-download-loras.mjs [--dry-run]
 */

import { writeFileSync, existsSync, statSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

const CIVITAI_API = 'https://civitai.com/api/v1';
const TOKEN = process.env.CIVITAI_API_TOKEN;
const LORA_DIR = '/runpod-volume/models/loras';
const DRY_RUN = process.argv.includes('--dry-run');

if (!TOKEN) {
  console.error('❌ ERROR: 请先设置 CIVITAI_API_TOKEN');
  console.error('   export CIVITAI_API_TOKEN=\'your_token\'');
  process.exit(1);
}

mkdirSync(LORA_DIR, { recursive: true });

// 搜索配置：每个类别搜索的关键词
const SEARCH_CONFIGS = [
  // 姿势类
  { category: 'positions', queries: ['missionary', 'cowgirl', 'doggy style', 'spitroast'], family: ['Pony', 'Illustrious'], maxPerQuery: 2 },
  
  // 内衣和服装
  { category: 'lingerie', queries: ['lingerie', 'see through', 'bikini', 'naked apron'], family: ['Pony', 'Illustrious'], maxPerQuery: 2 },
  
  // 表情类
  { category: 'expressions', queries: ['ahegao', 'orgasm face', 'blushing'], family: ['Pony', 'Illustrious'], maxPerQuery: 2 },
  
  // 体型类
  { category: 'body', queries: ['breast slider', 'hips', 'curvy', 'thicc'], family: ['Pony'], maxPerQuery: 2 },
  
  // 真实感
  { category: 'realism', queries: ['realism nsfw', 'photoreal'], family: ['Pony'], maxPerQuery: 2 },
];

// 搜索结果缓存
const searchResults = new Map();

async function civitaiFetch(url) {
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

async function searchModels(query, limit = 10) {
  const cacheKey = query.toLowerCase();
  if (searchResults.has(cacheKey)) {
    return searchResults.get(cacheKey);
  }
  
  const url = `${CIVITAI_API}/models?query=${encodeURIComponent(query)}&types=LORA&limit=${limit}&sort=Most%20Downloaded`;
  
  try {
    const data = await civitaiFetch(url);
    searchResults.set(cacheKey, data.items || []);
    return data.items || [];
  } catch (error) {
    console.error(`⚠️  搜索失败 "${query}": ${error.message}`);
    return [];
  }
}

function filterVersions(model, families) {
  const versions = [];
  
  for (const version of model.modelVersions || []) {
    if (!families.includes(version.baseModel)) continue;
    
    const file = version.files?.find(f => f.type === 'Model' && f.name.endsWith('.safetensors'));
    if (!file) continue;
    
    versions.push({
      modelId: model.id,
      modelName: model.name,
      versionId: version.id,
      versionName: version.name,
      baseModel: version.baseModel,
      fileName: file.name,
      sizeMB: Math.round(file.sizeKB / 1024),
      downloadUrl: file.downloadUrl,
      downloads: version.stats?.downloadCount || 0,
      nsfwLevel: model.nsfwLevel || 0,
      trainedWords: version.trainedWords || [],
    });
  }
  
  // 按下载量排序
  return versions.sort((a, b) => b.downloads - a.downloads);
}

function sanitizeFilename(name) {
  return name
    .replace(/[^a-zA-Z0-9_\-\.\(\)\[\] ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}

async function downloadLora(lora) {
  const targetName = sanitizeFilename(lora.fileName);
  const dest = join(LORA_DIR, targetName);
  
  // 检查是否已存在
  if (existsSync(dest)) {
    const stats = statSync(dest);
    if (stats.size > 102400) {
      console.log(`⏭️  跳过 ${targetName} (已存在, ${Math.round(stats.size / 1048576)}MB)`);
      return { status: 'skip', file: targetName };
    }
  }
  
  if (DRY_RUN) {
    console.log(`[DRY-RUN] 将下载: ${targetName} (${lora.sizeMB}MB, ${lora.downloads} downloads)`);
    return { status: 'dry-run', file: targetName };
  }
  
  console.log(`📥 下载 ${targetName} (${lora.sizeMB}MB, ${lora.downloads} downloads)...`);
  
  const tmp = `${dest}.part`;
  
  try {
    execFileSync('curl', [
      '-L', '--fail', '--retry', '3', '--retry-delay', '3',
      '-H', `Authorization: Bearer ${TOKEN}`,
      '-o', tmp,
      lora.downloadUrl
    ], { stdio: 'pipe', timeout: 300000 }); // 5 分钟超时
    
    const stats = statSync(tmp);
    if (stats.size < 102400) {
      console.log(`  ❌ 失败：文件太小 (${stats.size} bytes)`);
      unlinkSync(tmp);
      return { status: 'fail', file: targetName };
    }
    
    renameSync(tmp, dest);
    console.log(`  ✅ 完成: ${Math.round(stats.size / 1048576)}MB`);
    return { status: 'ok', file: targetName };
    
  } catch (error) {
    console.log(`  ❌ 失败：下载错误`);
    if (existsSync(tmp)) unlinkSync(tmp);
    return { status: 'fail', file: targetName };
  }
}

async function main() {
  console.log('🔍 SoulMate AI - Civitai NSFW LoRA 智能搜索和下载工具');
  console.log('================================\n');
  
  if (DRY_RUN) {
    console.log('⚠️  DRY-RUN 模式：只搜索，不下载\n');
  }
  
  const allLoras = [];
  const downloaded = new Set();
  
  // 搜索所有类别
  for (const config of SEARCH_CONFIGS) {
    console.log(`\n📂 搜索类别: ${config.category}`);
    console.log('--------------------------------');
    
    for (const query of config.queries) {
      console.log(`\n🔎 搜索: "${query}"...`);
      
      const models = await searchModels(query, 10);
      if (models.length === 0) {
        console.log('  (无结果)');
        continue;
      }
      
      // 筛选合适的版本
      let count = 0;
      for (const model of models) {
        if (count >= config.maxPerQuery) break;
        
        const versions = filterVersions(model, config.family);
        if (versions.length === 0) continue;
        
        // 选择下载量最高的版本
        const best = versions[0];
        
        // 避免重复
        if (downloaded.has(best.fileName)) continue;
        
        // 只下载 NSFW 或高 nsfwLevel 的
        if (best.nsfwLevel < 8) {
          console.log(`  ⏭️  跳过 ${model.name} (nsfwLevel: ${best.nsfwLevel} < 8)`);
          continue;
        }
        
        console.log(`  ✅ 找到: ${model.name} (${best.baseModel}, ${best.downloads} downloads, nsfwLevel: ${best.nsfwLevel})`);
        if (best.trainedWords.length > 0) {
          console.log(`     触发词: ${best.trainedWords.slice(0, 3).join(', ')}`);
        }
        
        allLoras.push(best);
        downloaded.add(best.fileName);
        count++;
      }
      
      // 避免 API 限流
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log('\n\n================================');
  console.log(`✨ 搜索完成！找到 ${allLoras.length} 个 LoRA`);
  console.log('================================\n');
  
  if (DRY_RUN) {
    console.log('📋 将要下载的文件:');
    allLoras.forEach((l, i) => {
      console.log(`${i + 1}. ${l.fileName} (${l.sizeMB}MB, ${l.baseModel}, ${l.downloads} downloads)`);
    });
    console.log('\n💡 运行不带 --dry-run 参数以实际下载');
    return;
  }
  
  // 下载所有找到的 LoRA
  console.log('📥 开始下载...\n');
  
  const results = { ok: 0, skip: 0, fail: 0 };
  const failedFiles = [];
  
  for (const lora of allLoras) {
    const result = await downloadLora(lora);
    results[result.status]++;
    if (result.status === 'fail') {
      failedFiles.push(result.file);
    }
    
    // 下载间隔，避免限流
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // 显示统计
  console.log('\n\n================================');
  console.log('✨ 下载完成!');
  console.log('================================\n');
  
  console.log('📊 统计:');
  console.log(`  - ✅ 成功: ${results.ok}`);
  console.log(`  - ⏭️  跳过: ${results.skip}`);
  console.log(`  - ❌ 失败: ${results.fail}`);
  
  if (failedFiles.length > 0) {
    console.log('\n⚠️  失败的文件:');
    failedFiles.forEach(f => console.log(`  - ${f}`));
  }
  
  console.log('\n💡 下一步:');
  console.log('1. 重启 ComfyUI 以加载新 LoRA');
  console.log('2. 更新环境变量 RUNPOD_INSTALLED_LORAS_PONY/ILLUSTRIOUS');
}

main().catch(error => {
  console.error('❌ 致命错误:', error);
  process.exit(1);
});
