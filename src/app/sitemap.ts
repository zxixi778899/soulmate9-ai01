import type { MetadataRoute } from 'next';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soulmateai.shop';

interface PublicGirlfriendRow {
  slug: string;
  updated_at?: string | null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${BASE_URL}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE_URL}/pricing`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/terms`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE_URL}/privacy`, lastModified: now, changeFrequency: 'monthly', priority: 0.3 },
  ];

  let girlfriendUrls: MetadataRoute.Sitemap = [];
  try {
    const sb = getSupabaseClient();
    const { data } = await sb
      .from('girlfriends')
      .select('slug, updated_at')
      .eq('is_public', true)
      .eq('review_status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(2000);

    girlfriendUrls = ((data ?? []) as PublicGirlfriendRow[])
      .filter((g) => typeof g.slug === 'string' && g.slug.length > 0)
      .map((g) => ({
        url: `${BASE_URL}/girlfriend/${g.slug}`,
        lastModified: g.updated_at ? new Date(g.updated_at) : now,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch {
    //  SB  sitemap 
    girlfriendUrls = [];
  }

  // CMS 
  let cmsUrls: MetadataRoute.Sitemap = [];
  try {
    const sb = getSupabaseClient();
    const { data } = await sb
      .from('cms_pages')
      .select('slug, updated_at')
      .eq('status', 'published')
      .order('updated_at', { ascending: false })
      .limit(500);
    cmsUrls = ((data ?? []) as PublicGirlfriendRow[])
      .filter((p) => typeof p.slug === 'string' && p.slug.length > 0)
      .map((p) => ({
        url: `${BASE_URL}/p/${p.slug}`,
        lastModified: p.updated_at ? new Date(p.updated_at) : now,
        changeFrequency: 'monthly' as const,
        priority: 0.5,
      }));
  } catch {
    cmsUrls = [];
  }

  return [...staticPages, ...girlfriendUrls, ...cmsUrls];
}
