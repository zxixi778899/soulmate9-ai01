/**
 * Full-site AI module configuration (chat / image / language).
 * Persisted under site_settings.key = 'ai_modules' (JSON) with file fallback.
 */

export type MembershipTier = 'free' | 'basic' | 'pro' | 'unlimited' | 'admin';

export type ChatChannel = 'sfw' | 'nsfw';
export type QualityTier = 'economy' | 'standard' | 'premium';
export type ModelCapability = 'classification' | 'chat' | 'long_context' | 'image' | 'image_edit' | 'multi_reference' | 'nsfw';

export type ProviderId =
  | 'together'
  | 'runpod'
  | 'openai'
  | 'coze'
  | 'anthropic'
  | 'local';

/** One callable model endpoint */
export interface ModelEndpoint {
  id: string;
  label: string;
  provider: ProviderId;
  model_id: string;
  api_base_url?: string | null;
  api_base_env?: string | null;
  api_key_env?: string | null;
  temperature: number;
  max_tokens: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  nsfw_capable: boolean;
  capabilities?: ModelCapability[];
  priority?: number;
  timeout_ms?: number;
  retry_count?: number;
  fallback_ids?: string[];
  circuit_breaker?: { failure_threshold: number; reset_ms: number };
  cost_budget?: Partial<Record<'free' | 'pro' | 'unlimited', number>>;
  health_status?: 'healthy' | 'degraded' | 'disabled';
  quality_tier?: QualityTier;
  notes?: string;
}

export interface TierChatRoute {
  /** SFW daily chat */
  sfw_endpoint_id: string;
  /** NSFW roleplay (must be nsfw_capable) */
  nsfw_endpoint_id: string | null;
  default_endpoint_id?: string;
  complex_endpoint_id?: string;
  fallback_endpoint_ids?: string[];
  max_tokens: number;
  context_messages: number;
  daily_message_limit: number | null; // null = unlimited
  daily_cost_soft_limit_usd?: number;
  allow_nsfw: boolean;
}

export interface ChatModuleConfig {
  enabled: boolean;
  classifier_endpoint_id?: string;
  complexity_threshold?: number;
  /** Min intimacy level (1-6) to unlock NSFW channel for pro+ */
  nsfw_min_intimacy: number;
  /** Keyword / heuristic threshold label */
  nsfw_detection: 'keywords' | 'off';
  fallback_endpoint_id: string;
  tiers: Record<'free' | 'basic' | 'pro' | 'unlimited', TierChatRoute>;
  /** Extra system rules appended to every chat */
  global_system_suffix: string;
}

export interface ImageSceneConfig {
  endpoint_id: string; // logical image endpoint id
  width: number;
  height: number;
  steps: number;
  cfg: number;
  count: number;
  token_cost: number;
  use_consistency_default: boolean;
  allow_llm_prompt_polish: boolean;
  tier_endpoint_ids?: Partial<Record<'free' | 'pro' | 'unlimited', string>>;
  adult_endpoint_ids?: Partial<Record<'pro' | 'unlimited', string>>;
  fallback_endpoint_ids?: string[];
  quality_tier?: QualityTier;
  reference_mode?: 'none' | 'single' | 'multi';
  max_references?: number;
  retry_policy?: { max_attempts: number; lower_quality_on_retry: boolean; similarity_retry: boolean };
  adult_capable?: boolean;
  ckpt_name?: string | null;
  lora_name?: string | null;
  lora_strength_model?: number;
  lora_strength_clip?: number;
  sampler_name?: string | null;
  scheduler?: string | null;
  daily_limit_override?: number | null;
}

export interface ImageModuleConfig {
  enabled: boolean;
  /** RunPod Comfy / FLUX endpoint env keys */
  runpod_endpoint_env: string;
  runpod_api_key_env: string;
  default_negative: string;
  scenes: {
    girlfriend_portrait: ImageSceneConfig;
    chat_selfie: ImageSceneConfig;
    outfit_prop: ImageSceneConfig;
    shop_item: ImageSceneConfig;
    admin_batch: ImageSceneConfig;
  };
  free_daily_images: number;
  pro_daily_images: number | null;
  unlimited_daily_images: number | null;
  /** Optional per-scene endpoint env override (key = scene name). */
  scene_endpoint_env?: Partial<Record<keyof ImageModuleConfig['scenes'], string>>;
}

export type AppLocale = 'en' | 'zh' | 'ja' | 'ko' | 'es' | 'fr' | 'de' | 'pt' | 'ru';

export interface LanguageModuleConfig {
  enabled: boolean;
  default_locale: AppLocale;
  supported_locales: AppLocale[];
  /** Force LLM replies in user preferred language */
  force_reply_language: boolean;
  /** Locale → instruction snippet for system prompt */
  reply_instructions: Partial<Record<AppLocale, string>>;
  /** UI i18n fallback when missing translation */
  fallback_locale: AppLocale;
  /** Auto-detect from Accept-Language if user has no pref */
  auto_detect: boolean;
}

export interface AiModulesConfig {
  version: number;
  updated_at: string;
  endpoints: ModelEndpoint[];
  chat: ChatModuleConfig;
  image: ImageModuleConfig;
  language: LanguageModuleConfig;
}

export interface ResolveChatContext {
  tier: MembershipTier;
  intimacyLevel?: number;
  message?: string;
  preferNsfw?: boolean;
  locale?: AppLocale | string;
  userId?: string;
  rolloutPercent?: number;
  memoryCount?: number;
  contextMessageCount?: number;
  dailyCostUsd?: number;
  adultCharacterVerified?: boolean;
}

export interface ResolvedChatCall {
  channel: ChatChannel;
  endpoint: ModelEndpoint;
  fallbackChain: ModelEndpoint[];
  routeReason: string;
  estimatedCost: number;
  qualityTier: QualityTier;
  complexityScore: number;
  temperature: number;
  maxTokens: number;
  contextMessages: number;
  systemLanguageSuffix: string;
  allowNsfw: boolean;
  blockedReason?: string;
}

export interface ResolveImageContext {
  scene: keyof ImageModuleConfig['scenes'];
  tier: MembershipTier;
  adult?: boolean;
}

export interface ResolvedImageCall {
  scene: keyof ImageModuleConfig['scenes'];
  config: ImageSceneConfig;
  runpodEndpointEnv: string;
  runpodApiKeyEnv: string;
  defaultNegative: string;
  tokenCost: number;
  endpointId: string;
  logicalEndpointId: string;
  fallbackChain: string[];
  routeReason: string;
  estimatedCost: number;
  qualityTier: QualityTier;
  referenceMode: 'none' | 'single' | 'multi';
  maxReferences: number;
  apiKeyPresent: boolean;
  dailyLimit: number | null;
  enabled: boolean;
  blockedReason?: string;
}
