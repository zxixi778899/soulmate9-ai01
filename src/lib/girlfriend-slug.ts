/**
 * Build a non-empty, reasonably unique slug for girlfriends.slug (NOT NULL).
 * If `preferred` is already a valid slug, use it as-is (admin custom URLs).
 * Otherwise derive a base from the name and append a short unique suffix.
 */
export function makeGirlfriendSlug(name?: string | null, preferred?: string | null): string {
  const preferredClean = (preferred || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // Explicit admin/user slug: keep stable when valid
  if (preferredClean) {
    return preferredClean.length > 64 ? preferredClean.slice(0, 64).replace(/-$/, '') : preferredClean;
  }

  let base = (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!base) {
    base = `gf-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Cap base length so total slug stays URL-friendly
  if (base.length > 48) {
    base = base.slice(0, 48).replace(/-$/, '');
  }

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return `${base}-${suffix}`;
}
