# CDN 配置指南 - 加速全球访问

## 🎯 目标
- 全球访问延迟降低 50%+
- 图片加载速度提升 3-5 倍
- 减少服务器带宽压力

---

## 方案一：Vercel Edge Cache (推荐)

### 优势
✅ 零配置，自动缓存  
✅ 全球边缘节点  
✅ Next.js 15 深度集成  

### 实施步骤

#### 1. 添加 middleware.ts
```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  
  // 为静态资源设置长缓存时间
  if (/^\/api\/storage\/assets\\/.*/.test(url.pathname)) {
    const response = NextResponse.next();
    
    // 缓存策略：浏览器 1 天 + 边缘 7 天
    response.headers.set(
      'Cache-Control',
      'public, max-age=604800, stale-while-revalidate=86400'
    );
    
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: '/api/storage/assets/:path*',
};
```

#### 2. API Route 响应头增强
```typescript
// src/app/api/storage/upload/route.ts

export async function POST(request: NextRequest) {
  
  // 设置响应头支持 CDN 缓存
  const response = NextResponse.json({ success: true });
  response.headers.set(
    'CDN-Cache-Control',
    'public, max-age=31536000, immutable'
  );
  
  return response;
}
```

---

## 方案二：Cloudflare R2 (最佳实践)

### 架构
```
用户上传 → Next.js → Cloudflare R2 → Cloudflare CDN → 全球用户
                              ↓
                         自动缩略图生成
```

### 配置步骤

#### 1. 安装依赖
```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

#### 2. 环境配置
```bash
# .env.local
CLOUDFLARE_R2_ACCOUNT_ID=your_account_id
CLOUDFLARE_R2_ACCESS_KEY=your_access_key
CLOUDFLARE_R2_SECRET_KEY=your_secret_key
CLOUDFLARE_R2_BUCKET=public-assets
```

#### 3. R2 Bucket 创建
```sql
-- 在 Supabase SQL Editor 中运行
-- 或直接通过 Cloudflare Dashboard UI 创建

CREATE EXTENSION IF NOT EXISTS vector; -- 用于将来向量搜索

-- Bucket 自动创建逻辑已在 upload route.ts 中处理
```

#### 4. 使用 Presigned URL 直传
```typescript
// src/app/api/storage/presign-url/route.ts
import { S3Client } from '@aws-sdk/client-s3';
import { UploadCommand } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY!,
  },
});

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const filename = searchParams.get('filename');
  const contentType = searchParams.get('contentType');
  
  const key = `uploads/${Date.now()}-${filename}`;
  
  const command = new UploadCommand({
    ClientRequestToken: Date.now().toString(),
    Bucket: process.env.CLOUDFLARE_R2_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  
  const url = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
  
  return Response.json({ url, key });
}
```

#### 5. 前端上传组件
```tsx
const handleDirectUpload = async (file: File) => {
  // 获取预签名 URL
  const params = new URLSearchParams({
    filename: file.name,
    contentType: file.type,
  });
  
  const presignRes = await fetch(`/api/storage/presign-url?${params}`);
  const { url } = await presignRes.json();
  
  // 直接上传到 R2 (不经过 Next.js 服务器)
  await fetch(url, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  
  toast.success('上传成功！');
};
```

---

## 方案三：Supabase Storage + CDN

### 优势
✅ 免费额度充足  
✅ 自动 HTTPS  
✅ 简单易用  

### 配置

#### 1. Bucket 设置
```typescript
// supabase storage bucket 自动创建时已设置
await supabase.storage.createBucket('assets', {
  public: true,           // ✅ 开启公共访问
  fileSizeLimit: 10 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
});
```

#### 2. 全局缓存配置
```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用图像优化器
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },
  
  // 缓存控制
  async headers() {
    return [
      {
        source: '/api/storage/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

---

## 性能对比测试

### 测试命令
```bash
# 使用 wrk 进行压力测试
wrk -t12 -c400 -d30s http://localhost:5000/api/storage/assets

# 或使用 ab (Apache Benchmark)
ab -n 1000 -c 100 http://localhost:5000/api/storage/assets
```

### 预期结果

| 方案 | 平均响应时间 | 带宽节省 | 全球延迟 |
|------|-------------|---------|---------|
| 原始方案 | 800ms | 0% | 200-500ms |
| **Edge Cache** | **200ms** | **70%** | **50-100ms** |
| **R2 + CDN** | **150ms** | **85%** | **30-80ms** |
| **Supabase CDN** | **300ms** | **60%** | **80-150ms** |

---

## 监控指标

### 1. 实时监控面板
```typescript
// components/AdminDashboard.tsx
import { useQuery } from '@tanstack/react-query';

async function getPerformanceMetrics() {
  const res = await fetch('/api/admin/performance');
  return res.json();
}

export function PerformanceMetrics() {
  const { data } = useQuery({ queryKey: ['perf-metrics'], queryFn: getPerformanceMetrics });
  
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <h3 className="text-sm text-gray-400">平均响应时间</h3>
        <p className="text-2xl font-bold">{data?.avgResponseTime}ms</p>
      </Card>
      <Card>
        <h3 className="text-sm text-gray-400">缓存命中率</h3>
        <p className="text-2xl font-bold">{data?.cacheHitRate}%</p>
      </Card>
      {/* ... */}
    </div>
  );
}
```

### 2. Sentry 错误追踪
```typescript
// src/lib/sentry.ts
export function trackCDNError(error: Error, context: { path: string; latency: number }) {
  captureException(error, {
    tags: { cdn_region: context.path },
    extra: { latency: context.latency },
  });
}
```

---

## 部署检查清单

### Vercel Edge Cache ✅
- [ ] middleware.ts 已创建
- [ ] Cache-Control 头正确设置
- [ ] Vercel CLI 已登录
- [ ] 生产环境部署成功

### Cloudflare R2 ✅
- [ ] R2 Account ID 已配置
- [ ] Access Key / Secret Key 已生成
- [ ] Bucket 名称已确定
- [ ] CORS 规则已设置
- [ ] DNS CNAME 已配置

### 验证测试
- [ ] 全球各地延迟测试 (< 100ms)
- [ ] 并发上传测试 (100+ 用户同时上传)
- [ ] 断点续传测试
- [ ] 缓存失效机制测试

---

## 费用估算

### 每月流量 (假设 10 万用户 × 10MB/月)
| 方案 | 存储 | 请求 | 流量 | 月成本 |
|------|-----|------|------|--------|
| Vercel Edge | $0 | $0 | Included | **$0** |
| Cloudflare R2 | $0.02/GB | $0.01/1k | $0.05/GB | **~$5** |
| Supabase CDN | Included | Included | Included | **$0** |

*注：实际费用取决于具体使用情况*

---

**最后更新**: 2026-08-30  
**测试状态**: 待实施  
