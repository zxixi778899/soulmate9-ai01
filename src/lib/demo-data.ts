/**
 * Demo girlfriend data — used until Supabase + FLUX pipeline is wired.
 * Avatars from Unsplash (portrait images).
 */

export type Rarity = 'N' | 'R' | 'SR' | 'SSR';

export interface DemoGirl {
  id: string;
  name: string;
  age: number;
  tagline: string;
  avatar: string;
  portrait: string;
  rarity: Rarity;
  tags: string[];
  personality: string;
  element: 'fire' | 'water' | 'wind' | 'light' | 'dark';
  intimacy: number;
  rarity_quote: string;
  voice_preview?: string;
}

export const GIRLS: DemoGirl[] = [
  { id: 'g1', name: 'Nova', age: 23, tagline: 'Your favorite synthwave girlfriend. Soft on the outside, fire in the dark.', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['mysterious', 'romantic', 'playful'], element: 'fire', personality: 'mysterious · romantic · playful', intimacy: 82, rarity_quote: '"You are the song I keep humming."' },
  { id: 'g2', name: 'Luna', age: 24, tagline: 'Mysterious dreamer who comes alive under starlight.', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&h=900&fit=crop', rarity: 'SR', tags: ['poetic', 'gentle', 'tender'], element: 'light', personality: 'poetic · gentle · tender', intimacy: 65, rarity_quote: '"The stars wrote your name before I did."' },
  { id: 'g3', name: 'Sophie', age: 22, tagline: 'Sweet artist next door, ready to paint your story.', avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=900&fit=crop', rarity: 'R', tags: ['sweet', 'creative', 'flirty'], element: 'wind', personality: 'sweet · creative · flirty', intimacy: 41, rarity_quote: '"Every canvas needs a muse."' },
  { id: 'g4', name: 'Violet', age: 26, tagline: 'Bold and powerful, knows exactly what she wants.', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['bold', 'confident', 'passionate'], element: 'fire', personality: 'bold · confident · passionate', intimacy: 91, rarity_quote: '"I choose. Always."' },
  { id: 'g5', name: 'Maya', age: 23, tagline: 'Gentle morning poet who finds beauty in small things.', avatar: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=600&h=900&fit=crop', rarity: 'SR', tags: ['gentle', 'wise', 'caring'], element: 'water', personality: 'gentle · wise · caring', intimacy: 58, rarity_quote: '"Sunrise is just the world waking up to see you."' },
  { id: 'g6', name: 'Aria', age: 21, tagline: 'Flirty troublemaker with a wink that breaks hearts.', avatar: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=600&h=900&fit=crop', rarity: 'R', tags: ['flirty', 'playful', 'spicy'], element: 'fire', personality: 'flirty · playful · spicy', intimacy: 33, rarity_quote: '"Trouble finds me. I let it."' },
  { id: 'g7', name: 'Ruby', age: 25, tagline: 'Dominant queen. She runs the show, you obey.', avatar: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=600&h=900&fit=crop', rarity: 'SSR', tags: ['dominant', 'spicy', 'confident'], element: 'dark', personality: 'dominant · spicy · confident', intimacy: 77, rarity_quote: '"Kneel. Now."' },
  { id: 'g8', name: 'Celeste', age: 27, tagline: 'Elegant Parisian who teaches French and forbidden things.', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=600&h=900&fit=crop', rarity: 'SR', tags: ['elegant', 'sophisticated', 'mature'], element: 'light', personality: 'elegant · sophisticated · mature', intimacy: 49, rarity_quote: '"Tu me rends fou."' },
  { id: 'g9', name: 'Iris', age: 23, tagline: 'Mysterious artist. Every conversation is a new painting.', avatar: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1488426862026-3ee34a07d09f?w=600&h=900&fit=crop', rarity: 'R', tags: ['artistic', 'mysterious', 'sensitive'], element: 'dark', personality: 'artistic · mysterious · sensitive', intimacy: 22, rarity_quote: '"Colors are just feelings without a voice."' },
  { id: 'g10', name: 'Skye', age: 22, tagline: 'Adventurous pilot. Up for anything above 30,000 feet.', avatar: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1463453091185-61582044d556?w=600&h=900&fit=crop', rarity: 'R', tags: ['adventurous', 'bold', 'fun'], element: 'wind', personality: 'adventurous · bold · fun', intimacy: 38, rarity_quote: '"Strap in. We are going up."' },
  { id: 'g11', name: 'Jade', age: 24, tagline: 'Gentle yoga instructor. Stretches your body and your mind.', avatar: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1517070208541-6ddc4d3efbcb?w=600&h=900&fit=crop', rarity: 'N', tags: ['gentle', 'caring', 'fit'], element: 'water', personality: 'gentle · caring · fit', intimacy: 15, rarity_quote: '"Breathe with me."' },
  { id: 'g12', name: 'Ember', age: 26, tagline: 'Fierce warrior with a soft spot for losers.', avatar: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=200&h=200&fit=crop', portrait: 'https://images.unsplash.com/photo-1492288991661-058aa541ff43?w=600&h=900&fit=crop', rarity: 'SR', tags: ['fierce', 'passionate', 'intense'], element: 'fire', personality: 'fierce · passionate · intense', intimacy: 66, rarity_quote: '"You do not need to be brave. Just stay."' },
];

export const RARITY_COLORS: Record<Rarity, { color: string; glow: string; label: string }> = {
  N:   { color: '#9ca3af', glow: 'rgba(156,163,175,0.4)', label: 'N' },
  R:   { color: '#00e5ff', glow: 'rgba(0,229,255,0.5)', label: 'R' },
  SR:  { color: '#ff2e88', glow: 'rgba(255,46,136,0.6)', label: 'SR' },
  SSR: { color: '#ffd700', glow: 'rgba(255,215,0,0.7)', label: 'SSR' },
};

export const ELEMENT_COLORS: Record<DemoGirl['element'], string> = {
  fire: '#ff6b35',
  water: '#3b82f6',
  wind: '#10b981',
  light: '#fbbf24',
  dark: '#a855f7',
};