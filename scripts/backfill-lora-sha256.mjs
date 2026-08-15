#!/usr/bin/env node
/**
 * backfill-lora-sha256.mjs — 用 worker 哈希清单回填 data/lora-catalog.json
 *
 * 流程：
 *   1. 在挂载真实卷的 RunPod Pod 上执行 scripts/runpod/hash-loras.sh
 *      生成 soulmate-lora-hashes.txt（filename|sha256|size_bytes）
 *   2. 将清单下载回本地，运行：
 *      node scripts/backfill-lora-sha256.mjs <清单路径> [--dry-run] [--force]
 *
 * 安全约束（不伪造哈希）：
 *   - 只接受清单中出现的 SHA256，绝不生成/猜测任何哈希值
 *   - 清单缺失或格式非法直接报错退出
 *   - 与目录已有 sha256 冲突时默认保留旧值并报告，--force 才覆盖
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG_PATH = join(ROOT, 'data', 'lora-catalog.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');
const manifestPath = args.find((a) => !a.startsWith('--'));

function fail(msg) {
  console.error(`[error] ${msg}`);
  process.exit(1);
}

if (!manifestPath) {
  fail(
    '用法: node scripts/backfill-lora-sha256.mjs <hash清单路径> [--dry-run] [--force]\n' +
      '        清单由 scripts/runpod/hash-loras.sh 在 worker 上生成。',
  );
}
if (!existsSync(manifestPath)) {
  fail(`清单文件不存在: ${manifestPath}`);
}

// ── 解析清单 ──────────────────────────────────────────────
const SHA_RE = /^[0-9A-Fa-f]{64}$/;
const manifest = new Map(); // filename -> { sha256, sizeBytes }
let badLines = 0;
for (const raw of readFileSync(manifestPath, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith('#')) continue;
  const [name, sha, size] = line.split('|');
  if (!name || !SHA_RE.test(sha || '')) {
    badLines++;
    console.warn(`[warn] 跳过非法清单行: ${line}`);
    continue;
  }
  manifest.set(name.trim(), {
    sha256: sha.toUpperCase(),
    sizeBytes: Number(size) || 0,
  });
}
if (manifest.size === 0) {
  fail('清单中没有可用的哈希条目（ refusing to fabricate hashes ）');
}
console.log(`[manifest] ${manifest.size} 个文件哈希${badLines ? `（${badLines} 行非法已跳过）` : ''}`);

// ── 加载目录 ──────────────────────────────────────────────
const catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
if (!Array.isArray(catalog.loras)) fail('lora-catalog.json 缺少 loras 数组');

const filled = [];
const verified = [];
const mismatch = [];
const matched = new Set();

for (const entry of catalog.loras) {
  const hit = manifest.get(entry.filename);
  if (!hit) continue;
  matched.add(entry.filename);

  const existing = typeof entry.sha256 === 'string' ? entry.sha256.toUpperCase() : '';
  if (!existing) {
    entry.sha256 = hit.sha256;
    if (!entry.size_mb && hit.sizeBytes > 0) {
      entry.size_mb = Math.round((hit.sizeBytes / 1024 / 1024) * 100) / 100;
    }
    filled.push(entry.filename);
  } else if (existing === hit.sha256) {
    verified.push(entry.filename);
  } else {
    mismatch.push({ file: entry.filename, catalog: existing, volume: hit.sha256 });
    if (force) entry.sha256 = hit.sha256;
  }
}

// ── 报告 ──────────────────────────────────────────────────
console.log(`\n[report] 回填 ${filled.length} | 已一致 ${verified.length} | 冲突 ${mismatch.length}`);
for (const f of filled) console.log(`  + 回填   ${f}`);
for (const m of mismatch) {
  console.log(`  ! 冲突   ${m.file}\n      目录: ${m.catalog}\n      卷上: ${m.volume}${force ? '（已用 --force 覆盖）' : '（保留目录值，如需覆盖加 --force）'}`);
}
const unmatched = [...manifest.keys()].filter((f) => !matched.has(f));
if (unmatched.length) {
  console.log(`  ? 卷上存在但目录未登记（建议补充目录条目）:`);
  for (const f of unmatched) console.log(`      ${f}`);
}
const pending = catalog.loras.filter((e) => !e.sha256).map((e) => e.filename);
if (pending.length) {
  console.log(`  - 仍缺哈希（需在 worker 下载后重跑 hash-loras.sh）: ${pending.length} 个`);
}

// ── 写回 ──────────────────────────────────────────────────
const changed = filled.length > 0 || (force && mismatch.length > 0);
if (!changed) {
  console.log('\n[ok] 无变更，目录未修改。');
  process.exit(0);
}
if (dryRun) {
  console.log('\n[dry-run] 有变更但未写入（去掉 --dry-run 以应用）。');
  process.exit(0);
}

catalog.version = Number(catalog.version || 0) + 1;
catalog.updated = new Date().toISOString().slice(0, 10);
catalog.notes = [
  `v${catalog.version}: SHA256 backfilled from worker volume manifest (scripts/backfill-lora-sha256.mjs).`,
  ...(Array.isArray(catalog.notes) ? catalog.notes : []),
].slice(0, 10);

writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
console.log(`\n[ok] 已写入 ${CATALOG_PATH}（version → ${catalog.version}）`);
console.log('     提交前请运行: pnpm test（lora 路由相关测试）');
