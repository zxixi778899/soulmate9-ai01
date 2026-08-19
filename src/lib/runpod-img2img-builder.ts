/**
 * img2img Workflow Builder for FLUX
 * Creates ComfyUI nodes for image-to-image generation with reference images
 * Enables character consistency via IP-Adapter or denoising-controlled img2img
 */

/** UNET-only FLUX checkpoints: need DualCLIPLoader (clip_l + t5xxl) + VAELoader (ae). */
const SPLIT_FLUX_CHECKPOINTS = new Set([
  'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
]);

export function buildImg2ImgWorkflow(
  positivePrompt: string,
  negativePrompt: string,
  inputImageBase64: string,
  denoise: number = 0.65,
  width: number = 832,
  height: number = 1216,
  steps: number = 24,
  guidance: number = 1,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 位置参数，内部调用按位置传入，移除会错位后续参数
  fluxGuidance: number = 3.5,
  seed: number = Math.floor(Math.random() * 2 ** 32),
  modelRef?: [string, number],      // ['30', 0] if IP-Adapter used
  clipRef?: [string, number],       // ['22', 0] for split loader
  vaeRef?: [string, number],        // ['23', 0] for split loader
): Record<string, unknown> {
  const inputNodeId = '11';
  const scaleNodeId = '12';
  const encodeNodeId = '13';
  const posNodeId = '2';
  const negNodeId = '3';
  const samplerNodeId = '5';
  const decodeNodeId = '6';
  const saveNodeId = '7';

  // Core img2img node chain
  const img2imgGraph: Record<string, unknown> = {
    // Step 1: Load reference image from worker volume
    [inputNodeId]: {
      class_type: 'LoadImage',
      inputs: {
        image: inputImageBase64,  // filename registered via images payload
      },
    },
    
    // Step 2: Scale to target resolution (keep aspect ratio)
    [scaleNodeId]: {
      class_type: 'ImageScale',
      inputs: {
        image: [inputNodeId, 0],
        upscale_method: 'lanczos',
        width: width,
        height: height,
        crop: 'disabled',
      },
    },

    // Step 3: Encode latent (VAE encoding of scaled image)
    [encodeNodeId]: {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [scaleNodeId, 0],
        vae: vaeRef || ['1', 2],  // fallback to default if not provided
      },
    },

    // Step 4: CLIP Text Encode (positive/negative prompts)
    [posNodeId]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: positivePrompt, clip: clipRef || ['22', 0] },
    },
    [negNodeId]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: negativePrompt, clip: clipRef || ['22', 0] },
    },

    // Step 5: KSampler with denoised latent
    [samplerNodeId]: {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: guidance,  // always 1 for FLUX
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise,         // 0.5-0.7 for identity preservation
        model: modelRef || ['14', 0],  // after LoRA/IP-Adapter
        positive: [posNodeId, 0],
        negative: [negNodeId, 0],
        latent_image: [encodeNodeId, 0],  // FROM input image, NOT empty!
      },
    },

    // Step 6: VAE Decode & Save
    [decodeNodeId]: {
      class_type: 'VAEDecode',
      inputs: { samples: [samplerNodeId, 0], vae: vaeRef || ['1', 2] },
    },
    [saveNodeId]: {
      class_type: 'SaveImage',
      inputs: { 
        filename_prefix: 'soulmate_img2img', 
        images: [decodeNodeId, 0] 
      },
    },
  };

  return img2imgGraph;
}

/**
 * Build full workflow combining checkpoint/LoRA/IP-Adapter loaders with img2img chain
 */
