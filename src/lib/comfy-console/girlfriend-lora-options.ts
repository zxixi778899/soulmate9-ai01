/**
 * Admin 图库 · 伴侣卡批量/单张生成用的 LoRA 选项（中文说明）。
 * 与 /runpod-volume/models/loras/ 实际文件名完全对齐 (2026-07-27)。
 * 路由逻辑由 model-lora-routing.ts DEFAULT_FAMILY_LORAS 控制。
 *
 * 卷上已部署 10 个 LoRA (1.5GB):
 * FLUX: realism_xlabs / krea_realism / hyperrealism_aidma / add_details /
 *       detail_enhancer / uncensored / nsfw_klein_v2
 * Pony: detailifier_v5
 * Illustrious: AddMicroDetails_v6 / StS-Detail-Slider
 */
export type GirlfriendLoraOption = {
  id: string;
  /** 下拉显示名（中文） */
  labelZh: string;
  /** 传给 RunPod 的文件名；auto/none 为空 */
  filename: string | null;
  /** 默认强度 0–1 */
  defaultStrength: number;
  /** 作用说明 */
  effectZh: string;
  /** 使用规则 */
  ruleZh: string;
  /** 是否在盘上 */
  coreOnVolume?: boolean;
  /** 所属模型族 */
  family?: 'flux' | 'pony' | 'illustrious';
  nsfw?: boolean;
};

