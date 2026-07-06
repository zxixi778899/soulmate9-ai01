import { logger } from '@/lib/logger';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * Log an AI model invocation to ai_model_usage_logs.
 * Fire-and-forget: errors are logged but never thrown.
 */
export async function logModelUsage(params: {
  provider: string;
  model_id: string;
  task_type: string;
  user_id?: string;
  girlfriend_id?: string;
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
  cost_usd?: number;
  success?: boolean;
  error_message?: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('ai_model_usage_logs').insert({
      provider: params.provider,
      model_id: params.model_id,
      task_type: params.task_type,
      user_id: params.user_id || null,
      girlfriend_id: params.girlfriend_id || null,
      input_tokens: params.input_tokens || 0,
      output_tokens: params.output_tokens || 0,
      latency_ms: params.latency_ms || 0,
      cost_usd: params.cost_usd || 0,
      success: params.success !== false,
      error_message: params.error_message || null,
    });
    if (error) {
      logger.warn('[model-usage] insert failed', { error: error.message });
    }
  } catch (err) {
    logger.warn('[model-usage] unexpected error', { err: String(err) });
  }
}

/**
 * Estimate token count from text (rough: ~4 chars per token).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost based on input/output tokens and per-1K rates.
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  costPer1kInput: number,
  costPer1kOutput: number,
): number {
  return (inputTokens / 1000) * costPer1kInput + (outputTokens / 1000) * costPer1kOutput;
}
