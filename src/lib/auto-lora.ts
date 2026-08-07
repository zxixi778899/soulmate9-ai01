/**
 * 自动 LoRA：按「性别 + 渲染风格 + NSFW 强度」固定组合，保证输出稳定。
 * 控制台/后台提交时若未手动选 LoRA，则用这里的结果兜底（只选已安装文件）。
 */

export type LoraAutoPick = { id: string; strength: number };

type AutoConfig = {
  loras: Array<{ id: string; filename?: string | null }>;
  installed_loras?: Array<string | null>;
};

const AUTO_MATRIX: Record<string, LoraAutoPick[]> = {
  female: [
    { id: 'flux-style-photoreal-v1', strength: 0.28 },
    { id: 'flux-detail-skin-v1', strength: 0.2 },
  ],
  male: [
    { id: 'flux-male-masc-v1', strength: 0.32 },
    { id: 'flux-detail-skin-v1', strength: 0.18 },
  ],
  transgender: [
    { id: 'flux-mtf-trans-v1', strength: 0.32 },
    { id: 'flux-detail-skin-v1', strength: 0.18 },
  ],
  femboy: [
    { id: 'flux-femboy-v1', strength: 0.32 },
    { id: 'flux-detail-skin-v1', strength: 0.18 },
  ],
  anime: [{ id: 'flux-anime-v1', strength: 0.45 }],
  '3d': [{ id: 'flux-3d-render-v1', strength: 0.45 }],
};

export function resolveAutoGender(gender?: unknown): string {
  const g = String(gender || '').toLowerCase().trim();
  if (/femboy|feminine boy|cd$/.test(g)) return 'femboy';
  if (/trans|shemale|ladyboy|futanari/.test(g)) return 'transgender';
  if (/^(male|man|boy|masculine|he|guy|dude)\b/.test(g)) return 'male';
  return 'female';
}

export function resolveAutoStyle(style?: unknown): string {
  const s = String(style || '').toLowerCase();
  if (/anime|manga|2d|illustration|cel/.test(s)) return 'anime';
  if (/3d|render/.test(s)) return '3d';
  return 'realistic';
}

/**
 * 固定组合规则：
 *  - 二次元 / 3D 风格优先（风格 LoRA 替换写实性别 LoRA）
 *  - 写实按性别选主 LoRA + 皮肤细节
 *  - NSFW 强度 ≥3 追加 flux-lewd-v1；≥4 追加动态姿势
 */
export function buildAutoLoraStack(
  cfg: AutoConfig,
  gender?: unknown,
  style?: unknown,
  intensity?: number,
  installedOverride?: Array<string | null | undefined>,
): LoraAutoPick[] {
  const g = resolveAutoGender(gender);
  const s = resolveAutoStyle(style);
  const picks: LoraAutoPick[] = [];

  if (s === 'anime') {
    picks.push(...AUTO_MATRIX.anime);
  } else if (s === '3d') {
    picks.push(...AUTO_MATRIX['3d']);
  } else {
    picks.push(...(AUTO_MATRIX[g] || AUTO_MATRIX.female));
  }

  const level = Math.max(1, Math.min(5, Math.round(Number(intensity) || 1)));
  // NSFW 只叠一个姿势/通用 LoRA，避免多 LoRA 叠加导致人体结构错误
  if (level >= 4) picks.push({ id: 'flux-pose-nsfw-dynamic-v1', strength: 0.4 });
  else if (level >= 3) picks.push({ id: 'flux-lewd-v1', strength: 0.25 });

  const installedSet = new Set(
    (installedOverride ?? cfg.installed_loras ?? []).map((f) => String(f || '')),
  );
  return picks
    .filter((p) => {
      const entry = cfg.loras.find((l) => l.id === p.id);
      return Boolean(entry?.filename && installedSet.has(entry.filename));
    })
    .slice(0, 3);
}