/** 固定选项：自动 / 关闭 / 卷上实际 LoRA */
export const GIRLFRIEND_LORA_OPTIONS: GirlfriendLoraOption[] = [
  {
    id: 'auto',
    labelZh: '自动（按性别+场景路由）',
    filename: null,
    defaultStrength: 0.55,
    effectZh:
      '根据角色性别(category)和NSFW强度自动选择LoRA栈。FLUX女性→xlabs+details+uncensored三件套；男性→krea；跨性别→aidma；Pony→detailifier；NSFW≥3追加klein_v2。',
    ruleZh:
      '日常批量补图首选。由 resolveModelLoraPlan() 按 family+category+intensity 自动计算，最多叠3个LoRA，强度自动递减。日志显示最终选中栈。',
    coreOnVolume: true,
  },
  {
    id: 'none',
    labelZh: '不使用 LoRA',
    filename: null,
    defaultStrength: 0,
    effectZh: '纯底模输出（FLUX/Pony/Illustrious），不加载任何 LoRA。对比测试用。',
    ruleZh: '排查「LoRA 导致脸糊/过塑/风格偏移」时选。画质通常不如挂 LoRA 的稳定。',
    coreOnVolume: true,
  },
  // ─── FLUX 写实类 ───────────────────────────────────────────
  {
    id: 'flux-realism-xlabs',
    labelZh: '[FLUX·写实] XLabs 女性写实',
    filename: 'flux_realism_xlabs.safetensors',
    defaultStrength: 0.58,
    effectZh: '女性写实人像主LoRA。提升皮肤质感、光影自然度，减少AI塑料感。',
    ruleZh: '强度 0.5–0.65。自动路由时搭配 add_details + uncensored 三件套。单独使用也有效。',
    coreOnVolume: true,
    family: 'flux',
  },
  {
    id: 'flux-krea-realism',
    labelZh: '[FLUX·写实] Krea 男性写实',
    filename: 'flux_krea_realism.safetensors',
    defaultStrength: 0.58,
    effectZh: '男性写实主LoRA。Krea风格自然光影，阳刚面部结构。',
    ruleZh: '强度 0.5–0.65。自动路由时搭配 add_details + uncensored。男性角色首选。',
    coreOnVolume: true,
    family: 'flux',
  },
  {
    id: 'flux-hyperrealism-aidma',
    labelZh: '[FLUX·写实] AIDMA 超写实',
    filename: 'flux_hyperrealism_aidma.safetensors',
    defaultStrength: 0.58,
    effectZh: '超写实/广告级锐利画面。跨性别角色默认路由。也适合需要极致清晰度的场景。',
    ruleZh: '强度 0.5–0.6。过强容易假精修感。搭配 add_details + uncensored。',
    coreOnVolume: true,
    family: 'flux',
  },
  // ─── FLUX 细节/功能类 ─────────────────────────────────────
  {
    id: 'flux-add-details',
    labelZh: '[FLUX·细节] Shakker 全局细节增强',
    filename: 'flux_add_details.safetensors',
    defaultStrength: 0.5,
    effectZh: '通用细节增强辅助LoRA(656MB)。增强皮肤纹理、衣物褶皱、环境细节。所有FLUX写实路由必挂。',
    ruleZh: '强度 0.4–0.55，不宜过高。作为第2/3个LoRA叠加使用，不建议单独挂。',
    coreOnVolume: true,
    family: 'flux',
  },
  {
    id: 'flux-detail-enhancer',
    labelZh: '[FLUX·细节] 动漫细节增强器',
    filename: 'flux_detail_enhancer.safetensors',
    defaultStrength: 0.5,
    effectZh: 'FLUX anime/2.5D风格细节增强。用于anime路由，增强线稿清晰度和色彩层次。',
    ruleZh: '强度 0.45–0.6。anime风格角色专用。不与写实三件套叠加。',
    coreOnVolume: true,
    family: 'flux',
  },
  {
    id: 'flux-uncensored',
    labelZh: '[FLUX·功能] 解除内容审查',
    filename: 'flux_uncensored.safetensors',
    defaultStrength: 0.5,
    effectZh: '解除FLUX内容限制，允许生成NSFW内容。无风格影响，纯功能性LoRA。',
    ruleZh: '强度 0.45–0.55。所有写实路由自动挂载。无需触发词。NSFW≥3时被klein_v2替代。',
    coreOnVolume: true,
    family: 'flux',
  },
  {
    id: 'flux-nsfw-klein-v2',
    labelZh: '[FLUX·NSFW] Klein V2 解剖增强',
    filename: 'flux_nsfw_klein_v2.safetensors',
    defaultStrength: 0.65,
    effectZh: 'FLUX专用NSFW LoRA。增强解剖学细节、身体结构真实性。intensity≥3时自动挂载。',
    ruleZh: '强度 0.55–0.72。仅NSFW场景使用。自动路由时替代uncensored。',
    coreOnVolume: true,
    family: 'flux',
    nsfw: true,
  },
  // ─── Pony ─────────────────────────────────────────────────
  {
    id: 'pony-detailifier-v5',
    labelZh: '[Pony·万能] Detailifier V5',
    filename: 'pony_detailifier_v5.safetensors',
    defaultStrength: 0.55,
    effectZh: 'Pony模型万能细节LoRA。所有Pony路由统一使用。增强整体画面精细度。',
    ruleZh: '强度 0.45–0.65。触发词: detailerlora（必须加入prompt）。Pony底模唯一LoRA。',
    coreOnVolume: true,
    family: 'pony',
  },
  // ─── Illustrious ──────────────────────────────────────────
  {
    id: 'illustrious-micro-details',
    labelZh: '[Illustrious·细节] 微细节 V6',
    filename: 'AddMicroDetails_Illustrious_v6.safetensors',
    defaultStrength: 0.55,
    effectZh: 'Illustrious底模微细节增强。皮肤纹理、衣物褶皱、发丝光泽。所有Illustrious路由主LoRA。',
    ruleZh: '强度 0.45–0.6。触发词: micro details, detailed skin。搭配BackgroundDetailer效果更佳。',
    coreOnVolume: true,
    family: 'illustrious',
  },
  {
    id: 'illustrious-detail-slider',
    labelZh: '[Illustrious·2D] 细节滑块',
    filename: 'StS-Illustrious-Detail-Slider-v1.0.safetensors',
    defaultStrength: 0.5,
    effectZh: 'Illustrious 2D/平面风格细节控制。animeStyle=2d时挂载，增强线稿和色块清晰度。',
    ruleZh: '强度 0.4–0.55。触发词: detail slider。2D风格专用，替代MicroDetails。',
    coreOnVolume: true,
    family: 'illustrious',
  },
  // ─── 待部署 ───────────────────────────────────────────────
  {
    id: 'illustrious-background-detailer',
    labelZh: '[Illustrious·背景] BackgroundDetailer V3（待部署）',
    filename: 'BackgroundDetailerV3-000004.safetensors',
    defaultStrength: 0.5,
    effectZh: '背景/场景细节增强。风景、建筑、室内环境细节。搭配MicroDetails使用。',
    ruleZh: '⚠️ 尚未部署到卷上（需Civitai下载）。选择后会因文件缺失回退到auto。触发词: detailed background。',
    coreOnVolume: false,
    family: 'illustrious',
  },
];

