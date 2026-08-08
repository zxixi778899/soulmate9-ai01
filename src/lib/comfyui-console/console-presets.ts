/**
 * ComfyUI 控制台 — 9 大预设工作流定义
 *
 * engine:
 *  - flux: RunPod 统一 Comfy 端点（Flux FP8），服务端构建 ComfyUI API 图
 *  - wan:  WAN 2.2 视频端点（图生视频 / 文生视频）
 *  - raw:  任意 ComfyUI API 格式工作流 JSON，按节点自动生成参数控件
 */

export type ComfyEngine = 'flux' | 'wan' | 'raw';

export type ConsoleParamField = {
  key: string;
  type:
    | 'textarea'
    | 'text'
    | 'number'
    | 'slider'
    | 'seed'
    | 'image'
    | 'select'
    | 'loras'
    | 'checkpoint';
  label: string;
  required?: boolean;
  /** 收进「高级参数」折叠区 */
  advanced?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  hint?: string;
  /** 快捷模板：点击后把 patch 合并进表单 */
  chips?: Array<{ label: string; patch: Record<string, unknown> }>;
};

export type ConsoleWorkflowPreset = {
  key: string;
  name: string;
  category: 'image' | 'video' | 'dynamic';
  engine: ComfyEngine;
  description: string;
  icon: string;
  sort_order: number;
  params_schema: ConsoleParamField[];
  defaults: Record<string, unknown>;
  workflow_json?: Record<string, unknown> | null;
};

const FLUX_NEG_BASE =
  'blurry, lowres, bad anatomy, deformed hands, extra fingers, watermark, text, logo';

/** 自然感正向补丁：降低“AI 味”，让脸部有辨识度 */
const NATURAL_POSITIVE =
  ', youthful fresh healthy skin, natural skin texture with soft realistic detail, clear bright youthful eyes, soft natural diffused lighting, gentle realistic shadows, natural color grading, candid relaxed expression, correct realistic anatomy, natural body proportions, well-formed hands and fingers, not airbrushed';
/** 反“AI 脸”负向词：塑料感 / 蜡像 / 千篇一律脸 */
const ANTI_AI_NEGATIVE =
  ', plastic skin, airbrushed, doll-like, porcelain skin, wax figure, mannequin, generic face, same-face look, AI-generated look, oversmoothed, waxy, uncanny, CGI render, aged appearance, wrinkles, sagging skin, dull complexion, acne, blemishes';

const SAMPLER_OPTIONS = [
  { value: 'euler', label: 'euler（推荐）' },
  { value: 'euler_ancestral', label: 'euler_ancestral' },
  { value: 'dpmpp_2m', label: 'dpmpp_2m' },
  { value: 'dpmpp_2m_sde', label: 'dpmpp_2m_sde' },
];

const SCHEDULER_OPTIONS = [
  { value: 'simple', label: 'simple（推荐）' },
  { value: 'normal', label: 'normal' },
  { value: 'karras', label: 'karras' },
  { value: 'sgm_uniform', label: 'sgm_uniform' },
];

/** Flux 引擎通用高级参数 */
function fluxAdvancedFields(): ConsoleParamField[] {
  return [
    { key: 'width', type: 'number', label: '宽度', advanced: true, min: 512, max: 2048, step: 64 },
    { key: 'height', type: 'number', label: '高度', advanced: true, min: 512, max: 2048, step: 64 },
    { key: 'steps', type: 'number', label: '采样步数', advanced: true, min: 8, max: 60 },
    { key: 'flux_guidance', type: 'slider', label: 'Flux 引导强度', advanced: true, min: 2, max: 5, step: 0.1, hint: '越高越贴近提示词，2~5 之间' },
    { key: 'sampler', type: 'select', label: '采样器', advanced: true, options: SAMPLER_OPTIONS },
    { key: 'scheduler', type: 'select', label: '调度器', advanced: true, options: SCHEDULER_OPTIONS },
    { key: 'seed', type: 'seed', label: '种子', advanced: true, hint: '-1 = 随机' },
    { key: 'num_images', type: 'number', label: '生成张数', advanced: true, min: 1, max: 4, hint: '多张会成倍占用 GPU 时间' },
    { key: 'ckpt_name', type: 'checkpoint', label: '底模 Checkpoint', advanced: true },
  ];
}

/** LoRA 选择字段 */
function loraField(hint?: string): ConsoleParamField {
  return {
    key: 'loras',
    type: 'loras',
    label: 'LoRA 叠加',
    hint: hint || '最多 3 个，总强度过高会自动等比缩放',
  };
}

