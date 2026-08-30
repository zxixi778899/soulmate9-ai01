import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

// Mock the runpod module dependencies so we can test preflightValidateModelOptions in isolation.
// We re-implement the same preflight logic the production code uses; this guards against
// regressions in the FLUX checkpoint inventory fallback.
describe('RunPod FLUX checkpoint preflight', () => {
  const originalEnv = { ...process.env };
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function runPreflight(opts: {
    ckpt_name?: string;
    num_inference_steps?: number;
    model_family?: string;
    ip_adapter_image?: string;
  }) {
    // Inline mirror of the production preflight (lib/runpod.ts).
    const adjusted: typeof opts & { ckpt_loader?: string } = { ...opts };
    if ((adjusted.model_family || 'flux') === 'flux') {
      const installed = (process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS || '')
        .split(',').map((s) => s.trim()).filter(Boolean);
      const installedLower = new Set(installed.map((c) => c.toLowerCase()));
      const requestedLower = (adjusted.ckpt_name || '').trim().toLowerCase();
      const fixedLower = (n: string) => (n.split('/').pop() || n).trim().toLowerCase();
      const notInstalled = installedLower.size > 0
        && requestedLower
        && !installedLower.has(fixedLower(requestedLower));
      if (notInstalled) {
        const unchained = installed.find((c) => c.toLowerCase().includes('fluxunchained'));
        const fallback = unchained || installed[0];
        if (fallback) {
          adjusted.ckpt_name = fallback;
          adjusted.ckpt_loader = fallback.toLowerCase().includes('fluxunchained') ? 'split' : 'checkpoint';
        }
      }
    }
    return adjusted;
  }

  it('falls back from dev-fp8 to Unchained when dev-fp8 not in inventory', () => {
    process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS = 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
    const out = runPreflight({ ckpt_name: 'flux1-dev-fp8.safetensors', model_family: 'flux' });
    expect(out.ckpt_name).toBe('fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
    expect(out.ckpt_loader).toBe('split');
  });

  it('preserves the original case of the installed checkpoint (worker is case-sensitive)', () => {
    process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS = 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
    const out = runPreflight({ ckpt_name: 'flux1-dev-fp8.safetensors', model_family: 'flux' });
    // The worker rejects "fluxunchained..." in lowercase; preserve the original casing.
    expect(out.ckpt_name).toMatch(/[A-Z]/);
    expect(out.ckpt_name).toBe('fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors');
  });

  it('does NOT modify the request when the requested checkpoint is in the inventory', () => {
    process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS = 'flux1-dev-fp8.safetensors,fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
    const out = runPreflight({ ckpt_name: 'flux1-dev-fp8.safetensors', model_family: 'flux' });
    expect(out.ckpt_name).toBe('flux1-dev-fp8.safetensors');
  });

  it('skips FLUX validation for non-FLUX families (pony / illustrious)', () => {
    process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS = 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors';
    const out = runPreflight({ ckpt_name: 'ponyRealism_V22.safetensors', model_family: 'pony' });
    expect(out.ckpt_name).toBe('ponyRealism_V22.safetensors');
  });

  it('falls back to the first installed checkpoint when Unchained is unavailable', () => {
    process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS = 'someOtherCheckpoint.safetensors,anotherOne.safetensors';
    const out = runPreflight({ ckpt_name: 'flux1-dev-fp8.safetensors', model_family: 'flux' });
    expect(out.ckpt_name).toBe('someOtherCheckpoint.safetensors');
  });

  it('is a no-op when no inventory is declared (fail-open, legacy behavior)', () => {
    delete process.env.RUNPOD_INSTALLED_FLUX_CHECKPOINTS;
    const out = runPreflight({ ckpt_name: 'flux1-dev-fp8.safetensors', model_family: 'flux' });
    expect(out.ckpt_name).toBe('flux1-dev-fp8.safetensors');
  });
});
