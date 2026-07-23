import { afterEach, describe, expect, it } from 'vitest';
import { COMPANION_CATEGORIES, HIGH_NSFW_PROMPT } from '@/lib/companion-category';
import { CATEGORY_PRESETS } from '@/app/(main)/admin/comfy/presets';
import {
  checkLoraAuthenticity,
  getVerifiedInstalledLoraSet,
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
    expect(presets.every((preset) => preset.steps >= 30)).toBe(true);
    expect(presets.every((preset) => preset.prompt.includes('explicit consensual adult scene'))).toBe(true);
  });

  it('keeps the global adult intensity explicitly adult-only', () => {
    expect(HIGH_NSFW_PROMPT).toContain('adults age 25+ only');
    expect(HIGH_NSFW_PROMPT).toContain('high-NSFW');
  });
});

describe('LoRA authenticity inventory', () => {
  it('does not call registry entries verified without runtime evidence', () => {
    delete process.env.RUNPOD_INSTALLED_LORAS;
    expect(getVerifiedInstalledLoraSet().size).toBe(0);
    expect(verifyLoraHealth().inventorySource).toBe('unavailable');
    expect(verifyLoraHealth().unknown).toBeGreaterThan(0);
  });

  it('verifies only filenames reported by the mounted-volume inventory', () => {
    process.env.RUNPOD_INSTALLED_LORAS = 'real-style.safetensors';
    expect(checkLoraAuthenticity('real-style.safetensors')).toBeNull();
    expect(checkLoraAuthenticity('invented-style.safetensors')).toContain('Not found on volume');
  });
});
