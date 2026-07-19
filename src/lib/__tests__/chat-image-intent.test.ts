import { describe, expect, it } from 'vitest';
import { buildImageActionFromChat, parseChatImageIntent } from '../chat-image-intent';

describe('chat image intent', () => {
  it.each(['看看你', '拍照', '拍一张', '发张自拍给我'])('recognizes Chinese photo request: %s', (text) => expect(parseChatImageIntent(text).wantsImage).toBe(true));
  it('recognizes English selfie requests', () => expect(parseChatImageIntent('send me a sexy selfie baby').kind).toBe('selfie'));
  it('uses recent context for scene and time', () => {
    const result = buildImageActionFromChat('看看你', [{ role: 'user', content: '你不是说正在海边散步吗？' }, { role: 'assistant', content: '嗯，晚上的海风很舒服。' }]);
    expect(result.action).toMatch(/beach/);
    expect(result.action).toMatch(/evening/);
    expect(result.action).toMatch(/not a copy/);
  });
  it('ignores ordinary chat', () => expect(parseChatImageIntent('今天过得好吗？').wantsImage).toBe(false));
});
