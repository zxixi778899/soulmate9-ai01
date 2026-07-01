/**
 * LLM Router — Intelligent Model Selection Service
 *
 * Analyzes user intent/message content and automatically routes
 * to the optimal model for each task type, similar to Coze's skill system.
 *
 * Task Types:
 * - chat: General conversation (lightweight model)
 * - emotion_detection: Detect user emotion (mini model, fast)
 * - metadata_generation: Generate girlfriend descriptions/tags (pro model)
 * - prompt_optimization: Optimize prompts for image generation (pro model)
 * - image_generation: Generate images (RunPod FLUX)
 * - complex_reasoning: Deep reasoning tasks (thinking mode)
 */

import fs from 'fs';

export type TaskType =
  | 'chat'
  | 'emotion_detection'
  | 'metadata_generation'
  | 'prompt_optimization'
  | 'image_generation'
  | 'complex_reasoning';

export interface RouterDecision {
  taskType: TaskType;
  modelId: string;
  temperature: number;
  thinking: 'enabled' | 'disabled';
  description: string;
}

const CONFIG_PATH = '/tmp/llm_router_config.json';

/**
 * Load persisted model config, falling back to defaults
 */
function loadModelConfig(): Record<string, string> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {}
  return {};
}

// Available models (mapped by capability)
const MODEL_MAP: Record<string, { id: string; capability: string; cost: 'low' | 'medium' | 'high' }> = {
  'doubao-seed-2-0-lite-260215': { id: 'doubao-seed-2-0-lite-260215', capability: 'fast_chat', cost: 'low' },
  'doubao-seed-2-0-pro-260215': { id: 'doubao-seed-2-0-pro-260215', capability: 'complex', cost: 'medium' },
  'deepseek-v3-2-251201': { id: 'deepseek-v3-2-251201', capability: 'reasoning', cost: 'medium' },
  'kimi-k2-5-260127': { id: 'kimi-k2-5-260127', capability: 'agent', cost: 'high' },
  'doubao-seed-2-0-mini-260215': { id: 'doubao-seed-2-0-mini-260215', capability: 'fast_chat', cost: 'low' },
};

// Intent detection patterns
const INTENT_PATTERNS: { pattern: RegExp; task: TaskType; priority: number }[] = [
  // Image generation requests
  { pattern: /(generate|create|make|draw|render|show me)\s.*(picture|image|photo|selfie|art|pic|portrait)/i, task: 'image_generation', priority: 10 },
  { pattern: /(send me|take|snap|shoot)\s.*(selfie|photo|picture|pic)/i, task: 'image_generation', priority: 10 },
  { pattern: /(what do I look|how do I|can you see|look at)\s/i, task: 'image_generation', priority: 9 },

  // Complex reasoning
  { pattern: /(why|how does|explain|analyze|compare|difference|reason|logic)/i, task: 'complex_reasoning', priority: 5 },
  { pattern: /(math|calculate|solve|equation|formula|proof)/i, task: 'complex_reasoning', priority: 6 },

  // Default to chat
  { pattern: /.*/i, task: 'chat', priority: 0 },
];

/**
 * Detect user intent from message
 */
export function detectIntent(message: string): TaskType {
  let bestMatch: { task: TaskType; priority: number } = { task: 'chat', priority: 0 };

  for (const { pattern, task, priority } of INTENT_PATTERNS) {
    if (pattern.test(message) && priority > bestMatch.priority) {
      bestMatch = { task, priority };
    }
  }

  return bestMatch.task;
}

/**
 * Get the task type from a message, considering context
 */
export function getTaskType(
  message: string,
  context?: { recentMessages?: string[]; girlfriendId?: string },
): TaskType {
  // Check for explicit image generation intent in current message
  const intent = detectIntent(message);

  // If context shows last few messages were about images, route accordingly
  if (intent === 'chat' && context?.recentMessages) {
    const recentContext = context.recentMessages.join(' ').toLowerCase();
    if (/(selfie|photo|picture|image|generate|show me)/i.test(recentContext)) {
      // If recent context is about images but current message is "yes" or "ok", keep as chat
      if (/^(yes|yeah|ok|okay|sure|go ahead|do it|please)/i.test(message.trim())) {
        return 'image_generation';
      }
    }
  }

  return intent;
}

/**
 * Route to the best model for the given task
 * Reads from admin-configured model settings, falls back to defaults
 */
export function routeToModel(
  taskType: TaskType,
  userTier?: 'free' | 'premium' | 'admin',
): RouterDecision {
  const isPremium = userTier === 'premium' || userTier === 'admin';
  const cfg = loadModelConfig();

  const configModel = (key: string, fallback: string) => cfg[key] || fallback;
  const configTemp = (key: string, fallback: number) => {
    const v = cfg[key];
    return v ? parseFloat(v) : fallback;
  };

  switch (taskType) {
    case 'emotion_detection':
      return {
        taskType,
        modelId: configModel('emotion_detection_model', 'doubao-seed-2-0-mini-260215'),
        temperature: 0.1,
        thinking: 'disabled',
        description: 'Fast emotion detection — configured via admin',
      };

    case 'metadata_generation':
      return {
        taskType,
        modelId: configModel('metadata_generation_model', 'doubao-seed-2-0-pro-260215'),
        temperature: 0.7,
        thinking: 'disabled',
        description: 'Metadata generation — configured via admin',
      };

    case 'prompt_optimization':
      return {
        taskType,
        modelId: configModel('prompt_optimizer_model', 'doubao-seed-2-0-lite-260215'),
        temperature: 0.8,
        thinking: 'disabled',
        description: 'Prompt optimization — configured via admin',
      };

    case 'image_generation':
      return {
        taskType,
        modelId: configModel('chat_model', 'doubao-seed-2-0-pro-260215'),
        temperature: 0.9,
        thinking: 'disabled',
        description: 'Image generation routing — delegates to RunPod FLUX',
      };

    case 'complex_reasoning':
      return {
        taskType,
        modelId: isPremium ? 'deepseek-v3-2-251201' : configModel('chat_model', 'doubao-seed-2-0-pro-260215'),
        temperature: 0.5,
        thinking: 'enabled',
        description: isPremium
          ? 'Complex reasoning — DeepSeek V3 with thinking mode'
          : 'Complex reasoning — configured model with thinking mode',
      };

    case 'chat':
    default:
      return {
        taskType,
        modelId: configModel('chat_model', isPremium ? 'doubao-seed-2-0-pro-260215' : 'doubao-seed-2-0-lite-260215'),
        temperature: configTemp('chat_temperature', 0.85),
        thinking: 'disabled',
        description: isPremium
          ? 'Premium chat — configured model'
          : 'Standard chat — configured model',
      };
  }
}

/**
 * Full pipeline: detect intent → route to model → return config
 */
export function analyzeAndRoute(
  message: string,
  options?: {
    userTier?: 'free' | 'premium' | 'admin';
    context?: { recentMessages?: string[]; girlfriendId?: string };
  },
): RouterDecision {
  const taskType = getTaskType(message, options?.context);
  return routeToModel(taskType, options?.userTier);
}