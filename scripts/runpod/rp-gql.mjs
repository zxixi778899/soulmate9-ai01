// RunPod GraphQL helper (ops tooling). Reads key from RUNPOD_API_KEY2 env.
// Usage:
//   node scripts/runpod/rp-gql.mjs "query{ myself{id} }"
//   node scripts/runpod/rp-gql.mjs --file query.txt
// Never hardcode keys here — this file is committed to the repo.
import { readFileSync } from 'node:fs';

const rk = process.env.RUNPOD_API_KEY2;
if (!rk) {
  console.error('RUNPOD_API_KEY2 env required');
  process.exit(1);
}

let query;
if (process.argv[2] === '--file') {
  query = readFileSync(process.argv[3], 'utf8').trim();
} else {
  query = process.argv[2];
}
if (!query) {
  console.error('usage: rp-gql.mjs "<graphql>" | rp-gql.mjs --file query.txt');
  process.exit(1);
}

const res = await fetch('https://api.runpod.io/graphql', {
  method: 'POST',
  headers: { Authorization: `Bearer ${rk}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});
console.log('http:', res.status);
const json = await res.json();
console.log(JSON.stringify(json, null, 1));
