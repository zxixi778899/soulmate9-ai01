import { describe, expect, it } from 'vitest';
import { sanitizeAssistantReply } from '../chat-reply-sanitize';

describe('sanitizeAssistantReply language enforcement', () => {
  it('removes leaked placeholders and inline English action prose in Chinese mode', () => {
    const raw =
      '😏 tableName 它的味道真好！ Sniffs the drink, closing her eyes in appreciation. 今天过得还不错，我刚才还在想你呢。';
    const result = sanitizeAssistantReply(raw, { preferZh: true });
    expect(result).not.toMatch(/tableName|Sniffs|closing|appreciation/i);
    expect(result).toContain('它的味道真好');
    expect(result).toContain('今天过得还不错');
  });

  it('removes an inline italic English action from a Chinese reply', () => {
    const result = sanitizeAssistantReply(
      '表现还不错，但我更关心你呢。 *Takes a sip and slides her gaze across the room*',
      { preferZh: true },
    );
    expect(result).toBe('表现还不错，但我更关心你呢。');
  });

  it('falls back instead of showing an English-dominant Chinese turn', () => {
    const result = sanitizeAssistantReply(
      'Takes a sip from her drink and smiles softly at you from across the room.',
      { preferZh: true },
    );
    expect(result).toMatch(/刚才走神/);
    expect(result).not.toMatch(/Takes a sip/);
  });

  it('removes isolated English and Cyrillic model garbage from Chinese', () => {
    const result = sanitizeAssistantReply('嗯…至少我没掉 работы 😊 不一定讲不好 PLICIT', {
      preferZh: true,
    });
    expect(result).not.toMatch(/работы|PLICIT/i);
    expect(result).toContain('至少我没掉');
  });
});