/** NSFW 强度字段（≥3 时提示词优化走 vLLM-Qwen3 NSFW 路由） */
function intensityField(): ConsoleParamField {
  return {
    key: 'intensity',
    type: 'select',
    label: 'NSFW 强度',
    hint: '1 日常 · 2 内衣/性感 · 3 全裸 · 4 自慰 · 5 明确性行为；≥3 启用 NSFW 路由提示词优化',
    options: [
      { value: '1', label: '1 · 日常（完全遮盖）' },
      { value: '2', label: '2 · 内衣 / 性感（遮盖）' },
      { value: '3', label: '3 · 全裸（无性行为）' },
      { value: '4', label: '4 · 自慰（高潮前）' },
      { value: '5', label: '5 · 明确性行为' },
    ],
  };
}

/** IP-Adapter 人脸锁定字段组 */
function identityFields(required: boolean): ConsoleParamField[] {
  return [
    {
      key: 'ip_adapter_image',
      type: 'image',
      label: '人脸参考图（IP-Adapter）',
      required,
      hint: '只锁五官身份，不复制构图；留空则不启用',
    },
    {
      key: 'ip_adapter_weight',
      type: 'slider',
      label: '身份锁定强度',
      min: 0.3,
      max: 1,
      step: 0.01,
      hint: '0.7 锁脸更稳；构图会更贴近参考图，0.5 则更跟提示词',
    },
  ];
}

/** 动态工作流（raw 引擎）的默认 Flux txt2img 图 */
export const DEFAULT_RAW_GRAPH: Record<string, unknown> = {
  '1': {
    class_type: 'UNETLoader',
    inputs: {
      unet_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      weight_dtype: 'default',
    },
  },
  '22': {
    class_type: 'DualCLIPLoader',
    inputs: {
      clip_name1: 'clip_l.safetensors',
      clip_name2: 't5xxl_fp8_e4m3fn.safetensors',
      type: 'flux',
    },
  },
  '23': {
    class_type: 'VAELoader',
    inputs: { vae_name: 'ae.safetensors' },
  },
  '2': {
    class_type: 'CLIPTextEncode',
    inputs: {
      text: 'a stunning photorealistic portrait of an adult woman, soft studio light, sharp focus, high detail',
      clip: ['22', 0],
    },
  },
  '3': {
    class_type: 'CLIPTextEncode',
    inputs: { text: FLUX_NEG_BASE, clip: ['22', 0] },
  },
  '4': {
    class_type: 'EmptyLatentImage',
    inputs: { width: 832, height: 1216, batch_size: 1 },
  },
  '21': {
    class_type: 'FluxGuidance',
    inputs: { conditioning: ['2', 0], guidance: 3.5 },
  },
  '5': {
    class_type: 'KSampler',
    inputs: {
      seed: -1,
      steps: 8,
      cfg: 1.0,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1.0,
      model: ['1', 0],
      positive: ['21', 0],
      negative: ['3', 0],
      latent_image: ['4', 0],
    },
  },
  '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['23', 0] } },
  '7': {
    class_type: 'SaveImage',
    inputs: { filename_prefix: 'comfyui-console', images: ['6', 0] },
  },
};

