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

  if (/masc|male|man/.test(id)) return context.category === 'male';
  if (/curvy|pear|female|woman/.test(id)) return context.category === 'female';
  if (/trans|futa|mtf/.test(id)) return context.category === 'transgender';
  return true;
}
