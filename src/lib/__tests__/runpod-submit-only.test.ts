import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runpodClient } from '@/lib/runpod';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env.RUNPOD_API_KEY = 'test-key';
  process.env.RUNPOD_ENDPOINT_ID = 'test-endpoint';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

/**
 * Build a fake fetch that inspects the URL + body and returns the scripted
 * JSON response. Throws on unmatched URLs so any unexpected /runsync leaks
 * become visible.
 */
function scriptFetch(handlers: Array<{
  match: (url: string, body: unknown) => boolean;
  status?: number;
  body: unknown;
}>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const hit = handlers.find((h) => h.match(url, body));
    if (!hit) {
      throw new Error(`Unexpected fetch: ${url} ${JSON.stringify(body)?.slice(0, 120)}`);
    }
    return new Response(JSON.stringify(hit.body), {
      status: hit.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

describe('runpodClient.generate({ submit_only: true })', () => {
  it('hits /run (async) and returns a pending job_id without polling', async () => {
    const fetchSpy = scriptFetch([
      {
        match: (url) => url.endsWith('/run'),
        body: { id: 'job-async-1', status: 'IN_QUEUE' },
      },
    ]);
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await runpodClient.generate({
      prompt: 'a portrait',
      width: 1024,
      height: 1344,
      num_inference_steps: 8,
      guidance_scale: 1,
      seed: 42,
      endpoint_id: 'test-endpoint',
      submit_only: true,
    });

    expect(result.pending).toBe(true);
    expect(result.job_id).toBe('job-async-1');
    expect(result.status).toBe('IN_QUEUE');
    expect(result.endpoint_id).toBe('test-endpoint');
    expect(result.images).toEqual([]);

    // Exactly one fetch (the /run submit), never /runsync.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String((fetchSpy.mock.calls[0] as [string])[0])).toMatch(/\/run$/);
  });

  it('falls through to the next payload strategy if /run returns no job id', async () => {
    const fetchSpy = scriptFetch([
      {
        // First attempt: comfy_dual returns no id.
        match: (url, body) =>
          url.endsWith('/run') && (body as { input: Record<string, unknown> }).input.workflow !== undefined,
        body: { status: 'IN_QUEUE' }, // no id
      },
      {
        // Second attempt: comfy_prompt succeeds.
        match: (url) => url.endsWith('/run'),
        body: { id: 'job-async-2', status: 'IN_QUEUE' },
      },
    ]);
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await runpodClient.generate({
      prompt: 'a portrait',
      width: 1024,
      height: 1344,
      submit_only: true,
      endpoint_id: 'test-endpoint',
    });

    expect(result.pending).toBe(true);
    expect(result.job_id).toBe('job-async-2');
    // Two submits, both /run (never /runsync).
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      expect(String((call as [string])[0])).toMatch(/\/run$/);
    }
  });
});

describe('runpodClient.generate — /runsync IN_QUEUE path', () => {
  it('surfaces IN_QUEUE as pending (with job_id) instead of failing all strategies', async () => {
    const fetchSpy = scriptFetch([
      {
        // Without submit_only, the call goes through /runsync. The endpoint is
        // busy, so /runsync returns IN_QUEUE + id within its hard ceiling.
        match: (url) => url.endsWith('/runsync'),
        body: { id: 'job-queued-1', status: 'IN_QUEUE' },
      },
    ]);
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await runpodClient.generate({
      prompt: 'a portrait',
      width: 1024,
      height: 1344,
      endpoint_id: 'test-endpoint',
      // submit_only intentionally false to exercise the /runsync IN_QUEUE branch.
    });

    expect(result.pending).toBe(true);
    expect(result.job_id).toBe('job-queued-1');
    expect(result.status).toBe('IN_QUEUE');
    // Should stop at the first strategy — no need to try the other two once we
    // have a resumable ticket.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});