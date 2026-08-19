# CloudFront CDN 集成实施指南

**版本**: v1.0  
**创建时间**: 2026-08-18  
**目标**: 降低 S3 成本 80% + 提升加载速度 62%  

---

## 🎯 业务价值

### 当前问题 (AS-IS)
```
❌ S3 GET 请求成本: $0.40/百万次 ($0.0004/1000 次)
❌ 图片平均加载时间: 800ms (LCP > 2.5s)
❌ 全球用户延迟高 (中国/欧洲用户体验差)
❌ 源站压力大 (每次访问都 hit S3)
```

### 预期收益 (TO-BE)
```
✅ S3 成本降低 80%: $0.08/百万次
✅ LCP 降至 300ms (-62%)
✅ 带宽成本降低 30%: $70/月 (原 $100/月)
✅ 90% 请求被 CDN 拦截
```

---

## 📋 实施方案总览

| 步骤 | 任务 | 耗时 | 责任人 | 风险等级 |
|------|------|------|--------|----------|
| 1 | AWS 账号权限配置 | 1h | DevOps | 低 |
| 2 | CloudFront Distribution 创建 | 2h | DevOps | 中 |
| 3 | Origin 配置优化 | 1h | DevOps | 低 |
| 4 | Cache Policy 设置 | 2h | DevOps | 中 |
| 5 | Storage Service 改造 | 4h | Backend | 低 |
| 6 | 缩略图预生成 | 3h | Backend | 中 |
| 7 | DNS 切换 | 30min | DevOps | 高 |
| 8 | 监控与验证 | 2h | Team | 低 |

**总耗时**: ~15.5 小时 ≈ 2 个工作日

---

## 🔧 Step 1: AWS 权限配置

### IAM Policy (需提前申请)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateDistribution",
        "cloudfront:UpdateDistribution",
        "cloudfront:GetDistribution",
        "cloudfront:CreateCloudFrontOriginAccessControl",
        "s3:GetBucketLocation",
        "s3:ListBucket"
      ],
      "Resource": "*"
    }
  ]
}
```

### 创建 Access Key

```bash
# Via AWS Console → IAM → Users → YourUser → Security credentials
# Or via CLI
aws iam create-access-key --user-name your-dev-user
```

**保存凭证到环境变量**:
```bash
# .env.local
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=ap-northeast-1  # Same region as S3 bucket
```

---

## 🚀 Step 2: CloudFront Distribution 创建

### 选项 A: 使用 AWS CLI (推荐)

#### 配置文件：`scripts/cloudfront-config.json`

```json
{
  "CallerReference": "soulmate-s3-cdn-20260818",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "soulmate-s3-origin",
        "DomainName": "soulmate-images-production.s3.cn-north-1.amazonaws.com.cn",
        "S3OriginConfig": {
          "OriginAccessIdentity": ""
        },
        "CustomHeaders": {
          "Quantity": 0
        }
      }
    ]
  },
  "DefaultCachePolicy": {
    "Comment": "CachingOptimized for images",
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "MinTTL": 0,
    "ParametersInCookiePolicy": "none",
    "QueryStringBehavior": "all",
    "HeaderBehavior": "whitelist",
    "AllowedHeaders": {
      "Quantity": 0
    }
  },
  "CacheBehaviors": {
    "Quantity": 0
  },
  "DefaultBehavior": {
    "TargetOriginId": "soulmate-s3-origin",
    "CachePolicyId": "658327ea-f88d-4fde-b0a8-aa53b6f9c0e9",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": {
        "Quantity": 2,
        "Items": ["GET", "HEAD"]
      }
    },
    "ViewerProtocolPolicy": "https-only",
    "Compress": true,
    "OriginRequestPolicyId": "4d925d8c-e67a-4810-a7e9-51b22ebf065d",
    "FieldLevelEncryptionId": "",
    "ViewerPolicy": {
      "ProtocolPolicy": "http-and-https",
      "AcceptTypes": [],
      "HttpPort": 80,
      "HttpsPort": 443,
      "IpV6Enabled": true
    }
  },
  "Comment": "SoulMate AI S3 Image CDN - CloudFront Distribution",
  "Enabled": true,
  "HttpVersion": "http1and11",
  "PriceClass": "PriceClass_All",
  "WebACLId": "",
  "IPv6Enabled": true
}
```

#### 创建命令

```bash
# 执行前确保已配置 AWS CLI
aws configure set aws_access_key_id $AWS_ACCESS_KEY_ID
aws configure set aws_secret_access_key $AWS_SECRET_ACCESS_KEY
aws configure set region cn-north-1

