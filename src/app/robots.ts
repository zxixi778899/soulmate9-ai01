import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://soulmateai.shop';

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/girlfriend/', '/terms', '/privacy'],
      disallow: ['/api/', '/login', '/register', '/forgot-password', '/update-password'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}