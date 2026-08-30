import { getSupabaseClient } from '@/storage/database/supabase-client';
import { logger } from '@/lib/logger';

export type MembershipTier = 'free' | 'pro' | 'unlimited' | 'admin';

export class QuotaManager {
  private supabase = getSupabaseClient();

  async getMembership(userId: string): Promise<MembershipTier> {
    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('role, membership_tier')
        .eq('id', userId)
        .single();

      if (error) return 'free';
      const role = String(data?.role || '').toLowerCase();
      if (role === 'admin' || role === 'superadmin') return 'unlimited';
      return (data?.membership_tier as MembershipTier) || 'free';
    } catch (err) {
      logger.error('[QuotaManager] Unexpected error', { err });
      return 'free';
    }
  }
  
  async getDailyUsage(userId: string, feature: string): Promise<number> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await this.supabase
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
      
      await this.supabase
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