export function buildCompleteImg2ImgWorkflow(opts: {
  prompt: string;
  negativePrompt: string;
  inputImageFilename: string;
  checkpoint: string;
  loras?: Array<{ name: string; strength_model: number; strength_clip: number }>;
  ipAdapterImage?: string;
  ipAdapterWeight?: number;
  denoise?: number;
  width?: number;
  height?: number;
  steps?: number;
  fluxGuidance?: number;
  seed?: number;
}): Record<string, unknown> {
  const {
    prompt,
    negativePrompt,
    inputImageFilename,
    checkpoint,
    loras = [],
    ipAdapterImage,
    ipAdapterWeight,
    denoise = 0.65,
    width = 832,
    height = 1216,
    steps = 24,
    fluxGuidance = 3.5,
    seed = Math.floor(Math.random() * 2 ** 32),
  } = opts;

  const useSplitLoader = SPLIT_FLUX_CHECKPOINTS.has(checkpoint);
  
  const baseGraph: Record<string, unknown> = {};

  // ─── Model Loader ──────────────────────────────────────────────
  if (useSplitLoader) {
    baseGraph['1'] = {
      class_type: 'UNETLoader',
      inputs: { unet_name: checkpoint, weight_dtype: 'default' },
    };
    baseGraph['22'] = {
      class_type: 'DualCLIPLoader',
      inputs: { 
        clip_name1: process.env.RUNPOD_FLUX_CLIP || 'clip_l.safetensors',
        clip_name2: process.env.RUNPOD_FLUX_T5 || 't5xxl_fp8_e4m3fn.safetensors',
        type: 'flux' 
      },
    };
    baseGraph['23'] = {
      class_type: 'VAELoader',
      inputs: { vae_name: process.env.RUNPOD_FLUX_VAE || 'ae.safetensors' },
    };
  } else {
    baseGraph['1'] = {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    };
  }

  // ─── LoRA Stack ────────────────────────────────────────────────
  const loraNodes: Record<string, unknown> = {};
  let lastLoraNodeId: string = '1';

  for (const [idx, lora] of loras.entries()) {
    const nodeId = String(14 + idx);
    const prevNodeId = idx === 0 ? '1' : String(14 + idx - 1);

    loraNodes[nodeId] = {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: lora.name,
        strength_model: lora.strength_model ?? 0.7,
        strength_clip: lora.strength_clip ?? lora.strength_model ?? 0.7,
        model: [prevNodeId, 0],
        clip: useSplitLoader ? ['22', 0] : [prevNodeId, 1],
      },
    };
    lastLoraNodeId = nodeId;
  }
  Object.assign(baseGraph, loraNodes);

  // ─── IP-Adapter Nodes (optional face lock) ─────────────────────
  let modelRef: [string, number] = [lastLoraNodeId, 0];
  const clipRef: [string, number] = useSplitLoader ? ['22', 0] : [lastLoraNodeId, 1];

  if (ipAdapterImage && ipAdapterWeight) {
    // Accept weights from identity-kit resolver (0.65-0.85), clamp to [0.3, 0.9]
    const ipWeight = Math.min(0.9, Math.max(0.3, ipAdapterWeight));
    const ipModel = 'ip-adapter.bin';
    const clipVision = 'google/siglip-so400m-patch14-384';

    // Node 30: ApplyIPAdapterFlux
    baseGraph['30'] = {
      class_type: 'ApplyIPAdapterFlux',
      inputs: {
        model: modelRef,
        ipadapter_flux: ['31', 0],
        image: ['33', 0],
        weight: ipWeight,
        // 'linear' preserves face geometry better than 'style transfer'
        weight_type: 'linear',
        start_percent: 0.05,
        // Extended end_percent anchors identity through late detail refinement
        end_percent: 0.85,
      },
    };

    // Node 31: IPAdapterFluxLoader
    baseGraph['31'] = {
      class_type: 'IPAdapterFluxLoader',
      inputs: {
        ipadapter: ipModel,
        clip_vision: clipVision,
        provider: 'cuda',
      },
    };

    // Node 33: LoadImage (face ref)
    baseGraph['33'] = {
      class_type: 'LoadImage',
      inputs: { image: ipAdapterImage },
    };

    // Update model reference to come from IP-Adapter
    modelRef = ['30', 0];
  }

  // ─── Flux Guidance ─────────────────────────────────────────────
  const fluxGuidanceNode = {
    '21': {
      class_type: 'FluxGuidance',
      inputs: {
        conditioning: [['22', 0]],  // simplified; adjust if needed
        guidance: fluxGuidance,
      },
    },
  };

  // ─── Img2Img Chain ─────────────────────────────────────────────
  const img2imgNodes = buildImg2ImgWorkflow(
    prompt,
    negativePrompt,
    inputImageFilename,
    denoise,
    width,
    height,
    steps,
    1,  // CFG=1 for FLUX
    fluxGuidance,
    seed,
    modelRef,
    clipRef,
    useSplitLoader ? ['23', 0] : undefined,
  );

  // Merge all graphs
  return { ...baseGraph, ...fluxGuidanceNode, ...img2imgNodes };
}
