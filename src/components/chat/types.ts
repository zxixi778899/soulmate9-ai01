export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  is_proactive?: boolean;
  media_url?: string | null;
  /** image | audio | video */
  media_type?: string | null;
  status?: 'sending' | 'sent' | 'read' | 'failed';
};

export type ChatGirlfriend = {
  id: string;
  name: string;
  avatar_url: string | null;
  portrait_url?: string | null;
  image_url?: string | null;
  personality: string | null;
  backstory?: string | null;
  age?: number | null;
  occupation?: string | null;
  hobbies?: string | string[] | null;
  /** Catalog base closeness 0–100 */
  base_intimacy?: number | null;
  /** 热情值 50–100: cold / warm / wild */
  base_desire?: number | null;
  /** 开发值 50–100: clingy / proactive NSFW / direct seduction */
  base_development?: number | null;
  /** 变态值 50–100: vanilla / thrills / kinky */
  base_kink?: number | null;
  appearance_race?: string;
  appearance_hair?: string;
  appearance_hair_color?: string;
  appearance_eyes?: string;
  appearance_body?: string;
  appearance_style?: string;
  character_card?: Record<string, unknown> | null;
};

export type IntimacyData = {
  score: number;
  level: number;
  daily_score_gained: number;
};

export type StreamRow =
  | { type: 'date'; key: string; label: string }
  | { type: 'msg'; key: string; msg: ChatMessage; showAvatar: boolean; merged: boolean };

export const CHAT_MOODS = ['romantic', 'playful', 'sweet', 'passionate', 'cozy', 'cheerful'] as const;
export const CHAT_POSES = ['sitting', 'standing', 'lying_down', 'walking', 'dancing', 'close_up'] as const;
export const CHAT_ENVS = ['bedroom', 'beach', 'garden', 'city', 'cozy_room', 'outdoor'] as const;
