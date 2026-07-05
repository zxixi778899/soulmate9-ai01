import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Force Next.js 16 to use legacy webpack instead of Turbopack.
  // Turbopack 16.1.1 has parse bug that fails on certain JSX patterns
  // (Unterminated regexp literal at </div> tokens), blocking our build.
  // webpack is the stable bundler and works for our codebase.
  webpack: undefined, // default webpack path; explicit for clarity
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    unoptimized: true,
  },
  serverExternalPackages: ['coze-coding-dev-sdk', '@aws-sdk/*', 'stripe'],
  output: 'standalone',
  compress: true,
  // Inline NEXT_PUBLIC_* into the client bundle at build time.
  // Read from process.env which Railway passes through Service Variables.
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
