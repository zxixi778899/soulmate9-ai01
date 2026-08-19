import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export class GenerationCacheStore {
  private supabase = getSupabaseClient();
  private tableName = 'generation_cache';
  
  async get(hash: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
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
  
  async set(hash: string, imageUrl: string, options: { prompt?: string; surface?: string } = {}): Promise<void> {
    try {
      await this.supabase
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
      
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .lt('created_at', cutoffDate.toISOString());
      
      if (error) return 0;
      
      const deleted = count || 0;
      
      await this.supabase
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
