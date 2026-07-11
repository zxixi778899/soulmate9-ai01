/**
 * Safe response body parsing for fetch/authedFetch.
 * Avoids Unexpected token errors when proxies return HTML/plain text.
 */

export async function readResponseJson<T = Record<string, unknown>>(
  res: Response,
): Promise<T> {
  const text = await res.text();
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return {} as T;
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const snippet = trimmed.slice(0, 180).replace(/\s+/g, ' ');
    const err = new Error(
      res.ok
        ? `Invalid JSON response: ${snippet}`
        : `Request failed (${res.status}): ${snippet}`,
    ) as Error & { status?: number; body?: string };
    err.status = res.status;
    err.body = trimmed.slice(0, 2000);
    throw err;
  }
}

export function errorMessageFromUnknown(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
