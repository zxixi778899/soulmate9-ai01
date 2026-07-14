/**
 * Trigger a Vercel production deployment via a Deploy Hook.
 *
 * Vercel exposes per-project Deploy Hooks (Settings → Git → Deploy Hooks).
 * POSTing to the hook URL enqueues a new build of the configured branch
 * and bypasses the GitHub webhook path entirely — useful when the GitHub
 * → Vercel webhook is broken (token expired / App uninstalled / etc).
 *
 * Usage:
 *   node scripts/trigger-deploy.mjs                # use VERCEL_DEPLOY_HOOK from .env.local
 *   node scripts/trigger-deploy.mjs --url <HOOK>   # override URL
 *   node scripts/trigger-deploy.mjs --watch         # poll /api/health until build.sha changes
 *
 * Reads .env.local automatically if present (no dotenv import needed for one var,
 * but consistent with other scripts in this folder).
 */

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env.local') });

const args = process.argv.slice(2);
const urlFlagIdx = args.indexOf('--url');
const HOOK_URL =
  (urlFlagIdx >= 0 && args[urlFlagIdx + 1]) ||
  process.env.VERCEL_DEPLOY_HOOK ||
  '';

const WATCH = args.includes('--watch');
const HEALTH_URL =
  process.env.SOULMATE_HEALTH_URL ||
  'https://www.soulmateai.shop/api/health';
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 6 * 60_000; // 6 min — Vercel Hobby build usually <3min, build cache may be cold

if (!HOOK_URL) {
  console.error('No Deploy Hook URL provided.');
  console.error('Set VERCEL_DEPLOY_HOOK in .env.local, or pass --url <HOOK>.');
  console.error('Create one at: Vercel → Project → Settings → Git → Deploy Hooks.');
  process.exit(1);
}

async function trigger() {
  const res = await fetch(HOOK_URL, { method: 'POST' });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Deploy Hook POST failed: HTTP ${res.status} — ${body}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = { raw: body };
  }
  console.log(`[trigger-deploy] Deploy Hook accepted (HTTP ${res.status}).`);
  if (parsed.job?.id) {
    console.log(`[trigger-deploy] Job ID: ${parsed.job.id}`);
    console.log(`[trigger-deploy] State:   ${parsed.job.state}`);
  }
  return parsed;
}

async function pollForNewBuild(prevSha) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    try {
      const res = await fetch(HEALTH_URL, { cache: 'no-store' });
      if (res.ok) {
        const body = await res.json();
        const sha = body?.build?.sha;
        if (sha && sha !== prevSha) {
          console.log(`\n[trigger-deploy] ✅ New build is live!`);
          console.log(`[trigger-deploy]   sha:        ${sha}`);
          console.log(`[trigger-deploy]   branch:     ${body.build.branch}`);
          console.log(`[trigger-deploy]   message:    ${body.build.message}`);
          console.log(`[trigger-deploy]   environment: ${body.build.environment}`);
          return sha;
        }
        console.log(
          `[trigger-deploy] poll #${attempt}: live sha=${sha ?? 'null'} (waiting for change from ${prevSha ?? 'unknown'})`,
        );
      } else {
        console.log(`[trigger-deploy] poll #${attempt}: HTTP ${res.status}`);
      }
    } catch (e) {
      console.log(`[trigger-deploy] poll #${attempt}: error ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timed out after ${POLL_TIMEOUT_MS / 1000}s waiting for new build to go live`,
  );
}

async function getCurrentSha() {
  try {
    const res = await fetch(HEALTH_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return body?.build?.sha ?? null;
  } catch {
    return null;
  }
}

(async () => {
  console.log(`[trigger-deploy] Hook URL: ${HOOK_URL.replace(/\/[^/]+$/, '/****')}`);
  await trigger();
  if (WATCH) {
    console.log(`[trigger-deploy] Polling ${HEALTH_URL} every ${POLL_INTERVAL_MS / 1000}s…`);
    const prev = await getCurrentSha();
    console.log(`[trigger-deploy] Current live sha: ${prev ?? 'unknown (build field not yet exposed)'}`);
    const next = await pollForNewBuild(prev);
    console.log(`[trigger-deploy] Done. Previous: ${prev ?? 'unknown'} → New: ${next}`);
  } else {
    console.log(`[trigger-deploy] Use --watch to poll /api/health until the new build is live.`);
  }
})().catch((e) => {
  console.error(`[trigger-deploy] ❌ ${e.message}`);
  process.exit(1);
});