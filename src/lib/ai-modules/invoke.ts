import type { MembershipTier, ModelEndpoint } from './types';
import { logger } from '@/lib/logger';
import { estimateTokens, estimateCost, logModelUsage } from '@/lib/model-usage';

export interface InvokeChatOptions {
  endpoint: ModelEndpoint; fallbackEndpoints?: ModelEndpoint[]; messages: Array<{ role: string; content: string }>;
  temperature?: number; maxTokens?: number; userId?: string; girlfriendId?: string; taskType?: string;
  membershipTier?: MembershipTier; scene?: string; routeReason?: string; locale?: string;
}
export interface InvokeChatResult { content: string; provider: string; model: string; endpoint_id: string; fallback_count: number; latency_ms: number; input_tokens: number; output_tokens: number; cost_usd: number; }
interface CircuitState { failures: number; openedAt: number | null; resetMs?: number; }
const circuits = new Map<string, CircuitState>();
function key(ep: ModelEndpoint): string { return ep.api_key_env ? process.env[ep.api_key_env] || '' : ep.provider === 'together' ? process.env.TOGETHER_API_KEY || '' : ep.provider === 'runpod' ? process.env.RUNPOD_VLLM_API_KEY || process.env.RUNPOD_API_KEY || '' : ep.provider === 'openai' ? process.env.OPENAI_API_KEY || '' : ''; }
function base(ep: ModelEndpoint): string { return (ep.api_base_url || (ep.api_base_env ? process.env[ep.api_base_env] || '' : '') || (ep.provider === 'runpod' ? process.env.RUNPOD_VLLM_URL || '' : ep.provider === 'together' ? 'https://api.together.xyz/v1' : ep.provider === 'openai' ? 'https://api.openai.com/v1' : '')).replace(/\/$/, ''); }
function circuitOpen(ep: ModelEndpoint): boolean { const state = circuits.get(ep.id); if (!state?.openedAt) return false; if (Date.now() - state.openedAt >= (state.resetMs || ep.circuit_breaker?.reset_ms || 60000)) { circuits.delete(ep.id); return false; } return true; }
function recordFailure(ep: ModelEndpoint, error?: unknown): void {
  const state = circuits.get(ep.id) || { failures: 0, openedAt: null };
  state.failures += 1;
  // Persistent errors (dead endpoint / expired key) → open immediately for 15 min
  // so every chat request doesn't burn a round-trip on a corpse.
  const msg = error instanceof Error ? error.message : String(error || '');
  if (/HTTP (401|403|404)/.test(msg)) { state.openedAt = Date.now(); state.resetMs = 900000; }
  else if (state.failures >= (ep.circuit_breaker?.failure_threshold || 3)) { state.openedAt = Date.now(); state.resetMs = ep.circuit_breaker?.reset_ms || 60000; }
  circuits.set(ep.id, state);
}
function recordSuccess(ep: ModelEndpoint): void { circuits.delete(ep.id); }
async function completion(ep: ModelEndpoint, messages: Array<{ role: string; content: string }>, temperature: number, maxTokens: number): Promise<string> {
  const apiBase = base(ep); const apiKey = key(ep); if (!apiBase) throw new Error(`api_base_url missing for ${ep.id}`); if (!apiKey) throw new Error(`API key missing for ${ep.id}`);
  const doFetch = (thinkingOff: boolean) => fetch(`${apiBase}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model: ep.model_id, messages, max_tokens: maxTokens, temperature, ...(thinkingOff ? { enable_thinking: false, chat_template_kwargs: { enable_thinking: false } } : {}) }), signal: AbortSignal.timeout(ep.timeout_ms || 30000) });
  // Qwen3-family models default to thinking mode on vLLM servers; the reasoning
  // trace can eat the whole max_tokens budget and leave `content` empty.
  const isQwen3 = /qwen3/i.test(ep.model_id);
  let response = await doFetch(isQwen3);
  if (!response.ok) { const body = await response.text().catch(() => ''); throw new Error(`${ep.provider} HTTP ${response.status}: ${body.slice(0, 160)}`); }
  let data: unknown = await response.json();
  if (!data || typeof data !== 'object' || !('choices' in data)) throw new Error(`${ep.provider} invalid response`);
  let choices = (data as { choices?: Array<{ message?: { content?: string; reasoning_content?: string; reasoning?: string } }> }).choices;
  let content = choices?.[0]?.message?.content?.trim();
  // Empty content with a reasoning trace → thinking mode consumed the budget.
  // Retry once with thinking explicitly disabled.
  if (!content && !isQwen3 && (choices?.[0]?.message?.reasoning_content || choices?.[0]?.message?.reasoning)) {
    response = await doFetch(true);
    if (!response.ok) { const body = await response.text().catch(() => ''); throw new Error(`${ep.provider} HTTP ${response.status}: ${body.slice(0, 160)}`); }
    data = await response.json();
    if (!data || typeof data !== 'object' || !('choices' in data)) throw new Error(`${ep.provider} invalid response`);
    choices = (data as { choices?: Array<{ message?: { content?: string } }> }).choices;
    content = choices?.[0]?.message?.content?.trim();
  }
  if (!content) throw new Error(`${ep.provider} empty content`); return content;
}
async function callWithRetry(ep: ModelEndpoint, opts: InvokeChatOptions): Promise<string> {
  if (circuitOpen(ep)) throw new Error(`circuit_open:${ep.id}`); const attempts = Math.max(1, (ep.retry_count ?? 1) + 1); let last: unknown;
  for (let i = 0; i < attempts; i += 1) { try { const value = await completion(ep, opts.messages, opts.temperature ?? ep.temperature, opts.maxTokens ?? ep.max_tokens); recordSuccess(ep); return value; } catch (error) { last = error; if (i + 1 < attempts) continue; } }
  recordFailure(ep, last); throw last instanceof Error ? last : new Error(String(last));
}
export async function invokeChat(opts: InvokeChatOptions): Promise<InvokeChatResult> {
  const candidates = [opts.endpoint, ...(opts.fallbackEndpoints || [])].filter((item, index, all) => all.findIndex((v) => v.id === item.id) === index); const started = Date.now(); const inputTokens = estimateTokens(opts.messages.map((message) => message.content).join('\n')); let last: unknown;
  for (let index = 0; index < candidates.length; index += 1) { const ep = candidates[index]; const attemptStarted = Date.now(); let success = false; let content = '';
    try { content = await callWithRetry(ep, opts); success = true; const outputTokens = estimateTokens(content); const cost = estimateCost(inputTokens, outputTokens, ep.cost_per_1k_input, ep.cost_per_1k_output); void logModelUsage({ provider: ep.provider, model_id: ep.model_id, task_type: opts.taskType || 'chat', user_id: opts.userId, girlfriend_id: opts.girlfriendId, input_tokens: inputTokens, output_tokens: outputTokens, latency_ms: Date.now() - attemptStarted, cost_usd: cost, success: true, membership_tier: opts.membershipTier, scene: opts.scene, route_reason: opts.routeReason, endpoint_id: ep.id, fallback_count: index, time_to_first_token_ms: Date.now() - started, estimated_cost_usd: cost }); return { content, provider: ep.provider, model: ep.model_id, endpoint_id: ep.id, fallback_count: index, latency_ms: Date.now() - started, input_tokens: inputTokens, output_tokens: outputTokens, cost_usd: cost }; }
    catch (error) { last = error; logger.warn('[ai-gateway] endpoint failed', { endpoint: ep.id, fallbackIndex: index, error: error instanceof Error ? error.message : String(error) }); }
    finally { if (!success) void logModelUsage({ provider: ep.provider, model_id: ep.model_id, task_type: opts.taskType || 'chat', user_id: opts.userId, girlfriend_id: opts.girlfriendId, input_tokens: inputTokens, output_tokens: 0, latency_ms: Date.now() - attemptStarted, cost_usd: 0, success: false, error_message: last instanceof Error ? last.message : String(last), membership_tier: opts.membershipTier, scene: opts.scene, route_reason: opts.routeReason, endpoint_id: ep.id, fallback_count: index }); }
  }
  throw last instanceof Error ? last : new Error('All configured endpoints failed');
}
function localFallback(locale?: string): string { const value = (locale || '').toLowerCase(); if (value.startsWith('zh')) return '我在呢，刚才连接有点不稳定。把刚才那句话再发一次，我会好好回答你。'; if (value.startsWith('ja')) return 'ここにいるよ。接続が少し不安定だったみたい。もう一度送ってくれたら、ちゃんと答えるね。'; if (value.startsWith('ko')) return '나 여기 있어. 연결이 잠깐 불안정했어. 방금 말을 다시 보내 주면 제대로 답할게.'; if (value.startsWith('es')) return 'Estoy aquí. La conexión falló un momento; envíamelo otra vez y te responderé bien.'; if (value.startsWith('fr')) return 'Je suis là. La connexion a eu un raté ; renvoie-moi ton message et je te répondrai correctement.'; if (value.startsWith('de')) return 'Ich bin da. Die Verbindung hatte kurz Probleme; schick es noch einmal, dann antworte ich dir richtig.'; return "I'm right here. My connection hiccupped—send that once more and I'll answer you properly."; }
function sse(content: string, provider: string, model: string, endpointId: string): Response { const encoder = new TextEncoder(); return new Response(new ReadableStream({ start(controller) { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`)); controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Model-Provider': provider, 'X-Model-Id': model, 'X-Model-Endpoint': endpointId } }); }
export async function invokeChatAsSseStream(opts: InvokeChatOptions): Promise<{ response: Response; provider: string; model: string; meta: InvokeChatResult | null }> {
  try { const result = await invokeChat(opts); return { response: sse(result.content, result.provider, result.model, result.endpoint_id), provider: result.provider, model: result.model, meta: result }; }
  catch (error) { logger.error('[ai-gateway] all endpoints failed', { error: error instanceof Error ? error.message : String(error), routeReason: opts.routeReason }); const content = localFallback(opts.locale); return { response: sse(content, 'local', 'same-language-fallback', 'local-fallback'), provider: 'local', model: 'same-language-fallback', meta: null }; }
}