# Create distribution
cd scripts
aws cloudfront create-distribution \
  --distribution-config file://cloudfront-config.json \
  --query 'Distribution.DistributionConfig.CallersReference' \
  --output text
```

#### 等待分配完成

```bash
# Monitor creation status
DISTRIBUTION_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Id=='your-dist-id'].Id" \
  --output text)

aws cloudfront get-distribution --id $DISTRIBUTION_ID
```

---

### 选项 B: 通过 AWS Console GUI

1. **登录 AWS Console** → CloudFront
2. **Click "Create distribution"**
3. **Origin Settings**:
   - Origin Domain: `soulmate-images-production.s3.cn-north-1.amazonaws.com.cn`
   - Origin Protocol Policy: HTTPS Only
   - Origin Port: 443
4. **Default Cache Behavior**:
   - Target Origin: Select above
   - Viewer Protocol Policy: Redirect HTTP to HTTPS
   - Object Caching: Custom
     - Minimum TTL: 0
     - Default TTL: 86400 (24 hours)
     - Maximum TTL: 31536000 (1 year)
5. **Compression**: ✓ Enable gzip compression
6. **Price Class**: All regions
7. **IPv6**: ✓ Enabled
8. **Review & Create**

---

## ⚙️ Step 3: Cache Policy 详细配置

### Default Cache Behavior

```
Name: Image-Caching-Optimized

Cookie Policy: Whitelist (empty)
Query String: Forward all (needed for presigned URLs)
Header: White list
  - Accept-Encoding (for compression detection)
Body in Request: No
Forward User-Agent: No

Origin Response Header: Forward all
Client TTL: Default = Min, Max = Max
Revalidation: Use S3 Origin settings
```

### Compression Settings

```
✓ Apply gzip compression automatically
Content types to compress:
  - image/jpeg
  - image/png
  - image/webp
  - image/gif
  - video/mp4
  - audio/mpeg
```

---

## 💻 Step 4: Storage Service 改造

### File: `src/lib/storage.ts`

```typescript
import { logger } from '@/lib/logger';

// Add new environment variable
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_CDN_URL;

/**
 * Generate public URL for a storage key
 *优先使用 CloudFront CDN if configured
 */
export function toPublicUrl(key: string): string | null {
  const bucket = resolveBucketName();
  
  // Check if CloudFront is configured
  if (CLOUDFRONT_DOMAIN && /^https?:\/\//i.test(CLOUDFRONT_DOMAIN)) {
    try {
      const url = `${CLOUDFRONT_DOMAIN}/${bucket}/${key}`;
      logger.debug('[StorageService] Using CloudFront CDN', { url });
      return url;
    } catch (err) {
      logger.warn('[StorageService] CloudFront URL generation failed', { err, key });
    }
  }
  
  // Fallback to presigned URL
  const { generatePresignedUrl } = require('@aws-sdk/s3-request-presigner');
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const url = generatePresignedUrl(s3Client, command, { expiresIn: 31536000 });
  
  return url;
}

/**
 * Upload file with CDN invalidation option
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string,
  metadata: Record<string, string> = {},
  invalidateCdn: boolean = false
): Promise<{ url: string; key: string }> {
  try {
    // Upload to S3
    const bucket = resolveBucketName();
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    }));
    
    // Generate URL
    const url = toPublicUrl(key);
    
    // Optionally invalidate CloudFront cache
    if (invalidateCdn && CLOUDFRONT_DOMAIN) {
      await invalidateCloudFrontPath(`/${key}`);
    }
    
    return { url, key };
  } catch (err) {
    logger.error('[StorageService] Upload failed', { err, key });
    throw err;
  }
}

/**
 * Invalidate specific path in CloudFront
 */
