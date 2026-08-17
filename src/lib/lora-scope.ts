import type { CompanionCategory } from '@/lib/companion-category';
import type { ImageModelFamily, ImageSurface } from '@/lib/image-generation-routing';

export type ScopedLora = {
  id?: string;
  filename?: string;
  category?: string;
  base_model?: string;
};

function inferFamily(lora: ScopedLora): ImageModelFamily {
  const value = `${lora.base_model || ''} ${lora.filename || ''}`.toLowerCase();
  if (value.includes('illustrious')) return 'illustrious';
  if (value.includes('pony')) return 'pony';
  return 'flux';
}

export function isLoraAllowedForContext(
  lora: ScopedLora,
  context: {
    surface: ImageSurface;
    category?: CompanionCategory;
    modelFamily: ImageModelFamily;
  },
): boolean {
  if (!lora.id || lora.id === 'none') return true;
  if (inferFamily(lora) !== context.modelFamily) return false;

  const id = `${lora.id} ${lora.filename || ''}`.toLowerCase();
  const category = String(lora.category || 'style').toLowerCase();

  if (context.surface === 'outfit') return category === 'outfit';
  if (context.surface === 'prop') return category === 'prop';
  if (context.surface === 'advert') return category === 'style' && /photo|cinematic|advert|product/.test(id);
  if (!['body', 'action', 'detail', 'style'].includes(category)) return false;

  // 词边界匹配：避免 female 被 /male/ 误判、woman 被 /man/ 误判、transition 之外的词被 /trans/ 波及。
  if (/\bmasc\b|\bmale\b|\bman\b|\bmasculine\b/.test(id)) return context.category === 'male';
  if (/curvy|pear|\bfemale\b|\bwoman\b|\bfeminine\b/.test(id)) return context.category === 'female';
  if (/\btrans\b|transgender|transition|futa|\bmtf\b/.test(id)) return context.category === 'transgender';
  return true;
}
