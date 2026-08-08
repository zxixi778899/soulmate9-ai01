import { afterEach, describe, expect, it } from 'vitest';
import { buildVideoWorkerInput, resolveVideoModelRoute } from '@/app/api/generate-video/route';

const ORIGINAL_ENV = { ...process.env };
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

describe('video generation routing', () => {
  it('keeps SVD available as an explicit legacy route', () => {
    process.env.RUNPOD_VIDEO_ENDPOINT_ID = 'svd-endpoint';
    expect(resolveVideoModelRoute('svd')).toEqual({ model: 'svd', endpointId: 'svd-endpoint' });
  });

  it('routes explicit WAN 2.2 requests to the WAN worker', () => {
    process.env.RUNPOD_WAN_VIDEO_ENDPOINT = 'wan-endpoint';
    expect(resolveVideoModelRoute('wan-2.2')).toEqual({ model: 'wan22', endpointId: 'wan-endpoint' });
  });

  it('allows a canary-tested WAN worker to become the default', () => {
    process.env.VIDEO_DEFAULT_MODEL = 'wan22';
    process.env.RUNPOD_WAN_VIDEO_ENDPOINT = 'wan-endpoint';
    expect(resolveVideoModelRoute(undefined).model).toBe('wan22');
  });

  it('uses the WAN image-to-video worker contract', () => {
    const input = buildVideoWorkerInput({
      model: 'wan22', imagePayload: 'base64-image', prompt: 'she smiles', duration: 5,
    });
    expect(input.image).toBe('base64-image');
    expect(input.image_base64).toBe('base64-image');
    expect(input.num_frames).toBe(81);
    expect(input.fps).toBe(16);
    expect(input).not.toHaveProperty('motion_bucket_id');
  });

  it('keeps the old SVD payload isolated from WAN', () => {
    const input = buildVideoWorkerInput({ model: 'svd', imagePayload: 'base64-image', duration: 5 });
    expect(input.input_image).toBe('base64-image');
    expect(input.motion_bucket_id).toBe(127);
    expect(input).not.toHaveProperty('image_base64');
  });
});
