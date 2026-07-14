import { describe, expect, it } from 'vitest';
import { parseChatImageIntent } from '../chat-image-intent';

describe('parseChatImageIntent', () => {
  it('detects English selfie requests', () => {
    const r = parseChatImageIntent('send me a sexy selfie baby');
    expect(r.wantsImage).toBe(true);
    expect(r.kind).toBe('selfie');
    expect(r.action.length).toBeGreaterThan(10);
  });

  it('maps body part requests into FLUX action', () => {
    const r = parseChatImageIntent('show me your ass');
    expect(r.wantsImage).toBe(true);
    expect(r.kind).toBe('body');
    expect(r.action).toMatch(/hips|butt|ass/i);
  });

  it('detects Chinese photo requests', () => {
    const r = parseChatImageIntent('发张自拍给我');
    expect(r.wantsImage).toBe(true);
  });

  it('ignores normal chat', () => {
    const r = parseChatImageIntent('how was your day today?');
    expect(r.wantsImage).toBe(false);
  });
});
