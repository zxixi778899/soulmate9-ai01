import { describe, expect, it } from 'vitest';
import { isLoraAllowedForContext } from '@/lib/lora-scope';

describe('LoRA context isolation', () => {
  it('keeps outfit and prop LoRAs on their own surfaces', () => {
    const outfit = { id: 'outfit-lingerie', category: 'outfit', filename: 'flux_outfit_lingerie.safetensors' };
    expect(isLoraAllowedForContext(outfit, { surface: 'outfit', modelFamily: 'flux' })).toBe(true);
    expect(isLoraAllowedForContext(outfit, { surface: 'companion', modelFamily: 'flux', category: 'female' })).toBe(false);
  });

  it('separates gender LoRAs', () => {
    const male = { id: 'body-masculine-flux', category: 'body', filename: 'MASC V1.0.safetensors' };
    expect(isLoraAllowedForContext(male, { surface: 'companion', modelFamily: 'flux', category: 'male' })).toBe(true);
    expect(isLoraAllowedForContext(male, { surface: 'companion', modelFamily: 'flux', category: 'female' })).toBe(false);
  });

  it('rejects cross-family LoRAs', () => {
    const flux = { id: 'detail-skin', category: 'detail', filename: 'flux_detail_skin_v1.safetensors' };
    expect(isLoraAllowedForContext(flux, { surface: 'companion', modelFamily: 'pony', category: 'transgender' })).toBe(false);
  });
});
