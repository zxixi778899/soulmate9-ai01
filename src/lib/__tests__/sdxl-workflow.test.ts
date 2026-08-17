import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildSdxlWorkflow,
  finalizeSdxlWorkflow,
  sdxlDefaultNegative,
} from '@/lib/comfy-builders/sdxl-workflow';
import {
  applyControlNet,
  applyFaceDetailer,
  applyHiresUpscale,
  applyIdentitySDXL,
} from '@/lib/comfy-builders/enhance-blocks';

const ORIGINAL_ENV = { ...process.env };
beforeEach(() => {
  process.env.RUNPOD_INSTALLED_LORAS_PONY =
    'pony_detailifier_v5.safetensors,pony_mature_female_slider_v2.safetensors';
  process.env.RUNPOD_CONTROLNET_READY = 'true';
  process.env.RUNPOD_ADETAILER_READY = 'true';
  process.env.RUNPOD_UPSCALE_READY = 'true';
  process.env.RUNPOD_IPADAPTER_SDXL_READY = 'true';
});
afterEach(() => { process.env = { ...ORIGINAL_ENV }; });

const inputsOf = (graph: Record<string, Record<string, unknown>>, id: string) =>
  graph[id].inputs as Record<string, unknown>;

describe('buildSdxlWorkflow — base chain', () => {
  it('wires CheckpointLoader → CLIP encodes → KSampler → VAEDecode → SaveImage', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'a portrait', seed: 42 });
    const graph = finalizeSdxlWorkflow(ctx);
    expect(inputsOf(graph, '1')).toMatchObject({ ckpt_name: 'ponyRealism_V22.safetensors' });
    expect(inputsOf(graph, '2')).toMatchObject({ text: 'a portrait', clip: ['20', 0] });
    expect(inputsOf(graph, '4')).toMatchObject({ width: 832, height: 1216, batch_size: 1 });
    expect(inputsOf(graph, '5')).toMatchObject({
      seed: 42,
      cfg: 6,
      sampler_name: 'dpmpp_2m_sde',
      scheduler: 'karras',
      denoise: 1,
      model: ['1', 0],
      positive: ['2', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
    });
    expect(inputsOf(graph, '6')).toMatchObject({ samples: ['5', 0], vae: ['1', 2] });
    expect(inputsOf(graph, '7')).toMatchObject({ images: ['6', 0] });
  });

  it('uses clip skip 2 through CLIPSetLastLayer by default', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x' });
    expect(inputsOf(ctx.graph, '20')).toMatchObject({ clip: ['1', 1], stop_at_clip_layer: -2 });
    expect(inputsOf(ctx.graph, '2')).toMatchObject({ clip: ['20', 0] });
  });

  it('injects a family-aware default negative prompt', () => {
    const realistic = buildSdxlWorkflow({ prompt: 'x' });
    expect(inputsOf(realistic.graph, '3').text).toContain('bad hands');
    const anime = buildSdxlWorkflow({ prompt: 'x', model_family: 'illustrious' });
    expect(inputsOf(anime.graph, '3').text).toContain('worst quality');
    expect(sdxlDefaultNegative('sdxl')).toContain('watermark');
  });

  it('chains up to 4 validated LoRAs and drops unknown ones', () => {
    const ctx = buildSdxlWorkflow({
      prompt: 'x',
      model_family: 'pony',
      loras: [
        { name: 'pony_detailifier_v5.safetensors', strength_model: 0.5 },
        { name: 'not-on-volume.safetensors' },
        { name: 'pony_mature_female_slider_v2.safetensors' },
      ],
    });
    expect(ctx.graph['14']).toMatchObject({ class_type: 'LoraLoader' });
    expect(inputsOf(ctx.graph, '14')).toMatchObject({ lora_name: 'pony_detailifier_v5.safetensors', model: ['1', 0] });
    expect(inputsOf(ctx.graph, '15')).toMatchObject({ model: ['14', 0] });
    expect(ctx.graph['16']).toBeUndefined();
    expect(inputsOf(ctx.graph, '5').model).toEqual(['15', 0]);
    expect(inputsOf(ctx.graph, '20')).toMatchObject({ clip: ['15', 1] });
  });

  it('builds the img2img path with scaled VAEEncode input', () => {
    const ctx = buildSdxlWorkflow({
      prompt: 'x',
      input_image: 'ref.png',
      denoising_strength: 0.72,
    });
    expect(inputsOf(ctx.graph, '11')).toMatchObject({ image: 'ref.png' });
    expect(inputsOf(ctx.graph, '13')).toMatchObject({ pixels: ['12', 0], vae: ['1', 2] });
    expect(inputsOf(ctx.graph, '5')).toMatchObject({ denoise: 0.72, latent_image: ['13', 0] });
    expect(ctx.graph['4']).toBeUndefined();
  });

  it('rejects empty prompts', () => {
    expect(() => buildSdxlWorkflow({ prompt: '   ' })).toThrow('empty prompt');
  });
});

