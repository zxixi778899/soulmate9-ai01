/**
 * 内容合规层 — NSFW 内容审计 + 标记
 *
 * 三层防护：
 * 1. 输入端：用户上传/输入的文字走关键词黑名单（防止明显违法内容）
 * 2. 输出端：LLM 输出端不审计（NSFW 是产品核心功能，不挡）
 * 3. 持久化：内容标记 NSFW 等级，用于：
 *    - 数据库字段 content_nsfw_level
 *    - admin 后台筛选可疑内容
 *    - 用户删除请求的精准定位
 *
 * Why：不引入外部 moderation API（如 OpenAI Moderation）
 * - 第三方 API 会把用户 NSFW 对话传出去，违反隐私政策"NSFW 内容不传第三方"
 * - 增加延迟和成本
 * - 对"虚构成人 AI 角色"的合法 NSFW 过度敏感
 */

export type NsfwLevel = 'sfw' | 'mild' | 'moderate' | 'explicit';

/**
 * 严禁内容关键词（即使在虚构角色语境下也违法）
 * - 涉及未成年
 * - 非自愿行为
 * - 真实人物
 */
const HARD_BLOCK_PATTERNS: RegExp[] = [
  // 未成年相关（中英文）
  /\bminor(s)?\b/i,
  /\bunder\s*age\b/i,
  /\bchild(ren)?\b/i,
  /\bteen(ager|age)?s?\b/i,
  /\b(school|student|kid|kids|boy|girl)\b/i,
  /\b未成年\b/,
  /\b小孩\b/,
  /\b儿童\b/,
  /\b少女\b/,
  /\b初中生\b/,
  /\b高中生\b/,
  /\b小学生\b/,
  /\b(loli|shota|cub)\b/i,

  // 非自愿
  /\b(non[- ]?consensual|rape|forced|coercion)\b/i,
  /\b(强奸|迷奸|胁迫|非自愿)\b/,

  // 真实人物 / 公众人物
  /\b(celebrity|politician|real\s*person)\b/i,
  /\b(名人|总统|明星)\b/,
];

export interface ModerationResult {
  allowed: boolean;
  nsfwLevel: NsfwLevel;
  reason?: string;
  matchedPattern?: string;
}

/**
 * 内容审核（输入端）
 *
 * @param text 用户输入或生成内容
 * @returns allowed: 是否允许；nsfwLevel: 合规等级
 *
 * 设计：
 * - 命中 HARD_BLOCK → 直接拒绝
 * - 不命中 → 视为允许（默认 NSFW 等级由调用方根据业务上下文标记）
 */
export function moderateText(text: string): ModerationResult {
  if (!text || text.length === 0) {
    return { allowed: true, nsfwLevel: 'sfw' };
  }

  const normalized = text.toLowerCase().slice(0, 10000); // 限长避免 ReDoS

  for (const pattern of HARD_BLOCK_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        allowed: false,
        nsfwLevel: 'sfw',
        reason: 'content_violates_policy',
        matchedPattern: match[0],
      };
    }
  }

  return { allowed: true, nsfwLevel: 'moderate' }; // 默认允许，调用方可降级到 sfw
}

/**
 * 根据业务上下文推断 NSFW 等级
 * 用于 chat_messages 表的 content_nsfw_level 字段
 */
export function inferNsfwLevel(params: {
  hasExplicitImage?: boolean;
  messageRole?: 'user' | 'assistant' | 'system';
  girlfriendAllowNsfw?: boolean;
}): NsfwLevel {
  if (params.hasExplicitImage) return 'explicit';
  if (!params.girlfriendAllowNsfw) return 'sfw';
  // assistant 默认 moderate，user 显式 SFW 标志时降级
  return 'moderate';
}

/**
 * 是否需要额外保护（用户删除请求 / 数据导出时）
 */
export function requiresEnhancedDeletion(nsfwLevel: NsfwLevel): boolean {
  return nsfwLevel === 'explicit' || nsfwLevel === 'moderate';
}

/**
 * 内容是否应该被缓存到公共 CDN（默认 false）
 * 用户上传 / AI 生成的 NSFW 内容永远不走 CDN
 */
export function isCacheableOnPublicCdn(_nsfwLevel: NsfwLevel): boolean {
  return false; // 所有 NSFW 内容禁止公共 CDN
}