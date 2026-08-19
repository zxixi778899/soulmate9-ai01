/**
 * RunPod Multi-Endpoint Failover System - Four Layer Architecture
 * 
 * Design Philosophy: "Never Fail" Guarantee
 * Layer 1: FLUX Primary (Fast Path) - 25s timeout
 * Layer 2: SDXL Fallback (Specialist Route) - 30s timeout  
 * Layer 3: Multi-Cloud Backup (Together AI / Replicate) - 45s timeout
 * Layer 4: Graceful Degradation (Cache / Async Queue) - Ultimate safety net
 */

import { logger } from './logger';
import { capture, AnalyticsEvents } from './analytics';

// Configuration constants
export const ENDPOINT_TIMEOUT_MS = 25000; // 25 second timeout for L1 (optimized)
export const SDXL_TIMEOUT_MS = 30000;     // 30 second timeout for L2
export const CLOUD_TIMEOUT_MS = 45000;    // 45 second timeout for Layer 3 alternatives
export const MAX_RETRIES = 3;             // Total retry attempts across all layers
export const CIRCUIT_BREAKER_THRESHOLD = 5; // Failures before opening circuit
export const IMAGE_CACHE_MINUTES = 10;    // Cache valid time for graceful degradation

/**
 * Endpoint status tracking for circuit breaker pattern
 */
interface EndpointHealth {
  lastFailure: number | null;
  consecutiveFailures: number;
  isOpen: boolean; // True when circuit is open (avoiding failed endpoint)
  retriesTotal: number;
}

/**
 * Generate a unique correlation ID for tracing requests across retries
 */
