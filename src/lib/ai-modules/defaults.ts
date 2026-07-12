/**
 * Market-aligned defaults for Soulmate9 (NSFW companion + portrait FLUX).
 * Aligned with: Free cheap SFW / Pro NSFW self-host / Image as token monetization.
 */
import type { AiModulesConfig } from './types';

export const AI_MODULES_SETTINGS_KEY = 'ai_modules';

export function createDefaultAiModules(): AiModulesConfig {
  const now = new Date().toISOString();

  return {
    version: 1,
    updated_at: now,
    endpoints: [
      {
        id: 'together-llama-8b',
        label: 'Together Llama 3.1 8B (Free SFW)',
        provider: 'together',
        model_id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        api_base_url: 'https://api.together.xyz/v1',
        api_key_env: 'TOGETHER_API_KEY',
        temperature: 0.85,
        max_tokens: 512,
        cost_per_1k_input: 0.0001,
        cost_per_1k_output: 0.0001,
        nsfw_capable: false,
        notes: 'Cheap SFW chat for free tier',
      },
      {
        id: 'together-llama-70b',
        label: 'Together Llama 3.3 70B (Pro SFW)',
        provider: 'together',
        model_id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        api_base_url: 'https://api.together.xyz/v1',
        api_key_env: 'TOGETHER_API_KEY',
        temperature: 0.85,
        max_tokens: 1536,
        cost_per_1k_input: 0.00088,
        cost_per_1k_output: 0.00088,
        nsfw_capable: false,
        notes: 'High quality SFW roleplay',
      },
      {
        id: 'runpod-lumimaid-8b',
        label: 'RunPod Lumimaid 8B (NSFW)',
        provider: 'runpod',
        model_id: 'lumimaid-8b',
        api_base_url: null, // RUNPOD_VLLM_URL
        api_key_env: 'RUNPOD_VLLM_API_KEY',
        temperature: 0.9,
        max_tokens: 1024,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
        nsfw_capable: true,
        notes: 'Uncensored NSFW RP · GPU second billing',
      },
      {
        id: 'runpod-noromaid-12b',
        label: 'RunPod Noromaid 12B (Unlimited NSFW)',
        provider: 'runpod',
        model_id: 'noromaid-12b',
        api_base_url: null,
        api_key_env: 'RUNPOD_VLLM_API_KEY',
        temperature: 0.9,
        max_tokens: 1536,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
        nsfw_capable: true,
        notes: 'Higher quality NSFW for Unlimited',
      },
      {
        id: 'together-mini-emotion',
        label: 'Together 8B Emotion/Meta',
        provider: 'together',
        model_id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
        api_base_url: 'https://api.together.xyz/v1',
        api_key_env: 'TOGETHER_API_KEY',
        temperature: 0.15,
        max_tokens: 128,
        cost_per_1k_input: 0.0001,
        cost_per_1k_output: 0.0001,
        nsfw_capable: false,
        notes: 'Classification / short JSON tasks',
      },
      {
        id: 'flux-portrait',
        label: 'RunPod FLUX Portrait',
        provider: 'runpod',
        model_id: 'flux1-dev-fp8',
        api_base_url: null,
        api_key_env: 'RUNPOD_API_KEY',
        temperature: 0,
        max_tokens: 0,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
        nsfw_capable: true,
        notes: 'ComfyUI FLUX image endpoint',
      },
    ],
    chat: {
      enabled: true,
      nsfw_min_intimacy: 3,
      nsfw_detection: 'keywords',
      fallback_endpoint_id: 'together-llama-8b',
      global_system_suffix:
        'Stay in character as the girlfriend. Never break role. Never claim to be an AI assistant. When the intimate/NSFW channel is active, lean into consensual adult desire with sensory detail and end replies with a hook that invites the next message. Refuse underage content. Match language rules (English sessions: English only, no Chinese).',
      tiers: {
        free: {
          sfw_endpoint_id: 'together-llama-8b',
          nsfw_endpoint_id: null,
          max_tokens: 512,
          context_messages: 10,
          daily_message_limit: 40,
          allow_nsfw: false,
        },
        pro: {
          sfw_endpoint_id: 'together-llama-70b',
          nsfw_endpoint_id: 'runpod-lumimaid-8b',
          max_tokens: 1024,
          context_messages: 24,
          // Competitor-aligned Pro chat cap (not marketing "unlimited")
          daily_message_limit: 300,
          allow_nsfw: true,
        },
        unlimited: {
          sfw_endpoint_id: 'together-llama-70b',
          nsfw_endpoint_id: 'runpod-noromaid-12b',
          max_tokens: 1536,
          context_messages: 40,
          // Unlimited chat (null = no daily cap); images/TTS remain cost levers
          daily_message_limit: null,
          allow_nsfw: true,
        },
      },
    },
    image: {
      enabled: true,
      runpod_endpoint_env: 'RUNPOD_ENDPOINT_ID',
      runpod_api_key_env: 'RUNPOD_API_KEY',
      // FLUX: empty/minimal negative preferred (long SD negatives → black frames)
      default_negative: '',
      free_daily_images: 3,
      // Images remain the main GPU cost lever; Free gets a small trial allowance.
      pro_daily_images: 10,
      unlimited_daily_images: 50,
      scenes: {
        girlfriend_portrait: {
          endpoint_id: 'flux-portrait',
          width: 768,
          height: 1152,
          steps: 20,
          cfg: 1.0,
          count: 2,
          token_cost: 0, // admin
          use_consistency_default: true,
          allow_llm_prompt_polish: true,
        },
        chat_selfie: {
          endpoint_id: 'flux-portrait',
          width: 704,
          height: 960,
          steps: 16,
          cfg: 1.0,
          count: 1,
          token_cost: 25,
          use_consistency_default: true,
          allow_llm_prompt_polish: false,
        },
        outfit_prop: {
          endpoint_id: 'flux-portrait',
          width: 1024,
          height: 1024,
          steps: 24,
          cfg: 1.0,
          count: 4,
          token_cost: 0,
          use_consistency_default: false,
          allow_llm_prompt_polish: true,
        },
        shop_item: {
          endpoint_id: 'flux-portrait',
          width: 1024,
          height: 1024,
          steps: 22,
          cfg: 1.0,
          count: 4,
          token_cost: 0,
          use_consistency_default: false,
          allow_llm_prompt_polish: true,
        },
        admin_batch: {
          endpoint_id: 'flux-portrait',
          width: 832,
          height: 1216,
          steps: 24,
          cfg: 1.0,
          count: 1,
          token_cost: 0,
          use_consistency_default: false,
          allow_llm_prompt_polish: false,
        },
      },
    },
    language: {
      enabled: true,
      default_locale: 'en',
      fallback_locale: 'en',
      supported_locales: ['en', 'zh', 'ja', 'ko', 'es', 'fr', 'de', 'pt', 'ru'],
      force_reply_language: true,
      auto_detect: true,
      reply_instructions: {
        en:
          'LANGUAGE LOCK: Reply in natural modern English only. ' +
          'Do not use Chinese characters. Do not switch to Chinese, Japanese, or Korean. ' +
          'International/Nordic English is fine. Only match another language if the user clearly wrote their full message in that language.',
        zh:
          '语言锁定：请用自然流畅的简体中文回复。正文不要整段英文。' +
          '除非用户明确要求其他语言或整段使用其他语言，否则保持中文。',
        ja: 'ユーザーが他の言語を指定しない限り、自然な日本語で返答してください。',
        ko: '사용자가 다른 언어를 요청하지 않는 한 자연스러운 한국어로 답하세요.',
        es: 'Responde en español natural salvo que el usuario pida otro idioma.',
        fr: 'Réponds en français naturel sauf si l’utilisateur demande une autre langue.',
        de: 'Antworte auf natürlichem Deutsch, sofern der Nutzer keine andere Sprache verlangt.',
        pt: 'Responda em português natural, a menos que o usuário peça outro idioma.',
        ru: 'Отвечай на естественном русском, если пользователь не просит другой язык.',
      },
    },
  };
}
