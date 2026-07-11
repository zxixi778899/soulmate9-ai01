/**
 * Full-site AI module configuration (chat / image / language).
 * Persisted under site_settings.key = 'ai_modules' (JSON) with file fallback.
 */

export type MembershipTier = 'free' | 'pro' | 'unlimited' | 'admin';

export type ChatChannel = 'sfw' | 'nsfw';

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
  api_key_env?: string | null;
  temperature: number;
  max_tokens: number;
  cost_per_1k_input: number;
  cost_per_1k_output: number;
  nsfw_capable: boolean;
  notes?: string;
}

export interface TierChatRoute {
  /** SFW daily chat */
  sfw_endpoint_id: string;
  /** NSFW roleplay (must be nsfw_capable) */
  nsfw_endpoint_id: string | null;
  max_tokens: number;
  context_messages: number;
  daily_message_limit: number | null; // null = unlimited
  allow_nsfw: boolean;
}

export interface ChatModuleConfig {
  enabled: boolean;
  /** Min intimacy level (1-6) to unlock NSFW channel for pro+ */
  nsfw_min_intimacy: number;
  /** Keyword / heuristic threshold label */
  nsfw_detection: 'keywords' | 'off';
  fallback_endpoint_id: string;
  tiers: Record<'free' | 'pro' | 'unlimited', TierChatRoute>;
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
}

export interface ResolvedChatCall {
  channel: ChatChannel;
  endpoint: ModelEndpoint;
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
}

export interface ResolvedImageCall {
  scene: keyof ImageModuleConfig['scenes'];
  config: ImageSceneConfig;
  runpodEndpointEnv: string;
  runpodApiKeyEnv: string;
  defaultNegative: string;
  tokenCost: number;
  endpointId: string;
  apiKeyPresent: boolean;
  dailyLimit: number | null;
  enabled: boolean;
  blockedReason?: string;
}