export const CONSOLE_PRESETS: ConsoleWorkflowPreset[] = [
  // ── 1. 生成角色 ────────────────────────────────────────────────
  {
    key: 'wf-character',
    name: '生成角色',
    category: 'image',
    engine: 'flux',
    icon: 'User',
    sort_order: 1,
    description: '从零生成全新角色：全身角色设计 / 卡面主视觉，Flux FP8 文生图',
    params_schema: [
      {
        key: 'prompt',
        type: 'textarea',
        label: '角色描述',
        required: true,
        placeholder: '描述角色的外貌、服装、气质、构图……',
        chips: [
          {
            label: '写实女性',
            patch: {
              prompt:
                'full-body character concept of a beautiful adult woman, distinctive memorable face, stylish modern outfit, relaxed confident stance, clean neutral studio backdrop, soft directional lighting, photorealistic, crisp detail, sharp focus',
            },
          },
          {
            label: '成熟魅力',
            patch: {
              prompt:
                'full-body character concept of a mature seductive adult woman in her early thirties, elegant figure-hugging dress, confident gaze, warm studio lighting, editorial fashion photography, photorealistic, high detail',
            },
          },
          {
            label: '二次元少女',
            patch: {
              prompt:
                'full-body anime character design of a cute adult girl, colorful hair, expressive eyes, fashionable outfit, dynamic pose, clean white background, high quality anime illustration, detailed shading',
            },
          },
          {
            label: '男性角色',
            patch: {
              prompt:
                'full-body character concept of a handsome adult man, sharp jawline, fitted dark suit, confident posture, clean studio backdrop, cinematic lighting, photorealistic, high detail',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      loraField(),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      prompt:
        'full-body character concept of a beautiful adult woman, distinctive memorable face, stylish modern outfit, relaxed confident stance, clean neutral studio backdrop, soft directional lighting, photorealistic, crisp detail, sharp focus' + NATURAL_POSITIVE,
      negative: FLUX_NEG_BASE + ', child, underage' + ANTI_AI_NEGATIVE,
      width: 832,
      height: 1216,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 2. 生成立绘（人物一致性）───────────────────────────────────
  {
    key: 'wf-portrait',
    name: '生成立绘 · 人物一致',
    category: 'image',
    engine: 'flux',
    icon: 'Frame',
    sort_order: 2,
    description:
      '上传角色参考图后用 IP-Adapter 锁定五官身份，提示词自由控制构图/场景，产出角色立绘',
    params_schema: [
      ...identityFields(true),
      {
        key: 'prompt',
        type: 'textarea',
        label: '立绘场景描述',
        required: true,
        placeholder: '同一角色的新构图、服装、场景……',
        chips: [
          {
            label: '半身肖像',
            patch: {
              prompt:
                'upper-body portrait of the same woman as the reference, consistent face identity, same hair color and hairstyle, elegant outfit, soft studio key light, photorealistic 8k, sharp eyes',
            },
          },
          {
            label: '全身立绘',
            patch: {
              prompt:
                'full-body standing artwork of the same woman as the reference, consistent face identity, same hair, stylish outfit, neutral backdrop, soft even lighting, photorealistic 8k',
            },
          },
          {
            label: '面部特写',
            patch: {
              prompt:
                'close-up beauty shot of the same woman as the reference, identical face, flawless skin detail, catchlight in eyes, shallow depth of field, photorealistic 8k',
            },
          },
          {
            label: '生活随拍',
            patch: {
              prompt:
                'candid lifestyle photo of the same woman as the reference, consistent face identity, casual outfit, cozy indoor environment, natural window light, photorealistic',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      intensityField(),
      loraField(),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      intensity: 1,
      prompt:
        'upper-body portrait of the same woman as the reference, consistent face identity, same hair color and hairstyle, elegant outfit, soft studio key light, photorealistic 8k, sharp eyes' + NATURAL_POSITIVE,
      negative: 'different person, face change, ' + FLUX_NEG_BASE + ', child' + ANTI_AI_NEGATIVE,
      ip_adapter_image: '',
      ip_adapter_weight: 0.7,
      width: 832,
      height: 1216,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 3. 生成场景 ────────────────────────────────────────────────
  {
    key: 'wf-scene',
    name: '生成场景',
    category: 'image',
    engine: 'flux',
    icon: 'Mountain',
    sort_order: 3,
    description: '场景 / 背景 / 环境空镜（无人物），用于相册背景、卡片场景图',
    params_schema: [
      {
        key: 'prompt',
        type: 'textarea',
        label: '场景描述',
        required: true,
        placeholder: '地点、光线、氛围、镜头……',
        chips: [
          {
            label: '温馨卧室',
            patch: {
              prompt:
                'empty cozy modern bedroom at dusk, warm ambient lamp light, large window with city night view, tasteful interior design, no people, photorealistic interior photography, high detail',
            },
          },
          {
            label: '海滩日落',
            patch: {
              prompt:
                'tropical beach at golden sunset, gentle waves, warm orange sky, soft sand reflections, no people, cinematic wide shot, photorealistic, high detail',
            },
          },
          {
            label: '酒吧吧台',
            patch: {
              prompt:
                'moody upscale bar counter at night, amber pendant lights, bottles backlit on shelves, leather stools, no people, cinematic atmosphere, photorealistic',
            },
          },
          {
            label: '夜景街头',
            patch: {
              prompt:
                'rainy neon city street at night, glowing shop signs, wet asphalt reflections, cinematic cyberpunk mood, no people, photorealistic, high detail',
            },
          },
          {
            label: '健身房',
            patch: {
              prompt:
                'modern gym interior with dumbbell racks and mirrors, cool daylight from tall windows, clean floor, no people, photorealistic architecture photography',
            },
          },
          {
            label: '豪华酒店',
            patch: {
              prompt:
                'luxury hotel suite with floor-to-ceiling windows overlooking the city at dusk, elegant furniture, warm lighting, no people, photorealistic interior photography',
            },
          },
          {
            label: '温泉汤屋',
            patch: {
              prompt:
                'private Japanese onsen bathhouse with steaming outdoor pool, bamboo and stone textures, warm lantern light, night sky, no people, photorealistic',
            },
          },
          {
            label: '办公室',
            patch: {
              prompt:
                'modern corner office at dusk, desk with laptop, city skyline through glass wall, warm desk lamp, no people, photorealistic interior photography',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      loraField('场景图一般不挂 LoRA'),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      prompt:
        'empty cozy modern bedroom at dusk, warm ambient lamp light, large window with city night view, tasteful interior design, no people, photorealistic interior photography, high detail',
      negative: 'person, people, human, figure, ' + FLUX_NEG_BASE,
      width: 1216,
      height: 832,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 4. 生成服装 / 道具 ────────────────────────────────────────
  {
    key: 'wf-outfit',
    name: '生成服装 / 道具',
    category: 'image',
    engine: 'flux',
    icon: 'Shirt',
    sort_order: 4,
    description: '衣橱服装（隐形模特 ghost mannequin）与商城道具图标，无真人',
    params_schema: [
      {
        key: 'prompt',
        type: 'textarea',
        label: '服装 / 道具描述',
        required: true,
        chips: [
          {
            label: '性感内衣',
            patch: {
              prompt:
                'sexy lace lingerie set displayed on invisible ghost mannequin, no person no face, full garment front view, wardrobe showcase, studio product lighting, 8k detail',
            },
          },
          {
            label: '女仆装',
            patch: {
              prompt:
                'cute french maid costume displayed on invisible ghost mannequin, no person no face, full garment front view, wardrobe showcase, studio product lighting, 8k detail',
            },
          },
          {
            label: '晚礼服',
            patch: {
              prompt:
                'elegant black evening gown displayed on invisible ghost mannequin, no person no face, flowing fabric, full garment front view, studio product lighting, 8k detail',
            },
          },
          {
            label: '运动装',
            patch: {
              prompt:
                'sporty two-piece workout set displayed on invisible ghost mannequin, no person no face, full garment front view, wardrobe showcase, studio product lighting, 8k detail',
            },
          },
          {
            label: 'RPG 武器',
            patch: {
              prompt:
                'fantasy RPG weapon, glowing enchanted blade, centered product shot on dark background, magical particles, game inventory icon, 8k detail',
            },
          },
          {
            label: '魔法道具',
            patch: {
              prompt:
                'fantasy game prop icon, magical special effects, glowing aura, particles, RPG loot, centered product, 8k',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      loraField(),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      prompt:
        'sexy lace lingerie set displayed on invisible ghost mannequin, no person no face, full garment front view, wardrobe showcase, studio product lighting, 8k detail',
      negative:
        'person, people, human, face, hands, skin, model, mannequin head, ' + FLUX_NEG_BASE,
      width: 1024,
      height: 1024,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 5. 一键换装 ────────────────────────────────────────────────
  {
    key: 'wf-tryon',
    name: '一键换装',
    category: 'image',
    engine: 'flux',
    icon: 'Wand2',
    sort_order: 5,
    description: '上传角色图，提示词指定新服装；img2img + IP-Adapter 保脸',
    params_schema: [
      {
        key: 'input_image',
        type: 'image',
        label: '角色原图',
        required: true,
        hint: '要换装的原始角色图',
      },
      {
        key: 'denoise',
        type: 'slider',
        label: '重绘强度',
        min: 0.2,
        max: 0.95,
        step: 0.01,
        hint: '0.5~0.6 只换衣服；越高改动越大',
      },
      ...identityFields(false),
      {
        key: 'prompt',
        type: 'textarea',
        label: '新服装描述',
        required: true,
        chips: [
          {
            label: '性感内衣',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing sexy black lace lingerie, three-quarter body, bedroom soft light, photorealistic 8k',
            },
          },
          {
            label: '女仆装',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing a cute french maid outfit, three-quarter body, soft indoor light, photorealistic 8k',
            },
          },
          {
            label: 'OL 办公装',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing fitted office lady blouse and pencil skirt, three-quarter body, modern office, photorealistic 8k',
            },
          },
          {
            label: '晚礼服',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing an elegant evening gown, full body, warm event lighting, photorealistic 8k',
            },
          },
          {
            label: '兔女郎',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing a bunny girl costume with ears and stockings, three-quarter body, stage lighting, photorealistic 8k',
            },
          },
          {
            label: '比基尼',
            patch: {
              prompt:
                'same adult woman as the reference image, face and identity fully preserved, wearing a stylish bikini, full body, sunny beach, photorealistic 8k',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      loraField('推荐挂服装类 LoRA'),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      prompt:
        'same adult woman as the reference image, face and identity fully preserved, wearing sexy black lace lingerie, three-quarter body, bedroom soft light, photorealistic 8k',
      negative: 'different person, face change, ' + FLUX_NEG_BASE + ', child',
      input_image: '',
      denoise: 0.55,
      ip_adapter_image: '',
      ip_adapter_weight: 0.72,
      width: 832,
      height: 1216,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 6. 一键姿势替换 ────────────────────────────────────────────
  {
    key: 'wf-pose',
    name: '一键姿势替换',
    category: 'image',
    engine: 'flux',
    icon: 'PersonStanding',
    sort_order: 6,
    description: '保持角色身份与服装，仅替换姿势；img2img 重绘强度略高',
    params_schema: [
      { key: 'input_image', type: 'image', label: '角色原图', required: true },
      {
        key: 'denoise',
        type: 'slider',
        label: '重绘强度',
        min: 0.3,
        max: 0.95,
        step: 0.01,
        hint: '姿势变化大时用 0.65~0.8',
      },
      ...identityFields(false),
      {
        key: 'prompt',
        type: 'textarea',
        label: '新姿势描述',
        required: true,
        chips: [
          {
            label: '站立叉腰',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, standing with one hand on hip, confident weight shift, full body, consistent lighting, photorealistic',
            },
          },
          {
            label: '坐沙发',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, sitting relaxed on a sofa with legs crossed, cozy living room, consistent lighting, photorealistic',
            },
          },
          {
            label: '躺床上',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, lying on a bed propped on one elbow, looking at camera, bedroom soft light, photorealistic',
            },
          },
          {
            label: '回眸',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, looking back over her shoulder, back three-quarter view, natural environment, photorealistic',
            },
          },
          {
            label: '伸展',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, stretching arms above head, relaxed morning vibe, full body, soft window light, photorealistic',
            },
          },
          {
            label: '跪坐',
            patch: {
              prompt:
                'same woman as the reference, identical face and outfit, kneeling pose on soft carpet, gentle expression, full body, warm indoor light, photorealistic',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      intensityField(),
      loraField(),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      intensity: 1,
      prompt:
        'same woman as the reference, identical face and outfit, standing with one hand on hip, confident weight shift, full body, consistent lighting, photorealistic' + NATURAL_POSITIVE,
      negative: 'different person, face change, outfit change, ' + FLUX_NEG_BASE + ANTI_AI_NEGATIVE,
      input_image: '',
      denoise: 0.65,
      ip_adapter_image: '',
      ip_adapter_weight: 0.72,
      width: 832,
      height: 1216,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 7. 一键换背景 ──────────────────────────────────────────────
  {
    key: 'wf-bgswap',
    name: '一键换背景',
    category: 'image',
    engine: 'flux',
    icon: 'Image',
    sort_order: 7,
    description: '保持人物不变，仅重绘背景环境；低重绘强度保持主体稳定',
    params_schema: [
      { key: 'input_image', type: 'image', label: '角色原图', required: true },
      {
        key: 'denoise',
        type: 'slider',
        label: '重绘强度',
        min: 0.2,
        max: 0.9,
        step: 0.01,
        hint: '0.4~0.5 只换背景；过高会改动人',
      },
      ...identityFields(false),
      {
        key: 'prompt',
        type: 'textarea',
        label: '新背景描述',
        required: true,
        chips: [
          {
            label: '温馨卧室',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a cozy warm bedroom at night, seamless lighting match, photorealistic',
            },
          },
          {
            label: '海滩日落',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a tropical beach at sunset, golden light, seamless lighting match, photorealistic',
            },
          },
          {
            label: '豪华酒店',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a luxury hotel suite with city view, seamless lighting match, photorealistic',
            },
          },
          {
            label: '霓虹街头',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a neon-lit night street, cinematic mood, seamless lighting match, photorealistic',
            },
          },
          {
            label: '浴室',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a modern marble bathroom with soft warm light, seamless lighting match, photorealistic',
            },
          },
          {
            label: '花园',
            patch: {
              prompt:
                'same woman as the reference, identical face outfit and pose, new background of a blooming garden in soft daylight, seamless lighting match, photorealistic',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      loraField(),
      ...fluxAdvancedFields(),
    ],
    defaults: {
      prompt:
        'same woman as the reference, identical face outfit and pose, new background of a cozy warm bedroom at night, seamless lighting match, photorealistic',
      negative: 'different person, face change, outfit change, ' + FLUX_NEG_BASE,
      input_image: '',
      denoise: 0.45,
      ip_adapter_image: '',
      ip_adapter_weight: 0.7,
      width: 832,
      height: 1216,
      steps: 8,
      flux_guidance: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: -1,
      num_images: 1,
      ckpt_name: 'fluxUnchainedBySCG_hyfu8StepHybridV10.safetensors',
      loras: [],
    },
  },

  // ── 8. WAN 2.2 视频 ────────────────────────────────────────────
  {
    key: 'wf-wan-video',
    name: 'WAN 2.2 视频',
    category: 'video',
    engine: 'wan',
    icon: 'Video',
    sort_order: 8,
    description:
      'Wan 2.2 文生视频 / 图生视频（上传首帧图即为图生视频），5 秒 16fps，端点 standby 冷启动较慢',
    params_schema: [
      {
        key: 'image',
        type: 'image',
        label: '首帧参考图（可选）',
        hint: '上传 = 图生视频（推荐，人物一致）；留空 = 纯文生视频',
      },
      {
        key: 'prompt',
        type: 'textarea',
        label: '动作 / 运镜描述',
        required: true,
        chips: [
          {
            label: '微呼吸回眸',
            patch: {
              prompt:
                'the woman breathes gently, slowly turns her head toward the camera and smiles softly, hair swaying slightly, natural subtle motion, stable identity, smooth camera',
            },
          },
          {
            label: '头发飘动',
            patch: {
              prompt:
                'the woman stands in a gentle breeze, hair and clothes flowing naturally, soft ambient motion, stable identity, static camera',
            },
          },
          {
            label: '镜头推进',
            patch: {
              prompt:
                'slow cinematic push-in toward the woman, she keeps eye contact and smiles, subtle natural motion, stable identity, smooth dolly camera',
            },
          },
          {
            label: '挥手打招呼',
            patch: {
              prompt:
                'the woman raises her hand and waves at the camera with a warm smile, natural arm motion, stable identity, static camera',
            },
          },
        ],
      },
      { key: 'negative', type: 'textarea', label: '负面提示词' },
      intensityField(),
      { key: 'width', type: 'number', label: '宽度', advanced: true, min: 320, max: 1280, step: 16 },
      { key: 'height', type: 'number', label: '高度', advanced: true, min: 320, max: 1280, step: 16 },
      { key: 'num_frames', type: 'number', label: '帧数', advanced: true, min: 16, max: 161, step: 1, hint: '81 帧 ≈ 5 秒 @16fps' },
      { key: 'fps', type: 'number', label: '帧率', advanced: true, min: 8, max: 24 },
      { key: 'steps', type: 'number', label: '采样步数', advanced: true, min: 10, max: 60 },
      { key: 'guidance', type: 'slider', label: '引导强度', advanced: true, min: 1, max: 12, step: 0.5 },
      { key: 'seed', type: 'seed', label: '种子', advanced: true, hint: '-1 = 随机' },
    ],
    defaults: {
      intensity: 1,
      prompt:
        'the woman breathes gently, slowly turns her head toward the camera and smiles softly, hair swaying slightly, natural subtle motion, stable identity, smooth camera',
      negative: 'blurry, flicker, distorted face, extra limbs, watermark, text',
      image: '',
      width: 832,
      height: 480,
      num_frames: 81,
      fps: 16,
      steps: 30,
      guidance: 5,
      seed: -1,
    },
  },

  // ── 9. 动态工作流（根据完整功能生成对应控件）──────────────────
  {
    key: 'wf-dynamic',
    name: '动态工作流 · 全功能',
    category: 'dynamic',
    engine: 'raw',
    icon: 'Braces',
    sort_order: 9,
    description:
      '粘贴任意 ComfyUI API 格式工作流 JSON，系统解析节点自动生成对应参数控件（文本/数值/种子/参考图/LoRA），直发统一端点',
    params_schema: [],
    defaults: {},
    workflow_json: DEFAULT_RAW_GRAPH,
  },
];
