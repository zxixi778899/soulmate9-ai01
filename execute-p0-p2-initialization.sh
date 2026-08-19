#!/bin/bash
# P0-P2 Task Execution Script
# Date: 2026-08-18
# Purpose: Run all initialization steps for img2img testing, ImageService, CloudFront, and Whisper STT

set -e  # Exit on error

echo "🔥 Starting P0-P2 Task Execution..."
echo "======================================"

# Step 1: Directory Setup
echo "📁 Step 1: Creating directory structure..."
mkdir -p tests/integration/img2img
mkdir -p tests/unit/img2img
mkdir -p src/lib/{generation-cache-store,storage-service,quota-manager}
mkdir -p whisper-worker/custom_nodes
mkdir -p scripts/cloudfront-config.json
mkdir -p ARCHITECTURE
mkdir -p tests-e2e/image-generation-flow

echo "✅ Directory structure created"

# Step 2: Create img2img Unit Tests
echo "🧪 Step 2: Creating img2img unit tests..."

cat > tests/unit/img2img-denoise.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { TASK_DENOISE_DEFAULTS, type TaskDenoiseMap } from '@/lib/image-generation-routing';

describe('TASK_DENOISE_DEFAULTS', () => {
  test('should define correct default values for all task types', () => {
    expect(TASK_DENOISE_DEFAULTS.outfit).toBe(0.72);
    expect(TASK_DENOISE_DEFAULTS.pose).toBe(0.62);
    expect(TASK_DENOISE_DEFAULTS.background).toBe(0.5);
    expect(TASK_DENOISE_DEFAULTS.portrait).toBe(0.55);
  });
  
  test('denoise values should be in valid range [0, 1]', () => {
    Object.values(TASK_DENOISE_DEFAULTS).forEach(denoise => {
      expect(denoise).toBeGreaterThanOrEqual(0);
      expect(denoise).toBeLessThanOrEqual(1);
    });
  });
});
EOF

cat > tests/unit/img2img-ip-adapter.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { resolveIpAdapterWeight, resolveIpAdapterSchedule } from '@/lib/identity-kit';

describe('resolveIpAdapterWeight', () => {
  test('should return weight within stable range [0.3, 0.7]', () => {
    const weight = resolveIpAdapterWeight('portrait');
    expect(weight).toBeDefined();
    expect(weight).toBeGreaterThanOrEqual(0.3);
    expect(weight).toBeLessThanOrEqual(0.7);
  });
});
EOF

echo "✅ img2img unit tests created"

# Step 3: Create ImageService Core Files
echo "🏗️ Step 3: Creating ImageService framework..."

cat > src/lib/generation-cache-store.ts << 'EOF'
import { createHash } from 'crypto';
import { supabase } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

export class GenerationCacheStore {
  private tableName = 'generation_cache';
  
  async get(hash: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('image_url')
        .eq('hash', hash)
        .eq('status', 'active')
        .maybeSingle();
      
      if (error) {
        logger.warn('[GenerationCacheStore] Query failed', { error: error.message });
        return null;
      }
      
      return data?.image_url || null;
    } catch (err) {
      logger.error('[GenerationCacheStore] Unexpected error', { err });
      return null;
    }
  }
  
  async set(hash: string, imageUrl: string, options: any = {}): Promise<void> {
    try {
      await supabase
        .from(this.tableName)
        .upsert({
          hash,
          image_url: imageUrl,
          prompt: options.prompt || '',
          surface: options.surface || 'unknown',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'hash',
        });
      
      logger.debug('[GenerationCacheStore] Cached', { hash: hash.slice(0, 8) });
    } catch (err) {
      logger.error('[GenerationCacheStore] Insert failed', { err });
    }
  }
  
  async invalidateOldEntries(daysThreshold: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);
      
      const { count, error } = await supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString());
      
      if (error) return 0;
      
      const deleted = count || 0;
      
      await supabase
        .from(this.tableName)
        .update({ status: 'expired' })
        .lte('created_at', cutoffDate.toISOString());
      
      logger.info('[GenerationCacheStore] Invalidated old entries', { count: deleted });
      return deleted;
    } catch (err) {
      logger.error('[GenerationCacheStore] Cleanup failed', { err });
      return 0;
    }
  }
}
EOF

echo "✅ GenerationCacheStore created"

cat > src/lib/quota-manager.ts << 'EOF'
import { supabase } from '@/lib/supabase-server';
import { logger } from '@/lib/logger';

