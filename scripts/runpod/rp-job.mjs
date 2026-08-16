// Submit/poll a job on a RunPod serverless endpoint (ops tooling).
// Usage:
//   node scripts/runpod/rp-job.mjs <endpointId> <inputJson>      submit async job
//   node scripts/runpod/rp-job.mjs <endpointId> @file.json       submit input from file
//   node scripts/runpod/rp-job.mjs <endpointId> status <jobId>   poll job status
// Reads RUNPOD_API_KEY2 from env. Never hardcode keys here.
import { readFileSync } from 'node:fs';
const rk = process.env.RUNPOD_API_KEY2;
if (!rk) {
  console.error('RUNPOD_API_KEY2 env required');
  process.exit(1);
}

const ep = process.argv[2];
const mode = process.argv[3];
if (!ep || !mode) {
  console.error('usage: rp-job.mjs <endpointId> <inputJson> | rp-job.mjs <endpointId> status <jobId>');
  process.exit(1);
}
const base = `https://api.runpod.ai/v2/${ep}`;

if (mode === 'status') {
  const jobId = process.argv[4];
  const r = await fetch(`${base}/status/${jobId}`, { headers: { Authorization: `Bearer ${rk}` } });
  console.log('http:', r.status);
  console.log(JSON.stringify(await r.json(), null, 1));
  process.exit(0);
}

const raw = mode.startsWith('@') ? readFileSync(mode.slice(1), 'utf8') : mode;
const input = JSON.parse(raw);
const r = await fetch(`${base}/run`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${rk}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ input }),
});
console.log('http:', r.status);
console.log(JSON.stringify(await r.json(), null, 1));
