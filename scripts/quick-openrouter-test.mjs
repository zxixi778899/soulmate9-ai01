// Quick OpenRouter chat probe with known Lumimaid/Noromaid IDs
const API_KEY = process.env.OPENROUTER_API_KEY || '';

const models = [
  { label: 'l3-lumimaid-8b', id: 'sao10k/l3-lumimaid-8b-v0.1' },
  { label: 'lumimaid-v02-9b (old)', id: 'openrouter/lumimaid-v02-9b' }, // might exist
  { label: 'noromaid-20b (old)', id: 'neversleep/noromaid-20b-uns' },  // likely this format
  { label: 'noromaid-gguf', id: 'sao10k/noromaid-eagle2-24b-gguf' },   // recent one
];

(async () => {
  for (const { label, id } of models) {
    const t = Date.now();
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: id,
          messages: [{ role: 'user', content: 'Pong (single word)' }],
          max_tokens: 16,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        console.log(`${label.padEnd(25)} ❌ ${res.status} ${txt.slice(0, 80)}`);
      } else {
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content?.trim().slice(0, 20) || '';
        console.log(`${label.padEnd(25)} ✅ ${Date.now() - t}ms reply="${reply}"`);
      }
    } catch (err) {
      console.log(`${label.padEnd(25)} 🚫 ${err.name} ${err.message.split('\n')[0]}`);
    }
  }
})();
