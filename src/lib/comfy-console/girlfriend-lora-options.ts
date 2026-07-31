import catalog from '../../../data/lora-catalog.json';

export type GirlfriendLoraOption = {
  id: string;
  labelZh: string;
  filename: string | null;
  defaultStrength: number;
  effectZh: string;
  ruleZh: string;
  coreOnVolume?: boolean;
  family?: 'flux' | 'pony' | 'illustrious';
  nsfw?: boolean;
};

type CatalogRow = {
  id: string;
  label: string;
  filename: string;
  default_strength: number;
  usage: string;
  family: 'flux' | 'pony' | 'illustrious';
  nsfw?: boolean;
};

export const GIRLFRIEND_LORA_OPTIONS: GirlfriendLoraOption[] = [
  {
    id: 'auto', labelZh: '自动（仅从运行卷已验证清单选择）', filename: null,
    defaultStrength: 0.3, effectZh: '根据模型家族和场景选择已验证文件。',
    ruleZh: '运行卷清单不可用时自动退化为零 LoRA。', coreOnVolume: false,
  },
  {
    id: 'none', labelZh: '不使用 LoRA', filename: null, defaultStrength: 0,
    effectZh: '只使用基础模型。', ruleZh: '头像和三视图固定使用此模式。', coreOnVolume: true,
  },
  ...((catalog.loras || []) as CatalogRow[]).map((item) => ({
    id: item.id,
    labelZh: `[${item.family.toUpperCase()}] ${item.label}`,
    filename: item.filename,
    defaultStrength: item.default_strength,
    effectZh: item.usage,
    ruleZh: '仅当 RUNPOD_INSTALLED_LORAS_* 确认文件存在时后端才会加载。',
    coreOnVolume: false,
    family: item.family,
    nsfw: !!item.nsfw,
  })),
];

export function getGirlfriendLoraOption(id: string): GirlfriendLoraOption | undefined {
  return GIRLFRIEND_LORA_OPTIONS.find((option) => option.id === id);
}

export function getLoraOptionsByFamily(family: 'flux' | 'pony' | 'illustrious'): GirlfriendLoraOption[] {
  return GIRLFRIEND_LORA_OPTIONS.filter((option) => option.id === 'auto' || option.id === 'none' || option.family === family);
}

export function getInstalledLoraOptions(): GirlfriendLoraOption[] {
  return GIRLFRIEND_LORA_OPTIONS.filter((option) => option.coreOnVolume && option.filename);
}

export function buildLoraBatchParams(optionId: string, strengthOverride?: number): {
  lora_name?: string | null;
  disable_lora?: boolean;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  lora_option_id?: string;
} {
  const option = getGirlfriendLoraOption(optionId) || getGirlfriendLoraOption('auto')!;
  if (option.id === 'auto') return { lora_option_id: 'auto' };
  if (option.id === 'none' || !option.filename) {
    return { disable_lora: true, lora_name: null, lora_option_id: 'none', lora_strength_model: 0, lora_strength_clip: 0 };
  }
  const strength = typeof strengthOverride === 'number' && Number.isFinite(strengthOverride)
    ? Math.min(0.9, Math.max(0.05, strengthOverride))
    : option.defaultStrength;
  return {
    lora_name: option.filename,
    disable_lora: false,
    lora_strength_model: strength,
    lora_strength_clip: strength,
    lora_option_id: option.id,
  };
}

export const GIRLFRIEND_LORA_HELP_ZH = 'LoRA 可用性以 RunPod 挂载卷清单为准。头像和三视图禁用 LoRA；立绘和相册使用参考图保持身份，LoRA 只补充明确风格、动作或服装。';