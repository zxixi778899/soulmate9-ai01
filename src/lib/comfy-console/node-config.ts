/**
 * Node Control Configuration System
 * 控制节点的具体使用和参数配置方案
 */

export type ControlNetType = 'openpose' | 'depth' | 'canny' | 'normal';
export type ADetailerModel = 'nothing_v2' | 'face_yolov8m_v2' | 'face_yolov8s_v2' 
                             | 'hands_yolov8m_v2' | 'hand_yolov8n' | 'whole_yolov8n';
export type UpscalerModel = '4x_UltraSharp' | '4x_NetMRF_Comfortable_cat_dog' 
                            | '50000_bpsd_vectorized' | 'RealESRGAN_epxsR2AnSRv2_X_4.pth'
                            | 'RealESRGAN_x4plus.pth' | 'BSRGAN_x4.pth' | 'ESRGAN_4x';

// ============================================
// CONTROLNET CONFIGURATION
// ============================================

export const CONTROLNET_CONFIG = {
  // Preprocessor 类型及其映射
  preprocessors: [
    'none',            // 不使用预处理器
    'oneformer',       // OneFormer (场景分割)
    'mlsdash',         // MLS 线稿检测
    'dw_openpose_full',// DW Pose 完整版 (推荐用于姿态控制)
    'depth_zoehf',     // Zoe-Depth 深度图 (Holistic Depth)
    'canny_low_threshold', // Canny 低阈值边缘检测
    'lineart_realistic',// LineArt 真实场景线稿
    'softedge_anime',  // SoftEdge Anime 动漫边缘
  ] as const,

  // Strength 范围配置
  strength_range: {
    min: 0.1,
    max: 2.0,
    step: 0.05,
    recommended: {
      controlnet_type: {
        openpose: 0.8,   // 姿态控制 - 中等强度
        depth: 0.9,      // 深度控制 - 稍强
        canny: 0.7,      // 边缘控制 - 较弱
        normal: 0.75,    // 法线图 - 中等偏弱
      },
      task_type: {
        identity: 1.0,   // 身份锁定 - 最高强度
        portrait: 0.6,   // 头像生成 - 较低
        outfit: 0.4,     // 换装 - 很弱
        background: 0.3, // 背景 - 几乎不用
      }
    }
  } as const,

  // Guidance 配置 (ControlNet conditioning)
  guidance_config: {
    min: 1,
    max: 10,
    step: 0.5,
    default: 6,
    recommended: {
      // 高引导值 + 高强度 = 严格遵循预处理器
      strict: { guidance: 8, strength: 1.0 },
      moderate: { guidance: 6, strength: 0.8 },
      loose: { guidance: 4, strength: 0.6 },
    }
  } as const,

  // Type-specific 模型前缀和参数
  type_specific: {
    openpose: {
      preprocessor: 'dw_openpose_full',
      model_prefix: 'control_v11p_sd15_openpose',
      guide_steps: 8192,  // ControlNet 引导步数
      confidence: 0.9,    // 检测置信度要求
    },
    depth: {
      preprocessor: 'depth_zoehf',
      model_prefix: 'control_v11f1e_sd15_depth',
      guide_steps: 4000,
      confidence: 0.85,
    },
    canny: {
      preprocessor: 'canny_low_threshold',
      model_prefix: 'control_v11p_sd15_canny',
      guide_steps: 2048,
      confidence: 0.95,
    },
    normal: {
      preprocessor: 'normal_bae',
      model_prefix: 'control_v11p_sd15_normalbae',
      guide_steps: 3072,
      confidence: 0.88,
    },
  } as const,

} as const;

// ============================================
// ADETAILER CONFIGURATION
// ============================================

