import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    // Allowlist of trusted image hosts (avoid wildcard `**`):
    // 1. Supabase Storage (project vvblk...)
    // 2. Cloudflare R2 public CDN
    // 3. AWS S3 (and via Cloudfront CDN)
    // 4. Vercel Blob storage
    // 5. Unsplash as fallback for placeholder avatars
    remotePatterns: [
      { protocol: 'https', hostname: 'vvblrkngzuyxeeoslzkl.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'cdn.soulmateai.shop' },
      { protocol: 'https', hostname: '*.r2.dev' },
      { protocol: 'https', hostname: '*.cloudflarestorage.com' },
      { protocol: 'https', hostname: '*.amazonaws.com' },
      { protocol: 'https', hostname: '*.s3.amazonaws.com' },
      { protocol: 'https', hostname: '*.vercel-storage.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
    // 重新启用 Next Image 优化（之前的 unoptimized: true 会绕过优化管线，丢尺寸转码）
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  serverExternalPackages: ['coze-coding-dev-sdk', '@aws-sdk/*', 'stripe'],
  output: 'standalone',
  compress: true,
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_COZE_SUPABASE_URL: process.env.NEXT_PUBLIC_COZE_SUPABASE_URL,
    NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_COZE_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_GA_ID: process.env.NEXT_PUBLIC_GA_ID,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  },
};

export default nextConfig;
