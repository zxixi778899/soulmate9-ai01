/**
 * LLM endpoint connectivity probe for the v3 chat routing chain.
 * Reads keys from .env.local (never prints them) and performs a tiny
 * completion against each configured endpoint. RunPod also lists /models
 * first to catch model-name mismatches (vLLM strict validation).
 *
 * Usage: node scripts/probe-llm-connectivity.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value && process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env.local */
  }
}

const mask = (v) => (v ? `${v.slice(0, 6)}…${v.slice(-4)} (${v.length} chars)` : 'MISSING');
const results = [];

async function chatCompletion(label, url, apiKey, model, body, timeoutMs) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
        max_tokens: 8,
        temperature: 0,
        enable_thinking: false,
        chat_template_kwargs: { enable_thinking: false },
        ...body,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      results.push({ label, ok: false, ms, detail: `HTTP ${res.status}: ${text.slice(0, 200)}` });
      return;
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim();
    results.push({ label, ok: true, ms, detail: content ? `reply="${content.slice(0, 40)}"` : 'empty content' });
  } catch (err) {
    results.push({ label, ok: false, ms: Date.now() - started, detail: err?.name === 'TimeoutError' ? `TIMEOUT after ${timeoutMs}ms (cold start?)` : String(err?.message || err) });
  }
}

async function listModels(label, url, apiKey, timeoutMs) {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, ids: [], detail: `HTTP ${res.status}` };
    const data = await res.json();
    return { ok: true, ids: (data?.data || []).map((m) => m.id), detail: '' };
  } catch (err) {
    return { ok: false, ids: [], detail: String(err?.message || err) };
  }
}

loadEnvLocal();

const TOGETHER_KEY = process.env.TOGETHER_API_KEY || '';
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY || '';
const MINIMAX_KEY = process.env.MINIMAX_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';
const RUNPOD_KEY = process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '';

console.log('Key inventory:');
console.log(`  TOGETHER_API_KEY      ${mask(TOGETHER_KEY)}`);
console.log(`  DASHSCOPE_API_KEY     ${mask(DASHSCOPE_KEY)}`);
console.log(`  MINIMAX_API_KEY       ${mask(MINIMAX_KEY)}`);
console.log(`  OPENROUTER_API_KEY    ${mask(OPENROUTER_KEY)}`);
console.log(`  RUNPOD_VLLM_API_KEY   ${mask(RUNPOD_KEY)}`);
console.log('');

// ── 0. MiniMax official API (v4 SFW primary for paid tiers) ──
if (MINIMAX_KEY) {
  await chatCompletion(
    'minimax-m2',
    'https://api.minimax.io/v1/chat/completions',
    MINIMAX_KEY,
    'MiniMax-M2',
    {},
    30_000,
  );
} else {
  results.push({ label: 'minimax-m2', ok: false, ms: 0, detail: 'SKIPPED — no MINIMAX_API_KEY' });
}

// ── 1. DashScope (v3 SFW primary for paid tiers) ──
if (DASHSCOPE_KEY) {
  await chatCompletion(
    'dashscope-qwen-plus',
    'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    DASHSCOPE_KEY,
    'qwen-plus',
    {},
    25_000,
  );
} else {
  results.push({ label: 'dashscope-qwen-plus', ok: false, ms: 0, detail: 'SKIPPED — no DASHSCOPE_API_KEY' });
}

// ── 2. Together models (complex / long-context / picker) ──
if (TOGETHER_KEY) {
  for (const model of ['Qwen/Qwen3.5-9B', 'Qwen/Qwen3-235B-A22B-Instruct-2507-tput', 'moonshotai/Kimi-K2.6', 'openai/gpt-oss-20b']) {
    await chatCompletion(`together:${model}`, 'https://api.together.xyz/v1/chat/completions', TOGETHER_KEY, model, {}, 45_000);
  }
} else {
  results.push({ label: 'together:*', ok: false, ms: 0, detail: 'SKIPPED — no TOGETHER_API_KEY (set it in .env.local to probe)' });
}

// ── 3. OpenRouter NSFW fallbacks (live slugs, 2026-08) ──
if (OPENROUTER_KEY) {
  for (const model of ['sao10k/l3.3-euryale-70b', 'aion-labs/aion-rp-llama-3.1-8b']) {
    await chatCompletion(`openrouter:${model}`, 'https://openrouter.ai/api/v1/chat/completions', OPENROUTER_KEY, model, {}, 45_000);
  }
} else {
  results.push({ label: 'openrouter:*', ok: false, ms: 0, detail: 'SKIPPED — no OPENROUTER_API_KEY' });
}

// ── 4. RunPod self-hosted NSFW (list models first: strict name check) ──
const runpodTargets = [
  { label: 'runpod-qwen3-8b-pro-nsfw', urlEnv: 'RUNPOD_PRO_CHAT_URL', modelEnv: 'RUNPOD_PRO_CHAT_MODEL', fallbackModel: 'Qwen3-8B-Pro-NSFW' },
  { label: 'runpod-qwen3-30b-roleplay', urlEnv: 'RUNPOD_UNLIMITED_CHAT_URL', modelEnv: 'RUNPOD_UNLIMITED_CHAT_MODEL', fallbackModel: 'Qwen3-30B-Unlimited' },
];
for (const target of runpodTargets) {
  const base = (process.env[target.urlEnv] || '').replace(/\/$/, '');
  if (!base || !RUNPOD_KEY) {
    results.push({ label: target.label, ok: false, ms: 0, detail: `SKIPPED — ${target.urlEnv} or key missing` });
    continue;
  }
  const configuredModel = process.env[target.modelEnv] || target.fallbackModel;
  const modelsUrl = base.includes('/openai/v1') ? `${base}/models` : `${base}/openai/v1/models`;
  const listed = await listModels(`${target.label}:models`, modelsUrl, RUNPOD_KEY, 60_000);
  if (!listed.ok) {
    results.push({ label: `${target.label} (list /models)`, ok: false, ms: 0, detail: listed.detail });
    continue;
  }
  if (!listed.ids.includes(configuredModel)) {
    results.push({
      label: `${target.label} (model name)`,
      ok: false,
      ms: 0,
      detail: `MISMATCH — configured "${configuredModel}" not in served models: [${listed.ids.join(', ')}]`,
    });
    continue;
  }
  const chatUrl = base.includes('/openai/v1') ? `${base}/chat/completions` : `${base}/openai/v1/chat/completions`;
  await chatCompletion(target.label, chatUrl, RUNPOD_KEY, configuredModel, {}, 120_000);
}

console.log('Results:');
for (const r of results) {
  const icon = r.ok ? '✅' : '❌';
  console.log(`  ${icon} ${r.label.padEnd(48)} ${r.ms ? `${r.ms}ms` : ''} ${r.detail}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} endpoints healthy.`);
