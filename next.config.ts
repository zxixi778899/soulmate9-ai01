import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    unoptimized: true,
  },
  serverExternalPackages: ['coze-coding-dev-sdk', '@aws-sdk/*', 'stripe'],

  // Production deployment uses standalone
  output: 'standalone',

  // Enable compression
  compress: true,

  // ── Plan L: Explicitly declare NEXT_PUBLIC_* so Next.js inlines them into the
  // client bundle at build time. Next.js reads these from process.env during
  // build, which is set by Railway Service Variables (passed to Docker builder).
  // Without this, in some bundling setups Turbopack may not see all NEXT_PUBLIC_*
  // vars, leading to `process.env.NEXT_PUBLIC_X === undefined` at runtime.
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