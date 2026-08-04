import { describe, it, expect } from 'vitest';
import { mergeMessages, type CachedMessage } from '../chat-cache';

const msg = (over: Partial<CachedMessage>): CachedMessage => ({
  id: over.id || 'x',
  role: over.role || 'assistant',
  content: over.content || '',
  created_at: over.created_at || '2026-08-03T12:00:00.000Z',
  is_proactive: over.is_proactive,
  media_url: over.media_url,
  media_type: over.media_type ?? null,
  status: over.status,
});

describe('mergeMessages', () => {
  it('dedupes identical messages by id', () => {
    const a = msg({ id: 'u1', role: 'user', content: 'hi' });
    const b = msg({ id: 'u1', role: 'user', content: 'hi' });
    const out = mergeMessages([a], [b]);
    expect(out).toHaveLength(1);
  });

  it('drops temp/assist placeholders once the server copy exists (clock skew across minute boundary)', () => {
    // Device clock skewed ~2 min vs server; content identical.
    const server = [
      msg({ id: 'srv-1', role: 'user', content: '我就是你的礼物啊', created_at: '2026-08-03T23:54:02.000Z' }),
      msg({ id: 'srv-2', role: 'assistant', content: '*突然踮脚，指尖勾住你衣领轻轻一拉*', created_at: '2026-08-03T23:54:04.000Z' }),
    ];
    const local = [
      msg({ id: 'temp-1', role: 'user', content: '我就是你的礼物啊', created_at: '2026-08-03T23:52:01.000Z' }),
      msg({ id: 'assist-1', role: 'assistant', content: '*突然踮脚，指尖勾住你衣领轻轻一拉*', created_at: '2026-08-03T23:52:03.000Z' }),
    ];
    const out = mergeMessages(server, local);
    expect(out).toHaveLength(2);
    // Server copies win (real ids survive)
    expect(out.map((m) => m.id).sort()).toEqual(['srv-1', 'srv-2']);
  });

  it('keeps a temp placeholder that has no server copy yet (optimistic send in flight)', () => {
    const server = [msg({ id: 'srv-1', role: 'assistant', content: 'hello there', created_at: '2026-08-03T23:54:04.000Z' })];
    const local = [msg({ id: 'temp-9', role: 'user', content: 'brand new message', created_at: new Date().toISOString() })];
    const out = mergeMessages(server, local);
    expect(out).toHaveLength(2);
    expect(out.some((m) => m.id === 'temp-9')).toBe(true);
  });

  it('drops stale temp placeholders that never synced (older than 30 min)', () => {
    const staleTs = new Date(Date.now() - 40 * 60 * 1000).toISOString();
    const local = [msg({ id: 'temp-old', role: 'user', content: 'never landed', created_at: staleTs })];
    const out = mergeMessages([], local);
    expect(out).toHaveLength(0);
  });

  it('does not swallow a legitimately repeated identical message', () => {
    // User genuinely sent the same text twice → two server rows must survive.
    const server = [
      msg({ id: 'srv-a', role: 'user', content: '哈哈', created_at: '2026-08-03T23:50:00.000Z' }),
      msg({ id: 'srv-b', role: 'user', content: '哈哈', created_at: '2026-08-03T23:51:30.000Z' }),
    ];
    const out = mergeMessages(server, []);
    expect(out).toHaveLength(2);
  });

  it('count-aware matching keeps an extra unsynced duplicate send', () => {
    // One server row but two local temp copies of identical content
    // (second send not yet persisted) → keep one placeholder.
    // Timestamps are relative to now so they never trip the 30-min stale rule.
    const now = Date.now();
    const server = [msg({ id: 'srv-a', role: 'user', content: '哈哈', created_at: new Date(now - 30_000).toISOString() })];
    const local = [
      msg({ id: 'temp-1', role: 'user', content: '哈哈', created_at: new Date(now - 20_000).toISOString() }),
      msg({ id: 'temp-2', role: 'user', content: '哈哈', created_at: new Date(now - 5_000).toISOString() }),
    ];
    const out = mergeMessages(server, local);
    // one temp matched+dropped, one kept, plus the server row
    expect(out).toHaveLength(2);
  });

  it('sorts merged output by created_at ascending', () => {
    const server = [msg({ id: 'b', content: 'second', created_at: '2026-08-03T12:02:00.000Z' })];
    const local = [msg({ id: 'a', content: 'first', created_at: '2026-08-03T12:01:00.000Z' })];
    const out = mergeMessages(server, local);
    expect(out.map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('prefers longer content for the same real id (streaming update)', () => {
    const local = [msg({ id: 'srv-x', role: 'assistant', content: 'short' })];
    const server = [msg({ id: 'srv-x', role: 'assistant', content: 'a much longer final reply' })];
    const out = mergeMessages(server, local);
    expect(out).toHaveLength(1);
    expect(out[0].content).toBe('a much longer final reply');
  });
});
