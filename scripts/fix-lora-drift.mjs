#!/usr/bin/env node
/**
 * Detect LoRA inventory drift and generate remediation commands.
 *
 * Pipeline:
 *   1. Probe each requested LoRA via RunPod /runsync (reuses the same logic as
 *      scripts/check-lora-installed.mjs).
 *   2. Cross-reference with RUNPOD_INSTALLED_LORAS_FLUX env (declarative) and
 *      scripts/lora-catalog.json (URL map).
 *   3. Emit a copy-paste bash block per drift case:
 *
 *        drift-down  (declared yes / physical no) → download + push to worker
 *        drift-up    (declared no  / physical yes) → update Vercel env
 *        missing     (both no) → download + push + update Vercel env
 *        ok          → no action
 *
 *   4. If --apply is passed and the right CLI tools are present (vercel,
 *      ssh/runpodctl), attempt the env update automatically. Worker push is
 *      always manual because the path varies (Network Volume mount, serverless
 *      template, fresh pod).
 *
 * Usage:
 *   node scripts/fix-lora-drift.mjs                           # default LoRAs
 *   node scripts/fix-lora-drift.mjs flux_3d_render_v1.safetensors flux_lewd_v1.safetensors
 *   node scripts/fix-lora-drift.mjs --apply                   # try auto env update
 *   node scripts/fix-lora-drift.mjs --probe-only              # skip remediation
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── args + env loading ──────────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const applyMode = args.includes('--apply');
const probeOnly = args.includes('--probe-only');
const targets = args.filter((a) => !a.startsWith('--')) || [];
const DEFAULT_LORAS = [
  'flux_3d_render_v1.safetensors',
  'flux_style_photoreal_v1.safetensors',
  'flux_anime_v1.safetensors',
  'flux_lewd_v1.safetensors',
];
const requested = targets.length ? targets : DEFAULT_LORAS;

// Inline .env.local reader (no dotenv dep so this runs even when node_modules is stale).
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  for (const raw of fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
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

const apiKey = process.env.RUNPOD_API_KEY || '';
const endpointId =
  process.env.RUNPOD_ENDPOINT_ID_FLUX || process.env.RUNPOD_ENDPOINT_ID || '';
const vercelToken = process.env.VERCEL_TOKEN || '';
const vercelProject = process.env.VERCEL_PROJECT || '';
const civitToken = process.env.CIVITAI_API_TOKEN || '';

if (!apiKey || !endpointId) {
  console.error('❌ RUNPOD_API_KEY / RUNPOD_ENDPOINT_ID (or _FLUX) not set in .env.local');
  process.exit(1);
}

// ─── catalog ──────────────────────────────────────────────────────────────────────────────────────────────────

const catalogPath = path.join(__dirname, 'lora-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));

// ─── probe (mirrors scripts/check-lora-installed.mjs) ──────────────────────────────────────────────────────

function buildProbeWorkflow(loraName) {
  return {
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
    '4': { class_type: 'CLIPTextEncode', inputs: { text: 'low quality', clip: ['2', 1] } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width: 64, height: 64, batch_size: 1 } },
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
  };
}

async function probeOne(loraName) {
  try {
    const res = await fetch(`https://api.runpod.ai/v2/${endpointId}/runsync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ input: { prompt: buildProbeWorkflow(loraName) }, async_: false }),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text();
    const payload = JSON.parse(text);
    const errText = String(payload?.error || payload?.output?.error || '');
    const status = String(payload?.status || '');
    const missing = /value_not_in_list/.test(errText) && /lora_name/.test(errText);
    if (missing) return { present: false, detail: errText.slice(0, 200) };
    if (status === 'COMPLETED' || payload?.output?.images) return { present: true };
    return { present: false, detail: errText.slice(0, 200) || 'no_images' };
  } catch (e) {
    return { present: false, detail: `network_error: ${e.message}` };
  }
}

const declarative = new Set(
  String(process.env.RUNPOD_INSTALLED_LORAS_FLUX || '')
    .split(',').map((s) => s.trim()).filter(Boolean),
);

// ─── remediation builders ──────────────────────────────────────────────────────────────────────────────────

function bashHeader() {
  return [
    '#!/usr/bin/env bash',
    '# Auto-generated by scripts/fix-lora-drift.mjs — review before running.',
    'set -euo pipefail',
    'LORA_DIR="${LORA_DIR:-/runpod-volume/models/loras}"',
    'mkdir -p "$LORA_DIR"',
    '',
  ].join('\n');
}

function bashDownload(loraName) {
  const entry = catalog[loraName];
  if (!entry || !entry.url) {
    return [
      `# ${loraName}: NO URL in scripts/lora-catalog.json — manual search required.`,
      `#   Search Civitai (https://civitai.com) or HuggingFace for the file.`,
      `#   Once you have a URL, append it to scripts/lora-catalog.json and re-run.`,
      '',
    ].join('\n');
  }
  const url = entry.url;
  const lines = [
    `# Download ${loraName}`,
    `dest="$LORA_DIR/${loraName}"`,
    `if [[ -f "$dest" && "${'$'}FORCE" != "1" ]]; then echo "skip ${loraName} (already present)"; else`,
    `  tmp="${'$'}dest.part"; rm -f "$tmp"`,
    `  curl -L --fail --retry 5 --retry-delay 2 \\`,
  ];
  if (civitToken) {
    lines.push(`    -H "Authorization: Bearer ${civitToken}" \\`);
  }
  lines.push(`    -o "$tmp" "${url}" || { echo "FAIL ${loraName}"; continue; }`);
  lines.push(`  bytes=$(stat -c%s "$tmp" 2>/dev/null || wc -c < "$tmp" | tr -d ' ')`);
  lines.push(`  if [[ "${'$'}bytes" -lt 1000000 ]]; then echo "FAIL small ${loraName}"; rm -f "$tmp"; continue; fi`);
  lines.push(`  mv -f "$tmp" "$dest" && echo "ok ${loraName}"`);
  lines.push('fi');
  lines.push('');
  return lines.join('\n');
}

function bashVercelAdd(loraName, currentList) {
  const next = Array.from(new Set([...currentList, loraName])).sort().join(',');
  return [
    `# Add ${loraName} to RUNPOD_INSTALLED_LORAS_FLUX on Vercel (production)`,
    `vercel env rm RUNPOD_INSTALLED_LORAS_FLUX production --yes 2>/dev/null || true`,
    `vercel env add RUNPOD_INSTALLED_LORAS_FLUX production <<<"${next}"`,
    '',
  ].join('\n');
}

// ─── Vercel API auto-apply (no vercel CLI required) ───────────────────────────────────────────────────────

async function vercelApiPatchEnv(value, loraName) {
  // Patches via Vercel REST API. Requires VERCEL_TOKEN + VERCEL_PROJECT +
  // VERCEL_TEAM (optional) in .env.local.
  if (!vercelToken || !vercelProject) {
    return { ok: false, reason: 'missing_vercel_token_or_project' };
  }
  const teamParam = process.env.VERCEL_TEAM ? `?teamId=${process.env.VERCEL_TEAM}` : '';
  const encProject = encodeURIComponent(vercelProject);
  const encKey = encodeURIComponent('RUNPOD_INSTALLED_LORAS_FLUX');

  // 1. List existing env IDs for the key
  const listRes = await fetch(
    `https://api.vercel.com/v10/projects/${encProject}/env${teamParam}`,
    { headers: { authorization: `Bearer ${vercelToken}` } },
  );
  if (!listRes.ok) return { ok: false, reason: `vercel_list_http_${listRes.status}` };
  const envs = await listRes.json();
  const existing = (envs.envs || []).filter((e) => e.key === 'RUNPOD_INSTALLED_LORAS_FLUX');

  // 2. Delete the old one(s)
  for (const env of existing) {
    await fetch(
      `https://api.vercel.com/v10/projects/${encProject}/env/${env.id}${teamParam}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${vercelToken}` } },
    );
  }
  // 3. Create the new one for production
  const createRes = await fetch(
    `https://api.vercel.com/v10/projects/${encProject}/env${teamParam}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${vercelToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'RUNPOD_INSTALLED_LORAS_FLUX',
        value,
        type: 'plain',
        target: ['production'],
      }),
    },
  );
  if (!createRes.ok) {
    const body = await createRes.text();
    return { ok: false, reason: `vercel_create_http_${createRes.status}: ${body.slice(0, 120)}` };
  }
  return { ok: true };
}

// ─── main ───────────────────────────────────────────────────────────────────────────────────────────────────────

(async () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 LoRA Inventory Drift Fixer');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Endpoint:    ${endpointId}`);
  console.log(`Vercel:      ${vercelProject || '(no project)'}`);
  console.log(`Civitai tok: ${civitToken ? 'yes' : 'no '}`);
  console.log(`Apply mode:  ${applyMode ? 'YES (auto env update)' : 'no (print only)'}`);
  console.log('');

  const driftDown = [];   // declared yes / physical no
  const driftUp = [];     // declared no  / physical yes
  const missing = [];     // both no
  const ok = [];          // both yes

  for (const name of requested) {
    process.stdout.write(`probing ${name} ... `);
    const r = await probeOne(name);
    const isDeclared = declarative.has(name);
    if (r.present && isDeclared) { console.log('✅ ok'); ok.push(name); }
    else if (!r.present && isDeclared) { console.log('⚠️  drift-down'); driftDown.push(name); }
    else if (r.present && !isDeclared) { console.log('⚠️  drift-up'); driftUp.push(name); }
    else { console.log('❌ missing'); missing.push(name); }
  }

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`  ok          : ${ok.length}`);
  console.log(`  drift-down  : ${driftDown.length} (declared yes, physical no — file actually missing on worker)`);
  console.log(`  drift-up    : ${driftUp.length} (declared no,  physical yes — Vercel env stale)`);
  console.log(`  missing     : ${missing.length} (neither side knows about it)`);
  console.log('');

  if (probeOnly) {
    console.log('--probe-only set, exiting.');
    return;
  }

  const currentList = [...declarative];
  const nextList = Array.from(new Set([...currentList, ...driftUp, ...missing])).sort();
  const bashLines = [bashHeader()];

  // ── drift-down + missing → download on worker ─
  const needsDownload = [...driftDown, ...missing];
  if (needsDownload.length) {
    bashLines.push('# ─── 1. Push missing LoRAs to the worker volume ─────────────────');
    bashLines.push('# Run on the worker (SSH / docker exec / runpod ssh <pod>):');
    bashLines.push('');
    for (const name of needsDownload) {
      bashLines.push(bashDownload(name));
    }
  }

  // ── drift-up + missing → update Vercel env ─
  const needsEnvUpdate = [...driftUp, ...missing];
  if (needsEnvUpdate.length) {
    bashLines.push('# ─── 2. Sync Vercel env to match physical inventory ───────────');
    bashLines.push('# Run locally (vercel CLI OR Vercel REST API auto-applied below).');
    bashLines.push('');
    for (const name of needsEnvUpdate) {
      bashLines.push(bashVercelAdd(name, currentList));
    }
    bashLines.push(`# Final value to land in Vercel prod:`);
    bashLines.push(`#   RUNPOD_INSTALLED_LORAS_FLUX="${nextList.join(',')}"`);
  }

  if (needsDownload.length === 0 && needsEnvUpdate.length === 0) {
    console.log('✨ No drift detected. Nothing to fix.');
    return;
  }

  const out = bashLines.join('\n');
  const outPath = path.join(__dirname, '.drift-fix.sh');
  fs.writeFileSync(outPath, out);
  console.log(`📝 Remediation script: ${outPath}`);
  console.log('');
  console.log('---- Preview ----');
  console.log(out);
  console.log('---- /Preview ----');
  console.log('');

  if (applyMode && needsEnvUpdate.length) {
    const targetValue = nextList.join(',');
    console.log(`▶ Auto-applying Vercel env update via REST API → "${targetValue.slice(0, 80)}${targetValue.length > 80 ? '…' : ''}"`);
    const result = await vercelApiPatchEnv(targetValue, 'RUNPOD_INSTALLED_LORAS_FLUX');
    if (result.ok) {
      console.log('✅ Vercel env updated. (Redeploy still required to pick it up.)');
    } else {
      console.error(`❌ Vercel auto-apply failed: ${result.reason}`);
      console.error('   Re-run --apply after setting VERCEL_TOKEN, VERCEL_PROJECT, VERCEL_TEAM (optional).');
    }
  }

  console.log('');
  console.log('Next:');
  console.log('  1. SSH into the worker (runpod ssh <pod-id> OR docker exec OR vscode tunnel)');
  console.log('  2. bash ' + outPath);
  console.log('  3. Restart ComfyUI so it rescans /comfyui/models/loras/');
  console.log('  4. vercel --prod (or trigger redeploy) so the new env takes effect');
  console.log('  5. Re-run scripts/check-lora-installed.mjs to confirm drift is gone');
})().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});