export const ADETAILER_MODELS = {
  nothing_v2: {
    name: 'Nothing V2',
    desc: '不启用 ADetailer',
    detect_model: 'None',
    confidence: 0.6,
    denoise: 0.45,
    area: 'face',
  } as const,
  
  face_yolov8m_v2: {
    name: 'Face YOLOv8 M v2',
    desc: '中精度面部修复',
    detect_model: 'yolov8m-face.pt',
    confidence: 0.6,
    denoise: 0.45,
    area: 'face',
  } as const,
  
  face_yolov8s_v2: {
    name: 'Face YOLOv8 S v2',
    desc: '轻量级面部修复',
    detect_model: 'yolov8s-face.pt',
    confidence: 0.55,
    denoise: 0.4,
    area: 'face',
  } as const,
  
  hands_yolov8m_v2: {
    name: 'Hands YOLOv8 M v2',
    desc: '手部修复',
    detect_model: 'yolov8m-hand.pt',
    confidence: 0.7,
    denoise: 0.35,
    area: 'head',
  } as const,
  
  hand_yolov8n: {
    name: 'Hand YOLOv8 N',
    desc: '轻量级手部修复',
    detect_model: 'yolov8n-hand.pt',
    confidence: 0.65,
    denoise: 0.3,
    area: 'nose_only',
  } as const,
  
  whole_yolov8n: {
    name: 'Whole YOLOv8 N',
    desc: '全身优化',
    detect_model: 'yolov8n.pt',
    confidence: 0.5,
    denoise: 0.5,
    area: 'face',
  } as const,
} as const;

export const ADETAILER_PARAMS = {
  confidence_range: {
    min: 0.05,
    max: 1.0,
    step: 0.05,
    default: 0.6,
  },
  denoise_range: {
    min: 0.1,
    max: 1.0,
    step: 0.02,
    default: 0.45,
  },
  areas: ['face', 'head', 'nose_only'] as const,
  recommendations: {
    // 根据不同任务推荐参数
    portrait: {
      model: 'face_yolov8m_v2' as ADetailerModel,
      confidence: 0.6,
      denoise: 0.45,
      enable: true,
    },
    full_body: {
      model: 'nothing_v2' as ADetailerModel,
      confidence: 0.0,
      denoise: 0.0,
      enable: false,
    },
    closeup: {
      model: 'face_yolov8s_v2' as ADetailerModel,
      confidence: 0.65,
      denoise: 0.5,
      enable: true,
    },
  },
} as const;

// ============================================
// UPSCALER CONFIGURATION
// ============================================

export const UPSCALER_MODELS = {
  '4x_UltraSharp': {
    name: '4x UltraSharp',
    best_for: '动漫插画高清化',
    scale: 4,
    tile_size: 512,
  } as const,
  
  '4x_NetMRF_Comfortable_cat_dog': {
    name: 'NetMRF Cat/Dog',
    best_for: '动物卡通角色',
    scale: 4,
    tile_size: 1024,
  } as const,
  
  '50000_bpsd_vectorized': {
    name: '50000 bpsd vectorized',
    best_for: '矢量线条重绘',
    scale: 4,
    tile_size: 256,
  } as const,
  
  'RealESRGAN_epxsR2AnSRv2_X_4.pth': {
    name: 'RealESRGAN epxsR2AnSRv2-X-4',
    best_for: '真实场景照片',
    scale: 4,
    tile_size: 512,
  } as const,
  
  'RealESRGAN_x4plus.pth': {
    name: 'RealESRGAN x4plus',
    best_for: '通用高质量放大',
    scale: 4,
    tile_size: 768,
  } as const,
  
  'BSRGAN_x4.pth': {
    name: 'BSRGAN x4',
    best_for: '快速实用放大',
    scale: 4,
    tile_size: 512,
  } as const,
  
  'ESRGAN_4x': {
    name: 'ESRGAN 4x',
    best_for: '经典效果',
    scale: 4,
    tile_size: 512,
  } as const,
} as const;

export const UPSCALER_PARAMS = {
  scale_factors: [2, 3, 4] as const,
  tile_size_options: [256, 512, 768, 1024, 2048],
  denoise_range: {
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.3,
  },
  recommendations: {
    img2img_upscale: {
      model: 'RealESRGAN_x4plus.pth' as UpscalerModel,
      scale: 4,
      denoise: 0.3,
    },
    detail_preservation: {
      model: '4x_UltraSharp' as UpscalerModel,
      scale: 2,
      denoise: 0.1,
    },
  },
} as const;

// ============================================
// NODE COMBINATION WORKFLOWS
// ============================================

