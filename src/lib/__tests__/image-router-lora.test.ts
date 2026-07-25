import { describe, expect, it } from 'vitest';
import { shouldSwitchFromQueuedRunPod } from '@/lib/image-router';

describe('image router LoRA queue behavior', () => {
  it('keeps a queued RunPod job when LoRA is required', () => {
    expect(shouldSwitchFromQueuedRunPod({ switch_on_queue: true }, true)).toBe(false);
  });

  it('allows fast failover for queued generations without LoRA', () => {
    expect(shouldSwitchFromQueuedRunPod({ switch_on_queue: true }, false)).toBe(true);
  });
});
