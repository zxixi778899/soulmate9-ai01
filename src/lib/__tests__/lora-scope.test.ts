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

  it('does not misgate female-named sliders as male', () => {
    const femaleSlider = { id: 'pony-mature-female-slider-v2', category: 'body', filename: 'pony_mature_female_slider_v2.safetensors' };
    expect(isLoraAllowedForContext(femaleSlider, { surface: 'companion', modelFamily: 'pony', category: 'female' })).toBe(true);
    expect(isLoraAllowedForContext(femaleSlider, { surface: 'companion', modelFamily: 'pony', category: 'male' })).toBe(false);

    const transSlider = { id: 'pony-gender-transition-slider', category: 'body', filename: 'pony_gender_transition_slider.safetensors' };
    expect(isLoraAllowedForContext(transSlider, { surface: 'companion', modelFamily: 'pony', category: 'transgender' })).toBe(true);
    expect(isLoraAllowedForContext(transSlider, { surface: 'companion', modelFamily: 'pony', category: 'female' })).toBe(false);
  });
});
