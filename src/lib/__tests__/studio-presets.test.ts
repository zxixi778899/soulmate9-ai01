import { afterEach, describe, expect, it } from 'vitest';
import { COMPANION_CATEGORIES } from '@/lib/companion-category';
import { CATEGORY_PRESETS } from '@/app/(main)/admin/comfy/presets';
import {
  checkLoraAuthenticity,
  getVerifiedInstalledLoraSet,
  LORA_REGISTRY,
  verifyLoraHealth,
} from '@/lib/runpod-loras';

const originalInventory = process.env.RUNPOD_INSTALLED_LORAS;

afterEach(() => {
  if (originalInventory === undefined) delete process.env.RUNPOD_INSTALLED_LORAS;
  else process.env.RUNPOD_INSTALLED_LORAS = originalInventory;
});

describe('creation workbench presets', () => {
  it.each(COMPANION_CATEGORIES)('provides 30 unique high-NSFW %s scenes', (category) => {
    const presets = CATEGORY_PRESETS[category];
    expect(presets).toHaveLength(30);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(30);
    expect(presets.every((preset) => preset.nsfw)).toBe(true);
    expect(presets.every((preset) => preset.steps >= 20)).toBe(true);
    expect(presets.every((preset) => preset.prompt.length > 20 && preset.prompt.length <= 320)).toBe(true);
    expect(presets.every((preset) => !/masterpiece|8k|raw photo|consenting adult/i.test(preset.prompt))).toBe(true);
  });

  it('uses visibly different preset names for every category', () => {
    for (let left = 0; left < COMPANION_CATEGORIES.length; left += 1) {
      for (let right = left + 1; right < COMPANION_CATEGORIES.length; right += 1) {
        const leftNames = new Set(CATEGORY_PRESETS[COMPANION_CATEGORIES[left]].map((item) => item.name));
        const rightNames = CATEGORY_PRESETS[COMPANION_CATEGORIES[right]].map((item) => item.name);
        expect(rightNames.filter((name) => leftNames.has(name)).length).toBeLessThan(3);
      }
    }
  });
});

describe('LoRA authenticity inventory', () => {
  it('does not call registry entries verified without runtime evidence', () => {
    delete process.env.RUNPOD_INSTALLED_LORAS;
    expect(getVerifiedInstalledLoraSet().size).toBe(0);
    expect(verifyLoraHealth().inventorySource).toBe('unavailable');
    expect(verifyLoraHealth().unknown).toBeGreaterThan(0);
  });

it('verifies only registered files reported by the mounted-volume inventory', () => {
    const registered = LORA_REGISTRY[0];
    process.env.RUNPOD_INSTALLED_LORAS = registered.file;
    expect(checkLoraAuthenticity(registered.file, 1024 * 1024, registered.sha256)).toBeNull();
    expect(checkLoraAuthenticity('invented-style.safetensors')).toContain('not registered');
    expect(checkLoraAuthenticity(registered.file, 1024 * 1024, 'BAD_HASH')).toContain('SHA256 mismatch');
  });
});
