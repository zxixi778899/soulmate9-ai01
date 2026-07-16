import { revalidatePath, revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';

/**
 * Cache tag constants — used by both admin writers and frontend fetchers.
 * Frontend fetch() calls should include `next: { tags: [TAG_X] }` to enable
 * tag-based revalidation.
 */
export const TAG = {
  girlfriends: 'girlfriends',
  featured: 'featured',
  shop: 'shop',
  homepage: 'homepage',
  wardrobe: 'wardrobe',
  explore: 'explore',
  summon: 'summon',
  gifts: 'gifts',
  settings: 'settings',
  lore: 'lore',
  tokens: 'tokens',
  ads: 'ads',
  achievements: 'achievements',
} as const;

export type CacheTag = (typeof TAG)[keyof typeof TAG];

/**
 * Invalidate all frontend caches for a given tag group.
 * Call this from admin write routes after successful DB mutations.
 */
export function invalidateTag(tag: CacheTag | CacheTag[]): void {
  const tags = Array.isArray(tag) ? tag : [tag];
  for (const t of tags) {
    try {
      revalidateTag(t);
      logger.info(`[revalidate] tag:${t}`);
    } catch (e) {
      logger.warn(`[revalidate] tag:${t} failed`, { err: String(e) });
    }
  }
}

/**
 * Invalidate paths + tags for girlfriend-related changes.
 */
export function invalidateGirlfriends(slug?: string | null): void {
  revalidatePath('/');
  revalidatePath('/explore');
  revalidatePath('/summon');
  if (slug) revalidatePath(`/girlfriend/${slug}`);
  invalidateTag([TAG.girlfriends, TAG.featured, TAG.homepage, TAG.explore, TAG.summon]);
}

/**
 * Invalidate paths + tags for shop-related changes.
 */
export function invalidateShop(): void {
  revalidatePath('/shop');
  revalidatePath('/shop-v2');
  revalidatePath('/wardrobe');
  invalidateTag([TAG.shop, TAG.wardrobe]);
}

/**
 * Invalidate paths + tags for featured/homepage CMS changes.
 */
export function invalidateHomepage(): void {
  revalidatePath('/');
  invalidateTag([TAG.homepage, TAG.featured]);
}

/**
 * Invalidate paths + tags for gift catalog changes.
 * Gifts are consumed in the chat UI — invalidate the chat data path.
 */
export function invalidateGifts(): void {
  revalidatePath('/api/gifts');
  invalidateTag([TAG.gifts]);
}

/**
 * Invalidate paths + tags for site-wide settings changes.
 * Settings affect footer, pricing, and multiple pages.
 */
export function invalidateSettings(): void {
  revalidatePath('/');
  revalidatePath('/pricing');
  revalidatePath('/achievements');
  invalidateTag([TAG.settings, TAG.homepage]);
}

/**
 * Invalidate lore data for a specific girlfriend.
 * Lore is consumed server-side during chat prompt construction.
 */
export function invalidateLore(girlfriendId?: string): void {
  invalidateTag([TAG.lore]);
  if (girlfriendId) {
    revalidatePath(`/api/lore?girlfriend_id=${girlfriendId}`);
  }
}

/**
 * Invalidate token package / pricing changes.
 * Consumed on the pricing / recharge page.
 */
export function invalidateTokens(): void {
  revalidatePath('/pricing');
  revalidatePath('/api/v2/shop/tokens');
  invalidateTag([TAG.tokens]);
}

/**
 * Invalidate ad banner changes.
 * Ads are displayed on the homepage and explore page.
 */
export function invalidateAds(): void {
  revalidatePath('/');
  revalidatePath('/explore');
  invalidateTag([TAG.ads, TAG.homepage]);
}

/**
 * Invalidate achievement definition changes.
 */
export function invalidateAchievements(): void {
  revalidatePath('/achievements');
  invalidateTag([TAG.achievements]);
}

/**
 * Nuclear option — invalidate ALL cache tags and paths.
 * Useful after major config changes or database migrations.
 */
export function invalidateAll(): void {
  const allTags = Object.values(TAG);
  invalidateTag(allTags);
  const paths = [
    '/', '/explore', '/summon', '/shop', '/shop-v2', '/wardrobe',
    '/pricing', '/achievements', '/api/gifts', '/api/v2/shop/tokens',
  ];
  for (const p of paths) {
    try { revalidatePath(p); } catch { /* ignore */ }
  }
  logger.info('[revalidate] ALL cache invalidated');
}