export function getGirlfriendLoraOption(id: string): GirlfriendLoraOption | undefined {
  return GIRLFRIEND_LORA_OPTIONS.find((o) => o.id === id);
}

/** 获取指定模型族的可用选项 */
export function getLoraOptionsByFamily(family: 'flux' | 'pony' | 'illustrious'): GirlfriendLoraOption[] {
  return GIRLFRIEND_LORA_OPTIONS.filter(
    (o) => o.id === 'auto' || o.id === 'none' || o.family === family,
  );
}

/** 获取卷上已安装的核心选项 */
export function getInstalledLoraOptions(): GirlfriendLoraOption[] {
  return GIRLFRIEND_LORA_OPTIONS.filter((o) => o.coreOnVolume && o.filename);
}

/**
 * 把 UI 选项转成 batch / generate-from-meta 的 params 字段。
 * auto → 不传 lora_name（后端 resolveModelLoraPlan 自动路由）
 * none → disable_lora: true
 * 其它 → lora_name + strength
 */
export function buildLoraBatchParams(
  optionId: string,
  strengthOverride?: number,
): {
  lora_name?: string | null;
  disable_lora?: boolean;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  lora_option_id?: string;
} {
  const opt = getGirlfriendLoraOption(optionId) || getGirlfriendLoraOption('auto')!;
  if (opt.id === 'auto') {
    return { lora_option_id: 'auto' };
  }
  if (opt.id === 'none' || !opt.filename) {
    return {
      disable_lora: true,
      lora_name: null,
      lora_option_id: 'none',
      lora_strength_model: 0,
      lora_strength_clip: 0,
    };
  }
  // 未安装的文件回退到 auto
  if (!opt.coreOnVolume) {
    return { lora_option_id: 'auto' };
  }
  const s =
    typeof strengthOverride === 'number' && !Number.isNaN(strengthOverride)
      ? Math.min(1, Math.max(0.05, strengthOverride))
      : opt.defaultStrength;
  return {
    lora_name: opt.filename,
    disable_lora: false,
    lora_strength_model: s,
    lora_strength_clip: s,
    lora_option_id: opt.id,
  };
}

export const GIRLFRIEND_LORA_HELP_ZH = `LoRA 使用规则（2026-07-27 实际部署）

卷上已部署 10 个 LoRA（1.5GB），路径 /runpod-volume/models/loras/：
• FLUX (7个): xlabs写实 / krea男性 / aidma超写实 / add_details细节 / detail_enhancer动漫 / uncensored解禁 / klein_v2 NSFW
• Pony (1个): detailifier_v5 万能细节
• Illustrious (2个): MicroDetails微细节 / DetailSlider 2D滑块

自动路由规则（resolveModelLoraPlan）：
• FLUX 女性: xlabs + add_details + uncensored（三件套）
• FLUX 男性: krea + add_details + uncensored
• FLUX 跨性别: aidma + add_details + uncensored
• FLUX 动漫: detail_enhancer
• FLUX NSFW≥3: 追加 klein_v2（替代 uncensored）
• Pony 全部: detailifier_v5（触发词 detailerlora）
• Illustrious 全部: MicroDetails + BackgroundDetailer(待部署)
• Illustrious 2D: DetailSlider

强度自动计算: base=0.5~0.72(按intensity)，每叠加一个递减0.08，总强度cap 1.65。
批量默认「自动」即可，系统按性别+场景智能选栈。`;