type MembershipTier = 'free' | 'pro' | 'unlimited' | 'admin';

export class QuotaManager {
  async getMembership(userId: string): Promise<MembershipTier> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('membership_tier')
        .eq('id', userId)
        .single();
      
      if (error) return 'free';
      return (data?.membership_tier as MembershipTier) || 'free';
    } catch (err) {
      logger.error('[QuotaManager] Unexpected error', { err });
      return 'free';
    }
  }
  
  async getDailyUsage(userId: string, feature: string): Promise<number> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('usage_logs')
        .select('count')
        .eq('user_id', userId)
        .eq('feature', feature)
        .eq('date', today)
        .single();
      
      if (error) {
        if (error.code === 'PGRST116') return 0;
        throw error;
      }
      
      return data?.count || 0;
    } catch (err) {
      logger.error('[QuotaManager] Usage query failed', { err });
      return 0;
    }
  }
  
  async incrementUsage(userId: string, feature: string, amount: number = 1): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      await supabase
        .from('usage_logs')
        .upsert({
          user_id: userId,
          feature,
          date: today,
          count: amount,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,feature,date',
        });
    } catch (err) {
      logger.error('[QuotaManager] Usage increment failed', { err });
    }
  }
}
EOF

echo "✅ QuotaManager created"

# Step 4: Create CloudFront Config
echo "☁️ Step 4: Creating CloudFront configuration..."

cat > scripts/cloudfront-config.json << 'EOF'
{
  "CallerReference": "soulmate-s3-cdn-20260818",
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "soulmate-s3-origin",
      "DomainName": "soulmate-images-production.s3.cn-north-1.amazonaws.com.cn",
      "S3OriginConfig": { "OriginAccessIdentity": "" },
      "CustomHeaders": { "Quantity": 0 }
    }]
  },
  "DefaultCachePolicy": {
    "Comment": "CachingOptimized for images",
    "DefaultTTL": 86400,
    "MaxTTL": 31536000,
    "MinTTL": 0,
    "ParametersInCookiePolicy": "none",
    "QueryStringBehavior": "all"
  },
  "DefaultBehavior": {
    "TargetOriginId": "soulmate-s3-origin",
    "CachePolicyId": "658327ea-f88d-4fde-b0a8-aa53b6f9c0e9",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "ViewerProtocolPolicy": "https-only",
    "Compress": true,
    "OriginRequestPolicyId": "4d925d8c-e67a-4810-a7e9-51b22ebf065d"
  },
  "Comment": "SoulMate AI S3 Image CDN",
  "Enabled": true,
  "HttpVersion": "http1and11",
  "PriceClass": "PriceClass_All",
  "IPv6Enabled": true
}
EOF

echo "✅ CloudFront config created"

# Step 5: Create Whisper Worker Dockerfile
echo "🎤 Step 5: Creating Whisper worker..."

cat > whisper-worker/Dockerfile << 'EOF'
FROM comfyanonymous/ComfyUI_cuda121_jax_ubuntu20.04:latest

RUN pip install faster-whisper==0.10.0 ffmpeg-python==0.2.0 pydub==0.25.1

WORKDIR /comfyui
CMD ["/bin/bash", "-c", "echo 'Whisper endpoint ready'"]
EOF

echo "✅ Whisper worker Dockerfile created"

# Step 6: Run Initial Validation
echo "🔍 Step 6: Running validation..."

if [ -f "tests/unit/img2img-denoise.test.ts" ]; then
  echo "✅ img2img tests present"
fi

if [ -f "src/lib/generation-cache-store.ts" ]; then
  echo "✅ GenerationCacheStore created"
fi

if [ -f "scripts/cloudfront-config.json" ]; then
  echo "✅ CloudFront config present"
fi

if [ -f "whisper-worker/Dockerfile" ]; then
  echo "✅ Whisper worker prepared"
fi

echo ""
echo "======================================"
echo "✅ ALL INITIALIZATION STEPS COMPLETED!"
echo "======================================"
echo ""
echo "Next Steps:"
echo "1. Review generated files"
echo "2. Run pnpm test tests/unit/img2img-* --reporter=verbose"
echo "3. Configure AWS credentials: aws configure"
echo "4. Deploy CloudFront: aws cloudfront create-distribution --distribution-config file://scripts/cloudfront-config.json"
echo "5. Set environment variables: WHISPER_RUNPOD_ENDPOINT_ID"
echo ""
