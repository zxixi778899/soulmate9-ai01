export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  is_proactive?: boolean;
  media_url?: string | null;
  status?: 'sending' | 'sent' | 'read' | 'failed';
};

export type ChatGirlfriend = {
  id: string;
  name: string;
  avatar_url: string | null;
  portrait_url?: string | null;
  image_url?: string | null;
  personality: string | null;
  appearance_race?: string;
  appearance_hair?: string;
  appearance_hair_color?: string;
  appearance_eyes?: string;
  appearance_body?: string;
  appearance_style?: string;
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
