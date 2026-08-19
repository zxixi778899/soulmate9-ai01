import { describe, it, expect } from 'vitest';
import { TASK_DENOISE_DEFAULTS } from '@/lib/image-generation-routing';

describe('TASK_DENOISE_DEFAULTS', () => {
  it('should define correct default values for all task types', () => {
    expect(TASK_DENOISE_DEFAULTS.outfit).toBe(0.72);
    expect(TASK_DENOISE_DEFAULTS.pose).toBe(0.62);
    expect(TASK_DENOISE_DEFAULTS.background).toBe(0.5);
    expect(TASK_DENOISE_DEFAULTS.portrait).toBe(0.55);
  });
  
  it('denoise values should be in valid range [0, 1]', () => {
    Object.values(TASK_DENOISE_DEFAULTS).forEach(denoise => {
      expect(denoise).toBeGreaterThanOrEqual(0);
      expect(denoise).toBeLessThanOrEqual(1);
    });
  });
});
