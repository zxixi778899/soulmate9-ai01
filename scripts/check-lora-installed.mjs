#!/usr/bin/env node
/**
 * Probe a specific LoRA on the RunPod FLUX worker.
 *
 * Two-layer check:
 *   1. Declarative — is the file listed in Vercel's RUNPOD_INSTALLED_LORAS_FLUX env?
 *      This is what the in-process LoRA filter consumes; if it's not listed there,
 *      every portrait generation silently drops the LoRA even if it physically
 *      exists on the worker volume.
 *
 *   2. Physical — submit a probe ComfyUI workflow with LoraLoader.inputs.lora_name
 *      pointing at the file. RunPod/ComfyUI returns value_not_in_list when the
 *      worker can't see the file, regardless of what Vercel thinks.
 *
 * Usage:
 *   node scripts/check-lora-installed.mjs <lora-filename> [<lora-filename>...]
 *
 * Defaults to checking flux_3d_render_v1.safetensors.
 *
 * Requires .env.local with RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID (or
 * RUNPOD_ENDPOINT_ID_FLUX) set, like scripts/check-runpod-endpoints.mjs.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env.local lives at the project root, one level up from scripts/.
const projectRoot = path.resolve(__dirname, '..');

// Node 20+ has --env-file built in; caller can also pass env via the shell.
// We don't depend on the dotenv package here so this script runs even when
// node_modules is stale.
const envFile = path.join(projectRoot, '.env.local');
try {
  const fs = await import('node:fs');
  if (fs.existsSync(envFile)) {
    const text = fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '');
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch { /* env file missing is OK — rely on shell env */ }

const DEFAULT_LORAS = [
  'flux_3d_render_v1.safetensors',
  'flux_style_photoreal_v1.safetensors',
  'flux_detail_skin_v1.safetensors',
  'flux_anime_v1.safetensors',
  'flux_lewd_v1.safetensors',
];

const requested = process.argv.slice(2);
const targets = requested.length ? requested : DEFAULT_LORAS;

const apiKey = process.env.RUNPOD_API_KEY || '';
const endpointId =
  process.env.RUNPOD_ENDPOINT_ID_FLUX || process.env.RUNPOD_ENDPOINT_ID || '';

if (!apiKey || !endpointId) {
  console.error('❌ RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID (or _FLUX) not set in .env.local');
  process.exit(1);
}

// ─── Declarative check (Vercel-side env mirror) ────────────────────────────

const declarative = new Set(
  String(process.env.RUNPOD_INSTALLED_LORAS_FLUX || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 LoRA Inventory Probe');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Endpoint:    ${endpointId}`);
console.log(`Declarative inventory (RUNPOD_INSTALLED_LORAS_FLUX): ${declarative.size} file(s)`);
console.log('');

// ─── Probe workflow (LoraLoader on the requested filename) ────────────────

function buildProbeWorkflow(loraName) {
  return {
    // Minimal probe — LoraLoader consumes a base checkpoint stub and surfaces
    // value_not_in_list if the worker can't see the file. No decode step
    // needed; we only care about the validation outcome.
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
    '2': {
      class_type: 'LoraLoader',
      inputs: {
        model: ['1', 0],
        clip: ['1', 1],
        lora_name: loraName,
        strength_model: 0.1,
        strength_clip: 0.1,
      },
    },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: 'probe', clip: ['2', 1] } },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: 'low quality', clip: ['2', 1] },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 64, height: 64, batch_size: 1 },
    },
    '6': {
      class_type: 'KSampler',
      inputs: {
        model: ['2', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
        seed: 1,
        steps: 1,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '7': { class_type: 'VAEDecode', inputs: { samples: ['6', 0], vae: ['1', 2] } },
    '8': { class_type: 'SaveImage', inputs: { filename_prefix: 'probe', images: ['7', 0] } },
  };
}

async function probeOne(loraName) {
  const url = `https://api.runpod.ai/v2/${endpointId}/runsync`;
  // The production FLUX endpoint expects `input.workflow` (comfy_workflow
  // strategy in src/lib/runpod.ts:1238) — sending just `prompt` returns
  // "Missing 'workflow' parameter". Try comfy_workflow first; fall back to
  // comfy_dual so we don't get false negatives on endpoints that prefer
  // either field.
  const payloadShapes = [
    { input: { workflow: buildProbeWorkflow(loraName), async_: false } },
    { input: { prompt: buildProbeWorkflow(loraName), workflow: buildProbeWorkflow(loraName), async_: false } },
  ];

  for (const body of payloadShapes) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      return { loraName, declarative: declarative.has(loraName), probe: 'network_error', detail: e.message };
    }
    const text = await res.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { /* keep null */ }

    if (res.status >= 500) {
      return { loraName, declarative: declarative.has(loraName), probe: 'http_5xx', detail: text.slice(0, 160) };
    }

    const errText = String(payload?.error || payload?.output?.error || '');
    const status = String(payload?.status || '');
    const missing = /value_not_in_list/.test(errText) && /lora_name/.test(errText);

    if (missing) {
      return {
        loraName,
        declarative: declarative.has(loraName),
        probe: 'missing_on_worker',
        detail: errText.slice(0, 200),
      };
    }
    if (status === 'COMPLETED' || payload?.output?.images) {
      return { loraName, declarative: declarative.has(loraName), probe: 'present_on_worker' };
    }
    // Endpoint rejected this payload shape ("Missing 'workflow' parameter"
    // or "prompt is required"); try the next shape.
    if (/workflow|prompt/i.test(errText) && (errText.includes('Missing') || errText.includes('required'))) {
      continue;
    }
    if (errText) {
      return {
        loraName,
        declarative: declarative.has(loraName),
        probe: 'other_error',
        detail: errText.slice(0, 200),
      };
    }
  }
  return { loraName, declarative: declarative.has(loraName), probe: 'unknown', detail: 'all payload shapes rejected' };
}

(async () => {
  const results = [];
  for (const name of targets) {
    process.stdout.write(`probing ${name} ... `);
    const r = await probeOne(name);
    results.push(r);
    console.log(formatRow(r));
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const present = results.filter((r) => r.probe === 'present_on_worker');
  const missing = results.filter((r) => r.probe === 'missing_on_worker');
  const drift = results.filter(
    (r) => r.declarative !== (r.probe === 'present_on_worker'),
  );
  console.log(`  Present on worker : ${present.length}/${results.length}`);
  console.log(`  Missing on worker : ${missing.length}/${results.length}`);
  console.log(`  Declared↔Physical drift : ${drift.length} ${drift.length ? '⚠️' : '✅'}`);
  if (drift.length) {
    console.log('  Drift list (declared yes / physical no, or vice versa):');
    for (const r of drift) {
      console.log(`    - ${r.loraName}: declared=${r.declarative} probe=${r.probe}`);
    }
  }
  console.log('');
})().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});

function formatRow(r) {
  const tag = r.probe === 'present_on_worker' ? '✅ present' :
    r.probe === 'missing_on_worker' ? '❌ missing' :
    r.probe === 'network_error' ? '🌐 network err' :
    r.probe === 'http_5xx' ? '🚨 5xx' :
    `❓ ${r.probe}`;
  const driftMark = r.declarative !== (r.probe === 'present_on_worker') ? ' ⚠️ drift' : '';
  const detail = r.detail ? ` (${r.detail.slice(0, 80)})` : '';
  return `${tag}  declared=${r.declarative ? 'yes' : 'no '}${driftMark}${detail}`;
}