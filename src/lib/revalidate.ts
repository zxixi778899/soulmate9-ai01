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
