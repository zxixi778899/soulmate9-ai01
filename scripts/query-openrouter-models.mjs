// Broad OpenRouter catalog scan for NSFW/RP-capable models
const API_KEY = process.env.OPENROUTER_API_KEY || '';

const KEYWORDS = [
  'euryale', 'stheno', 'dolphin', 'mythomax', 'mytho', 'rogue', 'midnight',
  'toppy', 'unsensored', 'uncensored', 'noromaid', 'lumimaid', 'roleplay',
  'rp-', 'erotic', 'nsfw', 'wizardlm', 'mn-', 'goliath', 'pygmalion', 'kunoichi',
];

(async () => {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { Authorization: `Bearer ${API_KEY}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    console.error(`${res.status} ${res.statusText}`);
    return;
  }
  const data = await res.json();
  const all = data.data || [];
  console.log(`Total models in catalog: ${all.length}`);
  const hits = all.filter((m) => {
    const hay = `${m.id} ${m.name}`.toLowerCase();
    return KEYWORDS.some((k) => hay.includes(k));
  });
  console.log(`Matches: ${hits.length}`);
  hits.forEach((m, i) => {
    const price = m.pricing
      ? `in=$${(+m.pricing.prompt / 1e6).toFixed(2)}/M out=$${(+m.pricing.completion / 1e6).toFixed(2)}/M`
      : 'price=?';
    console.log(`${String(i + 1).padStart(2)}. ${m.id.padEnd(58)} | ctx ${String(m.context_length).padStart(7)} | ${price}`);
  });
})();