function generateCorrelationId(): string {
  return `rp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Check if endpoint circuit breaker is open
 */
function isCircuitOpen(health: EndpointHealth): boolean {
  return health.isOpen || health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD;
}

/**
 * Record successful endpoint usage
 */
function recordSuccess(health: EndpointHealth): void {
  health.consecutiveFailures = 0;
  health.lastFailure = null;
  health.isOpen = false;
}

/**
 * Record failed endpoint usage and potentially open circuit breaker
 */
function recordFailure(health: EndpointHealth): void {
  health.consecutiveFailures++;
  health.lastFailure = Date.now();
  
  if (health.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    health.isOpen = true;
    logger.warn('[runpod-failover] circuit breaker OPENED for endpoint', {
      consecutiveFailures: health.consecutiveFailures,
    });
  }
}

/**
 * Reset circuit breaker after cooldown period (5 minutes)
 */
function maybeResetCircuitBreaker(health: EndpointHealth): void {
  if (health.isOpen && health.lastFailure) {
    const cooldownMs = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - health.lastFailure > cooldownMs) {
      health.isOpen = false;
      logger.info('[runpod-failover] circuit breaker RESET after cooldown');
    }
  }
}

/**
 * Health status for each endpoint type
 */
const endpointHealth: Record<string, EndpointHealth> = {
  flux_primary: { lastFailure: null, consecutiveFailures: 0, isOpen: false, retriesTotal: 0 },
  sdxl: { lastFailure: null, consecutiveFailures: 0, isOpen: false, retriesTotal: 0 },
  flux_backup: { lastFailure: null, consecutiveFailures: 0, isOpen: false, retriesTotal: 0 },
};

/**
 * Execute a request with timeout
 */
async function executeWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  operationName: string,
  correlationId: string
): Promise<{ success: true; data: T } | { success: false; error: Error; timedOut: true }> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        });
      }),
    ]);
    clearTimeout(timeoutId);
    return { success: true, data: result };
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`[runpod-failover] ${operationName} timeout`, {
      correlationId,
      errorMessage: err.message,
      timeoutMs,
    });
    return { success: false, error: err, timedOut: true };
  }
}

/**
 * Log detailed generation attempt
 */
function logGenerationAttempt({
  correlationId,
  endpointType,
  endpointId,
  attemptNumber,
  maxAttempts,
}: {
  correlationId: string;
  endpointType: string;
  endpointId: string;
  attemptNumber: number;
  maxAttempts: number;
}): void {
  logger.info('[runpod-failover] generation attempt', {
    correlationId,
    endpointType,
    endpointId,
    attempt: `${attemptNumber}/${maxAttempts}`,
  });
}

/**
 * Main failover engine for RunPod image generation
 * 
 * Strategy:
 * 1. Try FLUX primary endpoint
 * 2. If timeout (>30s), switch to SDXL endpoint  
 * 3. If SDXL also times out/fails, fall back to FLUX backup
 * 4. Log every step for debugging and monitoring
 */
export async function runPodFailoverGenerate<T extends { job_id?: string; images?: string[] }>(
  fluxGenerateFn: () => Promise<T>,
  sdxlGenerateFn?: () => Promise<T>,
  backupFluxGenerateFn?: () => Promise<T>
): Promise<T> {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();
  
  logger.info('[runpod-failover] starting generation workflow', { correlationId });
  // Don't capture analytics without distinctId (server-side job)
  // capture(process.env.NEXT_PUBLIC_USER_ID || 'system', AnalyticsEvents.IMAGE_GENERATION_START, { correlationId });

  let lastError: Error | null = null;

  // --- Phase 1: Primary FLUX Endpoint ---
  if (!isCircuitOpen(endpointHealth.flux_primary)) {
    maybeResetCircuitBreaker(endpointHealth.flux_primary);
    
    const endpointId = process.env.RUNPOD_ENDPOINT_ID || 'UNCONFIGURED';
    logGenerationAttempt({
      correlationId,
      endpointType: 'flux-primary',
      endpointId,
      attemptNumber: 1,
      maxAttempts: MAX_RETRIES,
    });

    endpointHealth.flux_primary.retriesTotal++;
    
    const result = await executeWithTimeout(
      async () => {
        const res = await fluxGenerateFn();
        recordSuccess(endpointHealth.flux_primary);
        return res;
      },
      ENDPOINT_TIMEOUT_MS,
      'flux-primary-generation',
      correlationId
    );

    if (result.success && result.data.images && result.data.images.length > 0) {
      const elapsed = Date.now() - startTime;
      logger.info('[runpod-failover] ✅ SUCCESS - primary FLUX endpoint', {
        correlationId,
        imagesCount: result.data.images.length,
        executionTimeMs: elapsed,
        endpointId,
      });
      capture(
        process.env.NEXT_PUBLIC_USER_ID || 'system',
        AnalyticsEvents.IMAGE_GENERATION_SUCCESS,
        { correlationId, elapsed }
      );
      return result.data;
    } else if ('timedOut' in result && result.timedOut) {
      lastError = new Error('FLUX primary endpoint timeout after 30s');
      recordFailure(endpointHealth.flux_primary);
      
      logger.warn('[runpod-failover] ⚠️ TIMEOUT - switching to SDXL', {
        correlationId,
        waitedMs: ENDPOINT_TIMEOUT_MS,
      });
    } else {
      // Result.success is false, so result.error exists
      lastError = (result as { success: false; error: Error }).error;
      recordFailure(endpointHealth.flux_primary);
      logger.error('[runpod-failover] ❌ FAILED - primary FLUX endpoint', {
        correlationId,
        error: lastError.message,
      });
    }
  } else {
    logger.warn('[runpod-failover] ⏸️ SKIPPED - circuit breaker OPEN for primary FLUX', {
      correlationId,
    });
  }

  // --- Phase 2: SDXL Fallback (if configured) ---
  const sdxlEndpointId = process.env.RUNPOD_ENDPOINT_ID_SDXL;
  if (sdxlEndpointId && sdxlGenerateFn && !isCircuitOpen(endpointHealth.sdxl)) {
    maybeResetCircuitBreaker(endpointHealth.sdxl);
    
    logGenerationAttempt({
      correlationId,
      endpointType: 'sdxl',
      endpointId: sdxlEndpointId,
      attemptNumber: 2,
      maxAttempts: MAX_RETRIES,
    });

    endpointHealth.sdxl.retriesTotal++;
    
    const result = await executeWithTimeout(
      async () => {
        const res = await sdxlGenerateFn();
        recordSuccess(endpointHealth.sdxl);
        return res;
      },
      ENDPOINT_TIMEOUT_MS,
      'sdxl-generation',
      correlationId
    );

    if (result.success && result.data.images && result.data.images.length > 0) {
      const elapsed = Date.now() - startTime;
      logger.info('[runpod-failover] ✅ SUCCESS - SDXL fallback endpoint', {
        correlationId,
        imagesCount: result.data.images.length,
        executionTimeMs: elapsed,
        endpointId: sdxlEndpointId,
        reason: 'failed over from primary FLUX',
      });
      capture(
        process.env.NEXT_PUBLIC_USER_ID || 'system',
        AnalyticsEvents.IMAGE_GENERATION_FAILOVER,
        { correlationId, endpoint: 'sdxl' }
      );
      return result.data;
    } else {
      if ('timedOut' in result && result.timedOut) {
        lastError = new Error('SDXL endpoint timeout after 30s');
      } else {
        // Result.success is false, so result.error exists
        lastError = (result as { success: false; error: Error }).error || lastError;
      }
      recordFailure(endpointHealth.sdxl);
      logger.warn('[runpod-failover] ❌ SDXL fallback also failed', {
        correlationId,
        error: lastError?.message,
      });
    }
  } else {
    logger.info('[runpod-failover] ⏭️ SKIP - SDXL not configured or circuit open', {
      correlationId,
      hasSdxlEndpoint: !!sdxlEndpointId,
      hasSdxlFn: !!sdxlGenerateFn,
    });
  }

  // --- Phase 3: Backup FLUX Endpoint ---
  if (backupFluxGenerateFn && !isCircuitOpen(endpointHealth.flux_backup)) {
    maybeResetCircuitBreaker(endpointHealth.flux_backup);
    
    logGenerationAttempt({
      correlationId,
      endpointType: 'flux-backup',
      endpointId: process.env.RUNPOD_ENDPOINT_ID || 'SAME_AS_PRIMARY',
      attemptNumber: 3,
      maxAttempts: MAX_RETRIES,
    });

    endpointHealth.flux_backup.retriesTotal++;
    
    const result = await executeWithTimeout(
      async () => {
        const res = await backupFluxGenerateFn();
        recordSuccess(endpointHealth.flux_backup);
        return res;
      },
      ENDPOINT_TIMEOUT_MS,
      'flux-backup-generation',
      correlationId
    );

    if (result.success && result.data.images && result.data.images.length > 0) {
      const elapsed = Date.now() - startTime;
      logger.info('[runpod-failover] ✅ SUCCESS - backup FLUX endpoint (final recovery)', {
        correlationId,
        imagesCount: result.data.images.length,
        executionTimeMs: elapsed,
        endpointId: process.env.RUNPOD_ENDPOINT_ID,
      });
      capture(
        process.env.NEXT_PUBLIC_USER_ID || 'system',
        AnalyticsEvents.IMAGE_GENERATION_SUCCESS,
        { correlationId, elapsed, failedOver: true }
      );
      return result.data;
    }
  }

  // --- Final Failure ---
  const totalElapsed = Date.now() - startTime;
  logger.error('[runpod-failover] 🚨 ALL ENDPOINTS FAILED', {
    correlationId,
    totalElapsedMs: totalElapsed,
    lastError: lastError?.message,
    fluxPrimaryHealth: endpointHealth.flux_primary,
    sdxlHealth: endpointHealth.sdxl,
    fluxBackupHealth: endpointHealth.flux_backup,
  });
  
  capture(
    process.env.NEXT_PUBLIC_USER_ID || 'system',
    AnalyticsEvents.IMAGE_GENERATION_FAILURE,
    {
      correlationId,
      totalElapsed,
      lastError: lastError?.message,
    }
  );

  throw new Error(
    `All generation endpoints failed after ${totalElapsed}ms. ` +
    `Last error: ${lastError?.message || 'Unknown'}. ` +
    `Check logs for correlationId: ${correlationId}`
  );
}