async function invalidateCloudFrontPath(path: string): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID!;
  
  if (!distributionId) {
    logger.warn('[StorageService] CloudFront distribution ID not set');
    return;
  }
  
  try {
    const response = await fetch(`https://cloudfront.cn-north-1.amazonaws.com.cn/2020-05-31/distribution/${distributionId}/invalidation`, {
      method: 'POST',
      headers: {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${process.env.AWS_ACCESS_KEY_ID}/20260818/cn-north-1/cloudfront/aws4_request`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CallerReference: `invalid-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: [path],
        },
      }),
    });
    
    if (!response.ok) {
      logger.warn('[StorageService] Invalidation failed', { responseStatus: response.status });
    } else {
      logger.info('[StorageService] CloudFront invalidation submitted', { path });
    }
  } catch (err) {
    logger.error('[StorageService] Invalidation error', { err });
  }
}

/**
 * Batch invalidate multiple paths
 */
export async function invalidatePaths(paths: string[]): Promise<void> {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  
  if (!distributionId) {
    return;
  }
  
  try {
    const response = await fetch(`https://cloudfront.cn-north-1.amazonaws.com.cn/2020-05-31/distribution/${distributionId}/invalidation`, {
      method: 'POST',
      headers: {
        'Authorization': /* Sig V4 signing */,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        CallerReference: `batch-invalidate-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      }),
    });
    
    if (response.ok) {
      logger.info('[StorageService] Batch invalidation completed', { count: paths.length });
    }
  } catch (err) {
    logger.error('[StorageService] Batch invalidation failed', { err });
  }
}
```

---

## 🖼️ Step 5: 缩略图预生成

### New File: `src/lib/thumbnail-service.ts`

```typescript
import sharp from 'sharp';
import { uploadFile, deleteFile, resolveBucketName } from './storage';
import { logger } from './logger';

export interface ThumbnailSize {
  width: number;
  height: number;
  path: string;
  quality: number;
}

const DEFAULT_THUMBNAILS: ThumbnailSize[] = [
  { width: 128, height: 128, path: 'thumbnails/128x128', quality: 85 }, // Avatar
  { width: 256, height: 256, path: 'thumbnails/256x256', quality: 85 }, // Grid preview
  { width: 512, height: 512, path: 'thumbnails/512x512', quality: 90 }, // Medium preview
];

export class ThumbnailService {
  /**
   * Generate thumbnails from original image URL
   */
  async generateFromUrl(originalUrl: string): Promise<Record<string, string>> {
    try {
      // Download original
      const response = await fetch(originalUrl);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Extract filename
      const baseUrl = originalUrl.split('?')[0];
      const originalFilename = baseUrl.split('/').pop() || 'image.jpg';
      const extension = originalFilename.split('.').pop() || 'jpg';
      
      const generatedUrls: Record<string, string> = {};
      
      for (const size of DEFAULT_THUMBNAILS) {
        const thumbnail = await this.generateThumbnail(buffer, size);
        
        const fileName = `thumbnail_${size.width}x${size.height}.${extension === 'webp' ? 'webp' : 'jpg'}`;
        const key = `${size.path}/${fileName}`;
        
        const { url } = await uploadFile(thumbnail, key, `image/${extension === 'webp' ? 'webp' : 'jpeg'}`);
        generatedUrls[size.path] = url;
        
        logger.info('[ThumbnailService] Generated', { 
          size: `${size.width}x${size.height}`,
          url: url,
        });
      }
      
      return generatedUrls;
    } catch (err) {
      logger.error('[ThumbnailService] Generation failed', { err });
      throw err;
    }
  }
  
  /**
   * Generate single thumbnail with Sharp
   */
  private async generateThumbnail(buffer: Buffer, size: ThumbnailSize): Promise<Buffer> {
    let pipeline = sharp(buffer).resize(size.width, size.height, {
      fit: 'cover',
      position: 'center',
    });
    
    // Convert to WebP if requested
    if (size.path.includes('webp')) {
      pipeline = pipeline.webp({ quality: size.quality });
    } else {
      pipeline = pipeline.jpeg({ quality: size.quality });
    }
    
    return pipeline.toBuffer();
  }
  
  /**
   * Delete all thumbnails for an image
   */
  async deleteAllThumbnails(baseKey: string): Promise<void> {
    for (const size of DEFAULT_THUMBNAILS) {
      const fileName = baseKey.split('/').pop();
      if (fileName) {
        const key = `${size.path}/thumbnail_${size.width}x${size.height}.jpg`;
        await deleteFile(key);
      }
    }
  }
}
```

### Integration with ImageUpload

```typescript
// src/app/api/images/upload/route.ts
import { ThumbnailService } from '@/lib/thumbnail-service';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Upload original
  const { url: originalUrl } = await uploadFile(buffer, `uploads/${Date.now()}.jpg`, 'image/jpeg');
  
  // Generate thumbnails asynchronously
  const thumbnailService = new ThumbnailService();
  const thumbnails = await thumbnailService.generateFromUrl(originalUrl);
  
  return Response.json({
    original: originalUrl,
    thumbnails,
  });
}
```

---

## ✅ Step 6: 安全检查清单

### Pre-flight Checks

- [ ] AWS credentials configured correctly
- [ ] CloudFront distribution ID recorded in `.env.prod.local`
- [ ] S3 bucket CORS policies allow required origins
- [ ] SSL certificate valid for CDN domain (optional self-hosted CNAME)
- [ ] Budget alert set up (avoid unexpected costs)

### Testing Checklist

- [ ] Image load time < 1s (local test)
- [ ] Images display on frontend (Staging env)
- [ ] Browser cache works (check network tab)
- [ ] Origin bypassed in Chrome DevTools → Network → check "from disk/cache"
- [ ] Invalidations work (upload same filename, see change reflected)

---

## 📊 Step 7: 监控指标

### CloudWatch Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| CacheHitRate | < 80% | ❗ Warning |
| Error4xx | < 1% | ⚠️ OK |
| Error5xx | < 0.1% | ❌ Critical |
| Latency95 | < 2s | ⚠️ Warning |

### Cost Monitoring

```bash
# Set up budget alert
aws budgets create-budget \
  --budget-file-url s3://my-budgets/budgets/my-cost-budget.json
```

**Expected savings after go-live**:
- S3 GET requests: $50/month → $10/month (**-$40**)
- Data transfer out: $50/month → $40/month (**-$10**)
- Total monthly savings: **~$50/month**

---

## 🚦 Step 8: 上线流程

### 金丝雀发布策略

| Phase | Traffic % | Duration | Criteria |
|-------|-----------|----------|----------|
| Canary | 5% | 24h | Zero errors |
| Beta | 25% | 24h | Cache hit > 20% |
| Gamma | 75% | 24h | Latency improved |
| Production | 100% | — | All green |

### Rollback Plan

```bash
# If issues detected, revert immediately
# Option 1: Disable CloudFront (keep Origin accessible)
aws cloudfront update-distribution --id DIST_ID --enabled false

# Option 2: Switch environment variable back
CLOUDFRONT_CDN_URL="" pnpm vercel rollback 1
```

---

## 📝 环境变量清单

```bash
# Production deployment (.env.prod.local)

# Existing
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
RUNPOD_API_KEY=...

# NEW: CloudFront CDN
CLOUDFRONT_CDN_URL=https://XXXXXXXXXXXX.cloudfront.net
CLOUDFRONT_DISTRIBUTION_ID=EXXXXXXXXXXX
```

---

## 🎉 Go-Live Checklist

- [ ] CloudFront Distribution created
- [ ] Environment variables deployed to Vercel
- [ ] Frontend uses new CDN URLs
- [ ] Backend uploads route generates thumbnails
- [ ] Monitoring dashboard set up
- [ ] Rollback plan documented
- [ ] Team notified (Slack channel)
- [ ] Post-deployment verification complete

---

**最后更新**: 2026-08-18  
**版本**: v1.0  
**维护者**: DevOps Team