describe('enhance blocks', () => {
  it('applyControlNet injects conditioning and rewires the KSampler', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x' });
    applyControlNet(ctx, { controlImage: 'pose.png', type: 'openpose', strength: 0.9 });
    expect(ctx.graph['41']).toMatchObject({ class_type: 'DWPreprocessor' });
    expect(inputsOf(ctx.graph, '42')).toMatchObject({ control_net_name: 'xinsir-openpose-sdxl.safetensors' });
    expect(inputsOf(ctx.graph, '43')).toMatchObject({
      positive: ['2', 0],
      negative: ['3', 0],
      strength: 0.9,
      end_percent: 0.85,
    });
    expect(inputsOf(ctx.graph, '5')).toMatchObject({ positive: ['43', 0], negative: ['43', 1] });

    const depth = buildSdxlWorkflow({ prompt: 'x' });
    applyControlNet(depth, { controlImage: 'ref.png', type: 'depth' });
    expect(depth.graph['41']).toMatchObject({ class_type: 'DepthAnythingV2Preprocessor' });
    expect(inputsOf(depth.graph, '42')).toMatchObject({ control_net_name: 'xinsir-depth-sdxl.safetensors' });
  });

  it('applyFaceDetailer runs a local inpaint pass on the decoded image', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x', seed: 7 });
    applyFaceDetailer(ctx, {});
    expect(inputsOf(ctx.graph, '51')).toMatchObject({ model_name: 'face_yolov8m.pt' });
    expect(inputsOf(ctx.graph, '50')).toMatchObject({
      image: ['6', 0],
      denoise: 0.4,
      feather: 5,
      seed: 8,
      bbox_detector: ['51', 0],
    });
    expect(inputsOf(ctx.graph, '7')).toMatchObject({ images: ['50', 0] });
  });

  it('applyHiresUpscale chains 4x-UltraSharp with an optional refine pass', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x', width: 832, height: 1216 });
    applyHiresUpscale(ctx, { factor: 2 });
    expect(inputsOf(ctx.graph, '60')).toMatchObject({ model_name: '4x-UltraSharp.pth' });
    expect(inputsOf(ctx.graph, '62').megapixels).toBeCloseTo(4.06, 1);
    expect(ctx.graph['64']).toBeUndefined();
    expect(inputsOf(ctx.graph, '7')).toMatchObject({ images: ['62', 0] });

    const refined = buildSdxlWorkflow({ prompt: 'x' });
    applyHiresUpscale(refined, { factor: 2, refine: true });
    expect(inputsOf(refined.graph, '64')).toMatchObject({ denoise: 0.35, latent_image: ['63', 0] });
    expect(inputsOf(refined.graph, '7')).toMatchObject({ images: ['65', 0] });
  });

  it('applyIdentitySDXL clamps the FaceID weight and rewires the model chain', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x' });
    applyIdentitySDXL(ctx, { faceImage: 'face.png', weight: 1.5 });
    expect(inputsOf(ctx.graph, '70')).toMatchObject({ preset: 'FACEID PLUS V2' });
    expect(inputsOf(ctx.graph, '72')).toMatchObject({ weight: 0.85, end_at: 0.85 });
    expect(inputsOf(ctx.graph, '5')).toMatchObject({ model: ['72', 0] });
  });

  it('stacks the full enhancement pipeline in a single graph', () => {
    const ctx = buildSdxlWorkflow({ prompt: 'x' });
    applyControlNet(ctx, { controlImage: 'pose.png', type: 'openpose' });
    applyIdentitySDXL(ctx, { faceImage: 'face.png' });
    applyFaceDetailer(ctx, {});
    applyHiresUpscale(ctx, { factor: 2, refine: true });
    const graph = finalizeSdxlWorkflow(ctx);
    // FaceDetailer consumes the identity-locked model and controlnet conditioning
    expect(inputsOf(graph, '50')).toMatchObject({ model: ['72', 0], positive: ['43', 0] });
    expect(inputsOf(graph, '64')).toMatchObject({ positive: ['43', 0] });
    expect(inputsOf(graph, '7')).toMatchObject({ images: ['65', 0] });
  });

  it('throws when an enhancer gate is not ready', () => {
    process.env.RUNPOD_CONTROLNET_READY = 'false';
    const ctx = buildSdxlWorkflow({ prompt: 'x' });
    expect(() => applyControlNet(ctx, { controlImage: 'p.png', type: 'openpose' })).toThrow('controlnet');

    delete process.env.RUNPOD_IPADAPTER_SDXL_READY;
    expect(() => applyIdentitySDXL(ctx, { faceImage: 'f.png' })).toThrow('RUNPOD_IPADAPTER_SDXL_READY');
  });
});
