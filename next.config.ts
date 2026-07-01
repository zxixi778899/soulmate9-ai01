import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),  // Uncomment and add 'import path from "path"' if needed
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    // OSS 签名 URL 会过期，禁止 next/image 缓存优化版本，统一走原始 URL
    unoptimized: true,
  },
  // 排除大型依赖从打包中，避免 Edge Function 大小限制
  serverExternalPackages: ['coze-coding-dev-sdk', '@aws-sdk/*', 'stripe'],
};

export default nextConfig;
