// OpenRouter NSFW fallback candidates — live catalog slugs (2026-08)
const API_KEY = process.env.OPENROUTER_API_KEY || '';

const models = [
  { label: 'euryale-70b (l3.3)', id: 'sao10k/l3.3-euryale-70b' },
  { label: 'aion-rp-8b', id: 'aion-labs/aion-rp-llama-3.1-8b' },
  { label: 'mythomax-13b', id: 'gryphe/mythomax-l2-13b' },
  { label: 'dolphin-mistral-24b', id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition' },
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
        console.log(`${label.padEnd(22)} ❌ ${res.status} ${txt.slice(0, 90)}`);
      } else {
        const data = await res.json();
        const reply = data?.choices?.[0]?.message?.content?.trim().slice(0, 20) || '';
        const usage = data?.usage ? ` tokens=${data.usage.total_tokens}` : '';
        console.log(`${label.padEnd(22)} ✅ ${Date.now() - t}ms reply="${reply}"${usage}`);
      }
    } catch (err) {
      console.log(`${label.padEnd(22)} 🚫 ${err.name} ${err.message.split('\n')[0]}`);
    }
  }
})();
