import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildFluxWorkflow } from '@/lib/runpod';
import { hasAnyCapability, parseGenCapabilities } from '@/lib/gen-hub/capabilities';

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env.RUNPOD_CONTROLNET_READY = 'true';
  process.env.RUNPOD_ADETAILER_READY = 'true';
  process.env.RUNPOD_UPSCALE_READY = 'true';
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

const inputsOf = (graph: Record<string, unknown>, id: string) =>
  (graph[id] as { inputs: Record<string, unknown> }).inputs;

describe('buildFluxWorkflow enhancement branches', () => {
  it('leaves the graph untouched when no enhancement is requested', () => {
    const graph = buildFluxWorkflow({ prompt: 'x' });
    expect(graph['40']).toBeUndefined();
    expect(graph['50']).toBeUndefined();
    expect(graph['60']).toBeUndefined();
    expect(inputsOf(graph, '7').images).toEqual(['6', 0]);
  });

  it('wires depth ControlNet into the FLUX conditioning chain', () => {
    const graph = buildFluxWorkflow({ prompt: 'x', control_image: 'pose.png', control_strength: 0.85 });
    expect(inputsOf(graph, '42')).toMatchObject({ control_net_name: 'flux-depth-controlnet.safetensors' });
    expect(inputsOf(graph, '43')).toMatchObject({ positive: ['21', 0], strength: 0.85, vae: ['23', 0] });
    expect(inputsOf(graph, '5')).toMatchObject({ positive: ['43', 0], negative: ['43', 1] });
  });

  it('skips ControlNet with the gate closed instead of throwing', () => {
    process.env.RUNPOD_CONTROLNET_READY = 'false';
    const graph = buildFluxWorkflow({ prompt: 'x', control_image: 'pose.png' });
    expect(graph['43']).toBeUndefined();
    expect(inputsOf(graph, '5')).toMatchObject({ positive: ['21', 0] });
  });

  it('chains FaceDetailer then upscale and rewires SaveImage', () => {
    const graph = buildFluxWorkflow({ prompt: 'x', face_detailer: true, upscale_factor: 2 });
    expect(inputsOf(graph, '50')).toMatchObject({ image: ['6', 0], denoise: 0.35 });
    expect(inputsOf(graph, '61')).toMatchObject({ image: ['50', 0] });
    expect(inputsOf(graph, '7')).toMatchObject({ images: ['62', 0] });
  });

  it('auto-prepends bbox/ when RUNPOD_ADETAILER_MODEL is a bare filename', () => {
    process.env.RUNPOD_ADETAILER_MODEL = 'face_yolov8m.pt';
    const bare = buildFluxWorkflow({ prompt: 'x', face_detailer: true });
    expect(inputsOf(bare, '51')).toMatchObject({ model_name: 'bbox/face_yolov8m.pt' });

    // segm/ must pass through untouched (not silently downgraded to bbox/).
    process.env.RUNPOD_ADETAILER_MODEL = 'segm/face_yolov8n.pt';
    const segm = buildFluxWorkflow({ prompt: 'x', face_detailer: true });
    expect(inputsOf(segm, '51')).toMatchObject({ model_name: 'segm/face_yolov8n.pt' });

    // Explicit bbox/ is left alone (no double-prefix).
    process.env.RUNPOD_ADETAILER_MODEL = 'bbox/hand_yolov8n.pt';
    const prefixed = buildFluxWorkflow({ prompt: 'x', face_detailer: true });
    expect(inputsOf(prefixed, '51')).toMatchObject({ model_name: 'bbox/hand_yolov8n.pt' });
  });

  it('keeps enhancement branches on the img2img path too', () => {
    const graph = buildFluxWorkflow({
      prompt: 'x',
      input_image: 'ref.png',
      denoising_strength: 0.6,
      face_detailer: true,
    });
    expect(inputsOf(graph, '5')).toMatchObject({ latent_image: ['13', 0] });
    expect(inputsOf(graph, '7')).toMatchObject({ images: ['50', 0] });
  });
});

describe('gen-hub capability parsing', () => {
  it('normalizes valid capabilities', () => {
    const caps = parseGenCapabilities({
      control: { type: 'openpose', image: 'pose.png', strength: 1.6 },
      face_fix: true,
      upscale: true,
      identity_image: 'face.png',
    });
    expect(caps.control).toEqual({ type: 'openpose', image: 'pose.png', strength: 1 });
    expect(caps.face_fix).toBe(true);
    expect(caps.upscale).toBe(2);
    expect(caps.identity_image).toBe('face.png');
    expect(hasAnyCapability(caps)).toBe(true);
  });

  it('drops invalid entries without failing', () => {
    const caps = parseGenCapabilities({
      control: { type: 'scribble', image: 'x.png' },
      upscale: 0.5,
      identity_image: '   ',
    });
    expect(caps.control).toBeUndefined();
    expect(caps.upscale).toBeUndefined();
    expect(caps.identity_image).toBeUndefined();
    expect(hasAnyCapability(caps)).toBe(false);
    expect(hasAnyCapability(parseGenCapabilities(null))).toBe(false);
  });

  it('clamps upscale factors into the supported range', () => {
    expect(parseGenCapabilities({ upscale: '4' }).upscale).toBe(4);
    expect(parseGenCapabilities({ upscale: 8 }).upscale).toBe(4);
    expect(parseGenCapabilities({ upscale: 1.2 }).upscale).toBe(1.5);
  });
});
