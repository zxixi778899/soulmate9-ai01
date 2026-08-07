import { getIntimacyLevel } from '@/lib/constants';

/**
 * 亲密值不足时，伴侣对用户的称呼随关系阶段变化。
 * 用于“降级出 SFW 图 + 回复解锁提示”的文案。
 */
export function intimacyDowngradeAddress(score: number, zh: boolean): string {
  const level = getIntimacyLevel(score);
  if (zh) {
    if (level <= 1) return '新朋友';
    if (level === 2) return '亲爱的';
    return '宝贝';
  }
  if (level <= 1) return 'my friend';
  if (level === 2) return 'dear';
  return 'baby';
}

export function buildIntimacyDowngradeReply(score: number, zh: boolean): string {
  const address = intimacyDowngradeAddress(score, zh);
  return zh
    ? `${address}，我们还没有那么亲密，过2天再给你看`
    : `${address}, we are not that close yet. Give me two days and I'll show you.`;
}
