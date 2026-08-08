/**
 * 降低 "AI 感 / 蜡像感" 的统一提示词优化（最终边界注入）。
 *
 * 所有生图路径最终都经过 buildFluxWorkflow，在这里统一：
 *   1) 给人物类提示词追加自然皮肤/真实摄影片段（皮肤毛孔、瑕疵、胶片颗粒等）
 *   2) 把会诱发 "蜡像/塑料" 感的措辞（luminous skin / glossy skin 等）替换掉
 *   3) 合并反 "AI 脸" 负向词
 * 非人物类提示词（服装/道具/广告等）原样放行，避免污染 ghost-mannequin 输出。
 */

/**
 * 自然写实正向片段（平衡版）：
 * - 年轻新鲜皮肤 + 柔和自然光，避免 "显老 / 假光"
 * - 保留真实皮肤质感但去掉 pores/grain/blemishes，避免 "杂质感 / 蜡像感"
 */
export const FLUX_NATURAL_POSITIVE =
  ', youthful fresh healthy skin, natural skin texture with soft realistic detail, clear bright youthful eyes, soft natural diffused lighting, gentle realistic shadows, natural color grading, candid relaxed expression, correct realistic anatomy, natural body proportions, well-formed hands and fingers, not airbrushed';

/** 反 "AI 脸 / 蜡像" 负向片段 */
export const FLUX_ANTI_AI_NEGATIVE =
  ', plastic skin, airbrushed, doll-like, porcelain skin, wax figure, mannequin, generic face, same-face look, AI-generated look, oversmoothed, waxy, uncanny valley, CGI render, beauty filter, instagram filter, aged appearance, wrinkles, sagging skin, dull complexion, acne, blemishes';

/** 提示词已含自然皮肤表达时跳过追加 */
const NATURAL_ALREADY =
  /natural skin texture|visible pores|subsurface scattering|skin grain|realistic skin|film grain/i;

/** 会诱发 "蜡像/塑料" 感的正向措辞，统一替换为自然皮肤表达（长词在前） */
const WAX_POSITIVE =
  /(fair luminous skin texture|flawless skin|perfect smooth skin|porcelain skin|glowing skin|airbrushed|plastic skin|glossy pale skin|pale glossy skin|luminous fair skin|pale luminous skin|fair luminous skin|glossy skin|smooth perfect face|barbie skin)/gi;

/** 人物类提示词才做自然化；服装/道具/广告原样放行 */
const HUMAN_CONTENT =
  /(woman|man|girl|boy|female|male|person|people|portrait|face|her|him|character|nude|body|model|girlfriend|companion|subject)/i;

/** 明确无人物/产品类的提示词（ghost mannequin 服装、道具、广告） */
const NO_HUMAN =
  /(no person|no people|without person|no face|without face|ghost mannequin|invisible mannequin|product shot|clothing product|garment only|no human|mannequin only|no model)/i;

export function applyFluxNaturalLook(
  prompt: string,
  negative?: string,
): { positive: string; negative: string } {
  const original = String(prompt || '').trim();
  if (!original) return { positive: original, negative: String(negative || '').trim() };
  if (NO_HUMAN.test(original) || !HUMAN_CONTENT.test(original)) {
    return { positive: original, negative: String(negative || '').trim() };
  }

  let positive = original;
  if (!NATURAL_ALREADY.test(positive)) {
    positive = `${positive},${FLUX_NATURAL_POSITIVE}`;
  }
  positive = positive
    .replace(WAX_POSITIVE, 'natural skin texture with soft realistic detail')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,+$/, '')
    .trim();

  const merged = [String(negative || '').trim(), FLUX_ANTI_AI_NEGATIVE]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const neg = [...new Set(merged)].join(', ');
  return { positive, negative: neg };
}
