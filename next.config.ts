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
};

export default nextConfig;