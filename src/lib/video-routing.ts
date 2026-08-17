/**
 * Video model routing + worker payload builder.
 *
 * Extracted from the generate-video route so the route file only exports
 * Next.js route handlers (avoids .next/types conflicts).
 */

export type VideoModel = 'svd' | 'wan22';

export function resolveVideoModelRoute(requested: unknown): { model: VideoModel; endpointId: string } {
  const configuredDefault: VideoModel = process.env.VIDEO_DEFAULT_MODEL === 'svd' ? 'svd' : 'wan22';
  const model: VideoModel = requested === 'wan22' || requested === 'wan-2.2'
    ? 'wan22'
    : requested === 'svd' ? 'svd' : configuredDefault;
  const endpointId = model === 'wan22'
    ? process.env.RUNPOD_WAN_VIDEO_ENDPOINT?.trim() || ''
    : (process.env.RUNPOD_VIDEO_ENDPOINT_ID || process.env.RUNPOD_SVD_ENDPOINT_ID || '').trim();
  return { model, endpointId };
}

export function buildVideoWorkerInput(input: {
  model: VideoModel;
  imagePayload: string;
  prompt?: string;
  negativePrompt?: string;
  duration: 3 | 5 | 10;
  fps?: number;
  numFrames?: number;
  motionBucketId?: number;
  decodeChunkSize?: number;
}): Record<string, unknown> {
  if (input.model === 'wan22') {
    const duration = input.duration === 10 ? 10 : 5;
    const fps = Math.min(24, Math.max(8, input.fps || 16));
    const numFrames = input.numFrames || (duration === 10 ? 161 : 81);
    return {
      model: 'wan22',
      prompt: input.prompt || 'subtle natural movement, stable identity, smooth motion, static camera',
      negative_prompt: input.negativePrompt || 'blurry, flicker, distorted face, identity drift, extra limbs, watermark, text',
      image: input.imagePayload,
      image_base64: input.imagePayload,
      width: 832,
      height: 480,
      num_frames: Math.min(161, Math.max(16, numFrames)),
      fps,
      num_inference_steps: 30,
      guidance_scale: 5,
    };
  }
  return {
    input_image: input.imagePayload,
    motion_bucket_id: input.motionBucketId || 127,
    fps: input.fps || 7,
    num_frames: input.numFrames || (input.duration === 10 ? 40 : input.duration === 3 ? 14 : 25),
    decode_chunk_size: input.decodeChunkSize || 8,
  };
}