export const NODE_WORKFLOWS = {
  // Workflow 1: Identity + ControlNet + IP-Adapter
  identity_portrait: {
    enabled_nodes: {
      ip_adapter: true,
      controlnet: true,
      adetailer: false,
      upscale: false,
    },
    parameters: {
      ip_adapter_weight: 1.0,
      controlnet_strength: 1.0,
      controlnet_guidance: 8,
      adetailer_enable: false,
      upscale_enable: false,
    },
    description: '人物一致性肖像生成',
  },

  // Workflow 2: Outfit Change (轻度 ControlNet)
  outfit_change: {
    enabled_nodes: {
      ip_adapter: true,
      controlnet: true,
      adetailer: false,
      upscale: false,
    },
    parameters: {
      ip_adapter_weight: 1.0,
      controlnet_strength: 0.4,
      controlnet_guidance: 4,
      preprocessor: 'canny_low_threshold',
      adetailer_enable: false,
      upscale_enable: false,
    },
    description: '换装/姿势调整',
  },

  // Workflow 3: Face Refinement (ADetailer)
  face_refinement: {
    enabled_nodes: {
      ip_adapter: true,
      controlnet: false,
      adetailer: true,
      upscale: false,
    },
    parameters: {
      ip_adapter_weight: 1.0,
      adetailer_model: 'face_yolov8m_v2' as ADetailerModel,
      adetailer_confidence: 0.6,
      adetailer_denoise: 0.45,
      upscale_enable: false,
    },
    description: '面部细节修复',
  },

  // Workflow 4: Full Pipeline (All Nodes)
  full_pipeline: {
    enabled_nodes: {
      ip_adapter: true,
      controlnet: true,
      adetailer: true,
      upscale: true,
    },
    parameters: {
      // IP-Adapter
      ip_adapter_weight: 1.0,
      
      // ControlNet
      controlnet_type: 'openpose' as ControlNetType,
      controlnet_strength: 0.8,
      controlnet_guidance: 6,
      
      // ADetailer
      adetailer_model: 'face_yolov8m_v2' as ADetailerModel,
      adetailer_confidence: 0.6,
      adetailer_denoise: 0.45,
      
      // Upscaler
      upscale_model: 'RealESRGAN_x4plus.pth' as UpscalerModel,
      upscale_scale: 4,
      upscale_denoise: 0.3,
    },
    description: '全流程高质量生成',
  },
} as const;

// ============================================
// USAGE EXAMPLES
// ============================================

/**
 * Example 1: Generate character portrait with identity control
 */
export const EXAMPLE_PORTRAIT = {
  prompt: "waist-up portrait of a 22-year-old Slavic woman",
  negative: "blurry, low quality, deformed",
  nodes: {
    ip_adapter: { enabled: true, weight: 1.0 },
    controlnet: { enabled: true, type: 'openpose', strength: 0.8, guidance: 8 },
    adetailer: { enabled: false },
    upscale: { enabled: false },
  },
};

/**
 * Example 2: Outfit change with minimal changes
 */
export const EXAMPLE_OUTFIT = {
  prompt: "",  // 空提示词，仅依赖参考图和 ControlNet
  negative: "clothing, clothes, shirt",  // 排除服装变化
  gen_mode: "img2img" as const,
  denoise: 0.72,
  nodes: {
    ip_adapter: { enabled: true, weight: 1.0 },
    controlnet: { enabled: true, type: 'canny', strength: 0.4, guidance: 4 },
    adetailer: { enabled: false },
    upscale: { enabled: false },
  },
};

/**
 * Example 3: High-quality final production
 */
export const EXAMPLE_HIGH_QUALITY = {
  prompt: "professional studio portrait",
  nodes: {
    ip_adapter: { enabled: true, weight: 1.0 },
    controlnet: { enabled: true, type: 'openpose', strength: 0.8, guidance: 6 },
    adetailer: { enabled: true, model: 'face_yolov8m_v2', confidence: 0.6, denoise: 0.45 },
    upscale: { enabled: true, model: 'RealESRGAN_x4plus.pth', scale: 4, denoise: 0.3 },
  },
};

export default {
  CONTROLNET_CONFIG,
  ADETAILER_MODELS,
  ADETAILER_PARAMS,
  UPSCALER_MODELS,
  UPSCALER_PARAMS,
  NODE_WORKFLOWS,
};
