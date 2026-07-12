/**
 * Admin 图库 · 女友卡批量/单张生成用的 LoRA 选项（中文说明）。
 * 与盘上 models/loras 文件名对齐；一次只挂 1 个 LoRA（Comfy LoraLoader）。
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
  /** 是否在盘上（推荐已下载的核心包） */
  coreOnVolume?: boolean;
  nsfw?: boolean;
};

/** 固定选项：自动 / 关闭 / 已下载核心 + 可选服装 */
export const GIRLFRIEND_LORA_OPTIONS: GirlfriendLoraOption[] = [
  {
    id: 'auto',
    labelZh: '自动（按角色标签选）',
    filename: null,
    defaultStrength: 0.55,
    effectZh:
      '根据性格/标签/身材关键词自动挑 1 个 LoRA。默认优先写实风格 photoreal；有曲线身材词会切 body-curvy；特定服装词才切 outfit（需盘上有对应文件）。',
    ruleZh:
      '日常批量补图、不熟模型时用这个。日志会显示最终选中的文件名。未上盘的 outfit/pose 会自动回退到写实风格 LoRA，不会再因 value_not_in_list 整单失败。',
    coreOnVolume: true,
  },
  {
    id: 'none',
    labelZh: '不使用 LoRA',
    filename: null,
    defaultStrength: 0,
    effectZh: '纯 FLUX 底模，不加载任何 LoRA。对比测试用。',
    ruleZh: '排查「是不是 LoRA 导致脸糊/过塑」时选。画质通常不如挂 style 的稳定。',
    coreOnVolume: true,
  },
  {
    id: 'style-photoreal',
    labelZh: '[风格] 写实摄影风',
    filename: 'flux_style_photoreal_v1.safetensors',
    defaultStrength: 0.55,
    effectZh: '提升整体写实感、皮肤与光影，减少塑料 AI 脸。女友卡默认推荐。',
    ruleZh: '强度建议 0.45–0.65。过高会抹掉角色五官差异。与 body LoRA 二选一（当前图一次只挂 1 个）。',
    coreOnVolume: true,
  },
  {
    id: 'style-hyperreal',
    labelZh: '[风格] 超写实 AIDMA',
    filename: 'flux_style_hyperreal_aidma_v1.safetensors',
    defaultStrength: 0.5,
    effectZh: '更「广告级」锐利写实，细节更硬。',
    ruleZh: '强度 0.4–0.55。过强容易假精修感。适合要高清宣传图时。',
    coreOnVolume: true,
  },
  {
    id: 'detail-skin',
    labelZh: '[细节] 皮肤质感',
    filename: 'flux_detail_skin_v1.safetensors',
    defaultStrength: 0.4,
    effectZh: '增强毛孔/皮肤纹理，减轻磨皮感。',
    ruleZh: '强度 0.3–0.45。过高会出脏斑。脸部近景或怀疑「假皮肤」时用。',
    coreOnVolume: true,
  },
  {
    id: 'detail-skin-nplastic',
    labelZh: '[细节] 去塑料皮肤',
    filename: 'flux_detail_skin_nplastic_v1.safetensors',
    defaultStrength: 0.4,
    effectZh: '专门压「蜡像/塑料皮肤」。',
    ruleZh: '强度 0.3–0.5。与 detail-skin 二选一即可。',
    coreOnVolume: true,
  },
  {
    id: 'detail-hands',
    labelZh: '[细节] 手部',
    filename: 'flux_detail_hands_v1.safetensors',
    defaultStrength: 0.45,
    effectZh: '改善手指数量与手部结构（不完全保证）。',
    ruleZh: '自拍举手、端杯子等手部明显的场景可试。强度 0.35–0.55。',
    coreOnVolume: true,
  },
  {
    id: 'body-curvy',
    labelZh: '[身材] 丰满曲线',
    filename: 'flux_body_curvy_v1.safetensors',
    defaultStrength: 0.55,
    effectZh: '加强胸腰臀曲线，适合展示身材的 3/4 身女友卡。',
    ruleZh: '强度 0.45–0.7。过高会比例夸张。提示词里仍要写清楚 pose/framing。',
    coreOnVolume: true,
    nsfw: true,
  },
  {
    id: 'body-pear',
    labelZh: '[身材] 梨形/宽胯',
    filename: 'flux_body_pear_v1.safetensors',
    defaultStrength: 0.55,
    effectZh: '偏宽胯厚腿，差异化体型。',
    ruleZh: '角色卡写了 pear / thick thighs 时用。强度 0.45–0.65。',
    coreOnVolume: true,
    nsfw: true,
  },
  {
    id: 'outfit-lingerie',
    labelZh: '[服装] 内衣（需盘上有文件）',
    filename: 'flux_outfit_lingerie_v1.safetensors',
    defaultStrength: 0.62,
    effectZh: '辅助内衣/丝袜造型一致性。',
    ruleZh: '若下载失败（Civitai 401）请勿选。强度 0.55–0.7。提示词仍要写具体服装。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'outfit-bunny',
    labelZh: '[服装] 兔女郎（需盘上有文件）',
    filename: 'flux_outfit_bunny_v1.safetensors',
    defaultStrength: 0.65,
    effectZh: '兔女郎/紧身连体造型。',
    ruleZh: '文件未下载时会失败。强度 0.55–0.7。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'outfit-maid',
    labelZh: '[服装] 女仆（需盘上有文件）',
    filename: 'flux_outfit_maid_v1.safetensors',
    defaultStrength: 0.65,
    effectZh: '女仆装造型。',
    ruleZh: '文件未下载时会失败。强度 0.55–0.7。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'outfit-bikini',
    labelZh: '[服装] 比基尼（需盘上有文件）',
    filename: 'flux_outfit_bikini_v1.safetensors',
    defaultStrength: 0.62,
    effectZh: '泳装/沙滩场景。',
    ruleZh: '文件未下载时会失败。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'outfit-latex',
    labelZh: '[服装] 乳胶/PVC（需盘上有文件）',
    filename: 'flux_outfit_latex_v1.safetensors',
    defaultStrength: 0.6,
    effectZh: '亮面紧身乳胶感。',
    ruleZh: '文件未下载时会失败。强度勿超过 0.75。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'outfit-school',
    labelZh: '[服装] 制服（成人 · 需盘上有文件）',
    filename: 'flux_outfit_school_v1.safetensors',
    defaultStrength: 0.6,
    effectZh: '成人制服造型（仅 18+ 角色）。',
    ruleZh: '禁止未成年暗示。文件未下载时会失败。',
    nsfw: true,
    coreOnVolume: false,
  },
  {
    id: 'pose-nsfw',
    labelZh: '[动作] 动态 NSFW 姿态（需盘上有文件）',
    filename: 'flux_pose_nsfw_dynamic_v1.safetensors',
    defaultStrength: 0.55,
    effectZh: '丰富性感动态姿势，减轻「同一站姿」。',
    ruleZh: '文件未下载时会失败。强度 0.45–0.65。提示词仍要写具体动作。',
    nsfw: true,
    coreOnVolume: false,
  },
];

export function getGirlfriendLoraOption(id: string): GirlfriendLoraOption | undefined {
  return GIRLFRIEND_LORA_OPTIONS.find((o) => o.id === id);
}

/**
 * 把 UI 选项转成 batch / generate-from-meta 的 params 字段。
 * auto → 不传 lora_name（后端 resolveGirlfriendLoraPlan）
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

export const GIRLFRIEND_LORA_HELP_ZH = `使用规则（读一遍再批量）
1. 一次只挂 1 个 LoRA（当前 Comfy 图结构限制）。
2. 提示词负责：人物特征 + 动作 + 环境；LoRA 负责：写实/皮肤/身材/服装倾向。
3. 盘上已有核心：写实风格、超写实、皮肤、去塑料、手部、丰满曲线、梨形。服装类若未下载会失败。
4. 强度：风格/皮肤偏低（0.4–0.55），身材/服装可略高（0.55–0.7）。
5. 批量默认「自动」= 多数角色走写实风格 @0.55；日志会打印实际文件名。
6. 想对比效果：同一角色分别用「不使用 / 写实 / 丰满曲线」各出 1 张。`;
