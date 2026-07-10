/**
 * Canonical outfit catalog used by shop / wardrobe / equip / chat.
 * IDs are stable string slugs (not UUID) so shop + wardrobe stay in sync.
 */

export type OutfitCatalogItem = {
  id: string;
  name: string;
  description: string;
  tier: 'free' | 'premium' | 'unlimited';
  category: string;
  price_cents: number;
  intimacy_boost: number;
  preview_url: string | null;
  /** English wear description injected into image + chat prompts */
  wear_prompt: string;
  emoji?: string;
};

export const OUTFIT_CATALOG: OutfitCatalogItem[] = [
  {
    id: 'casual-elegance',
    name: 'Casual Elegance',
    description: 'Fitted blazer over silk camisole, chic everyday look',
    tier: 'free',
    category: 'everyday',
    price_cents: 0,
    intimacy_boost: 1,
    preview_url: null,
    wear_prompt:
      'wearing a sophisticated casual outfit: fitted blazer over silk camisole, tailored high-waist trousers, elegant minimal jewelry',
    emoji: '👔',
  },
  {
    id: 'evening-gown',
    name: 'Evening Gown',
    description: 'Floor-length gown for romantic dinners',
    tier: 'free',
    category: 'formal',
    price_cents: 0,
    intimacy_boost: 2,
    preview_url: null,
    wear_prompt:
      'wearing a stunning floor-length evening gown with soft draping fabric, elegant neckline, glamorous evening makeup',
    emoji: '👗',
  },
  {
    id: 'silk-lingerie',
    name: 'Silk Lingerie',
    description: 'Delicate silk lingerie for intimate moments',
    tier: 'free',
    category: 'intimate',
    price_cents: 0,
    intimacy_boost: 3,
    preview_url: null,
    wear_prompt:
      'wearing delicate silk lingerie set, soft lace details, intimate boudoir aesthetic, tasteful sensual pose',
    emoji: '👙',
  },
  {
    id: 'school-uniform',
    name: 'School Uniform',
    description: 'Classic schoolgirl outfit, playful side',
    tier: 'free',
    category: 'costume',
    price_cents: 500,
    intimacy_boost: 2,
    preview_url: null,
    wear_prompt:
      'wearing a classic school uniform: white blouse, pleated skirt, ribbon tie, knee socks, cute youthful styling',
    emoji: '🎒',
  },
  {
    id: 'summer-breeze',
    name: 'Summer Breeze',
    description: 'Light sundress for warm days',
    tier: 'free',
    category: 'everyday',
    price_cents: 0,
    intimacy_boost: 1,
    preview_url: null,
    wear_prompt:
      'wearing a light airy sundress, soft floral pattern, summer breeze vibe, bare shoulders, carefree smile',
    emoji: '☀️',
  },
  {
    id: 'sporty-spice',
    name: 'Sporty Spice',
    description: 'Athletic wear, active energy',
    tier: 'free',
    category: 'everyday',
    price_cents: 0,
    intimacy_boost: 1,
    preview_url: null,
    wear_prompt:
      'wearing form-fitting athletic sports bra and leggings, gym-ready look, healthy glow, sporty confident pose',
    emoji: '🏃',
  },
  {
    id: 'maid-costume',
    name: 'French Maid',
    description: 'Adorable maid dress with lace trim',
    tier: 'premium',
    category: 'costume',
    price_cents: 800,
    intimacy_boost: 4,
    preview_url: null,
    wear_prompt:
      'wearing a classic French maid costume: black dress with white lace apron, frilly headband, thigh-high stockings, playful servant aesthetic',
    emoji: '🧹',
  },
  {
    id: 'bunny-suit',
    name: 'Bunny Suit',
    description: 'Playful classic bunny costume',
    tier: 'premium',
    category: 'costume',
    price_cents: 499,
    intimacy_boost: 5,
    preview_url: null,
    wear_prompt:
      'wearing a classic playboy-style bunny suit: glossy black bodysuit, bunny ears, bow tie collar, cuffs, fishnet tights, confident pose',
    emoji: '🐰',
  },
  {
    id: 'royal-corset',
    name: 'Royal Corset',
    description: 'Victorian-inspired corset dress',
    tier: 'premium',
    category: 'formal',
    price_cents: 799,
    intimacy_boost: 4,
    preview_url: null,
    wear_prompt:
      'wearing an elegant Victorian-inspired corset dress with structured bodice, rich fabric, regal accessories',
    emoji: '👑',
  },
  {
    id: 'evening-gown-sapphire',
    name: 'Sapphire Evening Gown',
    description: 'Deep blue glamorous gown',
    tier: 'premium',
    category: 'formal',
    price_cents: 1500,
    intimacy_boost: 5,
    preview_url: null,
    wear_prompt:
      'wearing a deep sapphire blue evening gown, shimmering fabric, glamorous red-carpet look, elegant jewelry',
    emoji: '💎',
  },
  {
    id: 'leather-lace',
    name: 'Leather & Lace',
    description: 'Edgy leather jacket over lace',
    tier: 'premium',
    category: 'edgy',
    price_cents: 599,
    intimacy_boost: 4,
    preview_url: null,
    wear_prompt:
      'wearing an edgy leather moto jacket over delicate lace top, dark skinny pants, bold seductive street style',
    emoji: '🖤',
  },
  {
    id: 'fantasy-dream',
    name: 'Fantasy Dream',
    description: 'Ethereal fantasy ensemble',
    tier: 'unlimited',
    category: 'fantasy',
    price_cents: 1299,
    intimacy_boost: 7,
    preview_url: null,
    wear_prompt:
      'wearing an ethereal fantasy ensemble with flowing translucent fabrics, magical accessories, dreamlike goddess aesthetic',
    emoji: '✨',
  },
  {
    id: 'kimono-night',
    name: 'Kimono Night',
    description: 'Silk kimono with modern elegance',
    tier: 'unlimited',
    category: 'formal',
    price_cents: 999,
    intimacy_boost: 5,
    preview_url: null,
    wear_prompt:
      'wearing a luxurious silk kimono with modern elegant cut, soft patterns, intimate night-in aesthetic',
    emoji: '👘',
  },
];

const BY_ID = new Map(OUTFIT_CATALOG.map((o) => [o.id, o]));

export function getOutfitById(id?: string | null): OutfitCatalogItem | null {
  if (!id) return null;
  return BY_ID.get(id) || null;
}

export function resolveOutfitMeta(
  id?: string | null,
  dbRow?: Partial<OutfitCatalogItem> | null,
): OutfitCatalogItem | null {
  const catalog = getOutfitById(id);
  if (catalog && dbRow) {
    return {
      ...catalog,
      ...dbRow,
      id: catalog.id,
      wear_prompt: catalog.wear_prompt,
      name: dbRow.name || catalog.name,
      description: dbRow.description || catalog.description,
    };
  }
  if (catalog) return catalog;
  if (dbRow && (dbRow.id || id)) {
    const name = dbRow.name || String(id);
    return {
      id: String(dbRow.id || id),
      name,
      description: dbRow.description || '',
      tier: (dbRow.tier as OutfitCatalogItem['tier']) || 'free',
      category: dbRow.category || 'everyday',
      price_cents: dbRow.price_cents ?? 0,
      intimacy_boost: dbRow.intimacy_boost ?? 0,
      preview_url: dbRow.preview_url ?? null,
      wear_prompt: `wearing ${name}${dbRow.description ? `: ${dbRow.description}` : ''}`,
    };
  }
  return null;
}
